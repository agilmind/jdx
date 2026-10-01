/**
 * La lista de confianza: las claves de los emisores, en un JWS con
 * serialización JSON general firmado por al menos dos de las raíces fijadas.
 *
 * - Se lee primero, sin confiar en ella: llega sin autenticar, así que cada
 *   control tiene un costo acotado. El JWS tiene que ser `{ payload,
 *   signatures }`, con a lo sumo MAX_TRUST_LIST_SIGNATURES firmas, cada una
 *   `{ protected, signature }`, sin encabezado sin proteger ni otros miembros;
 *   el payload, base64url sin relleno de un texto I-JSON que cumple
 *   trust-list.schema.json (validado hasta el primer error), con un
 *   `validator.minVersion` que semver lee, instantes que existen en el
 *   calendario, `issuedAt` ≤ `expiresAt` ≤ `issuedAt` + 90 días, y cada clave
 *   con `activeAt` ≤ `expiresAt` ≤ `activeAt` + 2 años (sumados como java.time,
 *   comparados en nanosegundos), su kid una vez, un punto de P-256 en
 *   base64url canónico y el kid de su huella RFC 7638. Si no: JDX-ENV-001, y
 *   nada más.
 * - Después, las firmas: cuenta cada raíz fijada del entorno de la lista, no
 *   revocada en `revokedRoots`, cuya firma verifica con el encabezado
 *   protegido exacto `{ alg: "ES256", kid, typ: "vnd.jupiter.jdx-trust+jws" }`.
 *   Cada raíz se prueba una sola vez, con su primera firma, y cuenta una vez.
 *   Con menos de dos: JDX-ENV-003, y nada más. Una lista de otro entorno se
 *   verifica con las raíces de ese entorno: si el validador no las fija (la
 *   imagen de producción no trae las de sandbox), da JDX-ENV-003.
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
import { addDays, addYears, parseInstant } from '../conventions/time.js';
import { parseJson } from '../json/parse.js';
import type {
  Env,
  Finding,
  GeneralJws,
  Instant,
  JsonValue,
  PinnedRoots,
  RootKey,
  SchemaValidators,
  TrustList,
  TrustListOutcome,
} from '../types.js';
import { ecThumbprint, isP256PublicKey } from './keys.js';

/** El `typ` de cada firma de la lista. */
export const TRUST_LIST_TYP = 'vnd.jupiter.jdx-trust+jws';
/** Las firmas que puede traer una lista: la firman dos o tres raíces; con más, no se lee. */
export const MAX_TRUST_LIST_SIGNATURES = 8;
/** La vigencia máxima de una lista, en días de 24 horas desde `issuedAt`. */
export const TRUST_LIST_MAX_DAYS = 90;
/** La vigencia máxima de una clave de emisor, en años desde `activeAt`. */
export const TRUST_KEY_MAX_YEARS = 2;

/** Por qué una lista no se puede leer. */
export type UnreadableListCause = 'jws' | 'signatures' | 'json' | 'schema' | 'instant' | 'listValidity' | 'keyValidity' | 'key';

export interface VerifyTrustListOptions {
  env: Env;
  roots: PinnedRoots;
  now: Date;
  validatorVersion: string;
  maxSeq: number | null;                                   // el del estado del mismo entorno; null sin estado
  validators: SchemaValidators;
}

const BASE64URL = /^[A-Za-z0-9_-]*$/u;
const NANOS_PER_MILLI = 1_000_000n;

