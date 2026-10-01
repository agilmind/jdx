/**
 * La lista de confianza: las claves de los emisores, en un JWS con
 * serialización JSON general firmado por al menos dos de las raíces fijadas.
 *
 * - Se lee primero. El JWS tiene que ser `{ payload, signatures }` y cada firma
 *   `{ protected, signature }`, sin encabezado sin proteger ni otros miembros;
 *   el payload, base64url sin relleno de un texto I-JSON que cumple
 *   trust-list.schema.json, con instantes que existen en el calendario, cada
 *   kid una vez, cada clave un punto de P-256 con el kid de su huella RFC 7638
 *   y su `expiresAt` a lo sumo 2 años después de su `activeAt` (sumados como
 *   java.time, comparados en nanosegundos). Si no: JDX-ENV-001, y nada más.
 * - Después, las firmas: cuenta cada raíz fijada del entorno de la lista, no
 *   revocada en `revokedRoots`, cuya firma verifica con el encabezado
 *   protegido exacto `{ alg: "ES256", kid, typ: "vnd.jupiter.jdx-trust+jws" }`;
 *   una raíz cuenta una vez. Con menos de dos: JDX-ENV-003, y nada más.
 * - Con la lista leída y firmada, un resultado por cada otra falla: entorno
 *   distinto del de la validación (JDX-ENV-009), vencida por el reloj del
 *   validador (JDX-ENV-002, comparado en nanosegundos), `validator.minVersion`
 *   mayor que el validador (JDX-ENV-007) y, si la lista es del entorno de la
 *   validación y hay estado, `seq` menor que el `maxSeq` guardado
 *   (JDX-ENV-004; igual vale).
 *
 * El aviso de una lista por vencer (JDX-TRU-001) lo da la política, no esta
 * función.
 */
import { flattenedVerify } from 'jose';
import semver from 'semver';
import { addYears, parseInstant } from '../conventions/time.js';
import { parseJson } from '../json/parse.js';
import type {
  Env,
  Finding,
  GeneralJws,
  JsonValue,
  PinnedRoots,
  RootKey,
  SchemaValidators,
  TrustList,
  TrustListOutcome,
} from '../types.js';
import { ecThumbprint, isP256PublicKey } from './roots.js';

/** El `typ` de cada firma de la lista. */
export const TRUST_LIST_TYP = 'vnd.jupiter.jdx-trust+jws';

export interface VerifyTrustListOptions {
  env: Env;
  roots: PinnedRoots;
  now: Date;
  validatorVersion: string;
  maxSeq: number | null;                                   // el del estado; null sin estado
  validators: SchemaValidators;
}

const BASE64URL = /^[A-Za-z0-9_-]*$/u;
const NANOS_PER_MILLI = 1_000_000n;

export async function verifyTrustList(jws: Uint8Array, opts: VerifyTrustListOptions): Promise<TrustListOutcome> {
  const read = readTrustList(jws, opts.validators);
  if (read === null) return { ok: false, findings: [finding('JDX-ENV-001', { reason: 'invalid' })] };
  const { general, list } = read;
  const rootKids = await countedRoots(general, list, opts.roots[list.env]);
  if (rootKids.length < 2) return { ok: false, findings: [{ ruleId: 'JDX-ENV-003', instanceLocation: '' }] };

  const findings: Finding[] = [];
  if (list.env !== opts.env) findings.push(finding('JDX-ENV-009', { env: opts.env, listEnv: list.env }));
  const expiresAt = parseInstant(list.expiresAt) as NonNullable<ReturnType<typeof parseInstant>>;
  if (expiresAt.epochNanos < BigInt(opts.now.getTime()) * NANOS_PER_MILLI) {
    findings.push(finding('JDX-ENV-002', { expiresAt: list.expiresAt }));
  }
  if (semver.gt(list.validator.minVersion, opts.validatorVersion)) {
    findings.push(finding('JDX-ENV-007', { reason: 'minVersion', required: list.validator.minVersion, version: opts.validatorVersion }));
  }
  if (list.env === opts.env && opts.maxSeq !== null && list.seq < opts.maxSeq) {
    findings.push(finding('JDX-ENV-004', { seq: list.seq, maxSeq: opts.maxSeq }));
  }
  if (findings.length > 0) return { ok: false, findings };
  return { ok: true, trust: deepFreeze({ list, rootKids }) };
}