export async function verifyTrustList(jws: Uint8Array, opts: VerifyTrustListOptions): Promise<TrustListOutcome> {
  const read = readTrustList(jws, opts.validators);
  if (!read.ok) return { ok: false, findings: [finding('JDX-ENV-001', { reason: 'invalid' })] };
  const { general, list } = read;
  const rootKids = await countedRoots(general, list, opts.roots[list.env]);
  if (rootKids.length < 2) return { ok: false, findings: [{ ruleId: 'JDX-ENV-003', instanceLocation: '' }] };

  const findings: Finding[] = [];
  if (list.env !== opts.env) findings.push(finding('JDX-ENV-009', { env: opts.env, listEnv: list.env }));
  if (instant(list.expiresAt).epochNanos < BigInt(opts.now.getTime()) * NANOS_PER_MILLI) {
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

type ReadList = { ok: true; general: GeneralJws; list: TrustList } | { ok: false; cause: UnreadableListCause };

/** El JWS y la lista de su payload, si se pueden leer; si no, por qué. */
function readTrustList(jws: Uint8Array, validators: SchemaValidators): ReadList {
  const unreadable = (cause: UnreadableListCause): ReadList => ({ ok: false, cause });
  const parsed = parseJson(jws);
  if (!parsed.ok) return unreadable('jws');
  const value = parsed.json.value;
  if (!isRecord(value) || !Array.isArray(value.signatures)) return unreadable('jws');
  // Antes de mirar cada firma: una lista con miles de firmas no se recorre.
  if (value.signatures.length > MAX_TRUST_LIST_SIGNATURES) return unreadable('signatures');
  if (!isGeneralJws(value)) return unreadable('jws');
  const payload = fromBase64url(value.payload);
  if (payload === null) return unreadable('jws');
  const content = parseJson(payload);
  if (!content.ok) return unreadable('json');
  if (validators.firstAuxError('trustList', content.json.value) !== null) return unreadable('schema');
  const list = content.json.value as unknown as TrustList;
  // El patrón del schema deja pasar una versión que semver no lee, como una con más de 16 dígitos.
  if (semver.valid(list.validator.minVersion) === null) return unreadable('schema');
  const cause = unreadableContent(list);
  return cause === null ? { ok: true, general: value, list } : unreadable(cause);
}

/** Lo que el schema de la lista no puede decir: instantes del calendario, vigencias, y cada clave una vez, de P-256 y con el kid de su huella. */
function unreadableContent(list: TrustList): UnreadableListCause | null {
  const texts = [list.issuedAt, list.expiresAt, ...list.keys.flatMap(({ jdx }) => [jdx.activeAt, jdx.expiresAt, jdx.retiredAt, jdx.compromisedAt])];
  if (texts.some((text) => text !== undefined && parseInstant(text) === null)) return 'instant';
  const issuedAt = instant(list.issuedAt);
  const expiresAt = instant(list.expiresAt);
  if (expiresAt.epochNanos < issuedAt.epochNanos || expiresAt.epochNanos > addDays(issuedAt, TRUST_LIST_MAX_DAYS).epochNanos) return 'listValidity';
  const kids = new Set<string>();
  for (const key of list.keys) {
    const activeAt = instant(key.jdx.activeAt);
    const keyExpiresAt = instant(key.jdx.expiresAt);
    if (keyExpiresAt.epochNanos < activeAt.epochNanos || keyExpiresAt.epochNanos > addYears(activeAt, TRUST_KEY_MAX_YEARS).epochNanos) {
      return 'keyValidity';
    }
    if (kids.has(key.kid) || !isP256PublicKey(key) || ecThumbprint(key) !== key.kid) return 'key';
    kids.add(key.kid);
  }
  return null;
}

/** Un instante de una lista ya leída: existe en el calendario. */
function instant(text: string): Instant {
  return parseInstant(text) as Instant;
}

/** Las raíces que firmaron la lista y cuentan, en el orden de sus firmas; cada raíz se prueba una vez. */
async function countedRoots(general: GeneralJws, list: TrustList, pinned: readonly RootKey[]): Promise<string[]> {
  const revoked = new Set(list.revokedRoots);
  const tried = new Set<string>();
  const counted: string[] = [];
  for (const signature of general.signatures) {
    const kid = signerKid(signature.protected);
    const root = kid === null || tried.has(kid) || revoked.has(kid) ? undefined : pinned.find((r) => r.kid === kid);
    if (root === undefined) continue;
    // Con su primera firma: otra firma de la misma raíz no se verifica, aunque la primera no verifique.
    tried.add(root.kid);
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

function isGeneralJws(value: { [k: string]: JsonValue }): value is GeneralJws & { [k: string]: JsonValue } {
  return (
    Object.keys(value).length === 2 && typeof value.payload === 'string' && Array.isArray(value.signatures) && value.signatures.length > 0 &&
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