/** El JWS y la lista de su payload, si se pueden leer; null si no. */
function readTrustList(jws: Uint8Array, validators: SchemaValidators): { general: GeneralJws; list: TrustList } | null {
  const parsed = parseJson(jws);
  if (!parsed.ok || !isGeneralJws(parsed.json.value)) return null;
  const general = parsed.json.value;
  const payload = fromBase64url(general.payload);
  const content = payload === null ? null : parseJson(payload);
  if (content === null || !content.ok) return null;
  const value = content.json.value;
  if (validators.validateAux('trustList', value).length > 0) return null;
  const list = value as unknown as TrustList;
  return keysAreReadable(list) ? { general, list } : null;
}

/** Lo que el schema de la lista no puede decir: instantes del calendario, kids únicos y de su clave, y 2 años como máximo. */
function keysAreReadable(list: TrustList): boolean {
  if (parseInstant(list.issuedAt) === null || parseInstant(list.expiresAt) === null) return false;
  const kids = new Set<string>();
  for (const key of list.keys) {
    const { activeAt, expiresAt, retiredAt, compromisedAt } = key.jdx;
    const active = parseInstant(activeAt);
    const expires = parseInstant(expiresAt);
    if (active === null || expires === null) return false;
    if ([retiredAt, compromisedAt].some((at) => at !== undefined && parseInstant(at) === null)) return false;
    if (expires.epochNanos > addYears(active, 2).epochNanos) return false;
    if (kids.has(key.kid) || !isP256PublicKey(key) || ecThumbprint(key) !== key.kid) return false;
    kids.add(key.kid);
  }
  return true;
}

/** Las raíces que firmaron la lista y cuentan, en el orden de sus firmas. */
async function countedRoots(general: GeneralJws, list: TrustList, pinned: readonly RootKey[]): Promise<string[]> {
  const revoked = new Set(list.revokedRoots);
  const counted: string[] = [];
  for (const signature of general.signatures) {
    const kid = signerKid(signature.protected);
    const root = kid === null || counted.includes(kid) || revoked.has(kid) ? undefined : pinned.find((r) => r.kid === kid);
    if (root === undefined) continue;
    try {
      await flattenedVerify(
        { payload: general.payload, protected: signature.protected, signature: signature.signature },
        { kty: 'EC', crv: 'P-256', x: root.x, y: root.y },
        { algorithms: ['ES256'] },
      );
      counted.push(root.kid);
    } catch {
      // Una firma que no verifica no cuenta.
    }
  }
  return counted;
}

/** El kid de un encabezado protegido que es exactamente `{ alg: "ES256", kid, typ }`; null si es otro. */
function signerKid(encoded: string): string | null {
  const bytes = fromBase64url(encoded);
  const parsed = bytes === null ? null : parseJson(bytes);
  if (parsed === null || !parsed.ok) return null;
  const header = parsed.json.value;
  if (!isRecord(header) || Object.keys(header).length !== 3) return null;
  return header.alg === 'ES256' && header.typ === TRUST_LIST_TYP && typeof header.kid === 'string' ? header.kid : null;
}

function isGeneralJws(value: JsonValue): value is GeneralJws & { [k: string]: JsonValue } {
  return (
    isRecord(value) && Object.keys(value).length === 2 && typeof value.payload === 'string' &&
    Array.isArray(value.signatures) && value.signatures.length > 0 &&
    value.signatures.every((s) => isRecord(s) && Object.keys(s).length === 2 && typeof s.protected === 'string' && typeof s.signature === 'string')
  );
}

/** Los bytes de un texto base64url sin relleno (RFC 7515), o null si no lo es. */
function fromBase64url(text: string): Uint8Array | null {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return null;
  const bytes = Buffer.from(text, 'base64url');
  // Los bits que sobran del último carácter van en cero: un texto, unos bytes.
  return bytes.toString('base64url') === text ? new Uint8Array(bytes) : null;
}

function finding(ruleId: Finding['ruleId'], params: { [k: string]: JsonValue }): Finding {
  return { ruleId, instanceLocation: '', params };
}

function isRecord(value: unknown): value is { [k: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
