/**
 * El primer paso de una validación: el entorno. Si algo falla, el archivo no
 * se evalúa (salida 2) y cada falla da su resultado JDX-ENV-*.
 *
 * - Las opciones (JDX-ENV-010, con el nombre de la opción del CLI): `env`, el
 *   perfil y `receivedAt` son obligatorios, y `receivedAt` es un instante
 *   RFC 3339 que existe en el calendario; en producción, también el estado.
 *   `signature`, `failOn`, `lang` y la cuenta, si vienen, tienen que ser
 *   valores que existen.
 * - El perfil y su catálogo (JDX-ENV-006 y JDX-ENV-007, resolveProfile).
 * - La firma pedida contra el piso del perfil: sin `signature`, vale la más
 *   fuerte entre el default del entorno (`required` en producción, `optional`
 *   en sandbox) y el piso; una explícita más débil que el piso da JDX-ENV-008.
 *   Sin perfil no hay piso con qué comparar.
 * - El estado, con la lectura compartida: un StateError da JDX-ENV-005 con su
 *   razón (y, bloqueado, desde cuándo); un estado de otro entorno, JDX-ENV-005
 *   `env`. Un estado nunca escrito no tiene entorno y pasa: lo fija la
 *   primera escritura.
 * - Solo si hay .jws, la lista de confianza: sin lista, JDX-ENV-001 `missing`;
 *   con lista, verifyTrustList con el reloj del validador y el maxSeq del
 *   estado. Sin .jws, la lista no se mira.
 *
 * Las opciones del reporte salen siempre: el entorno o null, el id corto del
 * perfil resuelto (o el pedido, si no resolvió), la firma efectiva, `failOn` y
 * `lang` (o sus defaults si no sirven), `receivedAt` o null, y si hay carpeta
 * de la entrega. Una falla del estado que no es un StateError no es del
 * entorno: se deja pasar, y validate la devuelve como JDX-INT-001.
 */
import { parseInstant } from '../conventions/time.js';
import { resolveProfile } from '../profile/resolve.js';
import { StateError } from '../state/errors.js';
import { verifyTrustList } from '../trust/verifyList.js';
import type {
  EnvironmentOutcome,
  Env,
  FailOn,
  Finding,
  JsonValue,
  Lang,
  Report,
  ResolvedProfile,
  SignaturePolicy,
  State,
  ValidateInput,
  ValidateOptions,
  ValidatorDeps,
  VerifiedTrustList,
} from '../types.js';

const ENVS: readonly Env[] = ['production', 'sandbox'];
const SIGNATURES: readonly SignaturePolicy[] = ['optional', 'required'];
const FAIL_ON: readonly FailOn[] = ['error', 'warning'];
const LANGS: readonly Lang[] = ['es', 'pt', 'en'];

export async function evaluateEnvironment(input: ValidateInput, opts: ValidateOptions, deps: ValidatorDeps): Promise<EnvironmentOutcome> {
  const findings: Finding[] = [];
  const option = (name: string, reason: 'missing' | 'invalid'): void => {
    findings.push(finding('JDX-ENV-010', { option: name, reason }));
  };

  // Las opciones.
  const env = oneOf(opts.env, ENVS);
  if (opts.env === undefined || opts.env === null) option('--env', 'missing');
  else if (env === null) option('--env', 'invalid');
  const profileRef = opts.profile as unknown;
  const hasProfile = profileRef !== undefined && profileRef !== null && profileRef !== '';
  if (!hasProfile) option('--profile', 'missing');
  else if (typeof profileRef !== 'string' && (typeof profileRef !== 'object' || Array.isArray(profileRef))) option('--profile', 'invalid');
  const receivedAt = typeof opts.receivedAt === 'string' ? parseInstant(opts.receivedAt) : null;
  if (opts.receivedAt === undefined || opts.receivedAt === null || opts.receivedAt === '') option('--received-at', 'missing');
  else if (receivedAt === null) option('--received-at', 'invalid');
  if (env === 'production' && opts.state === undefined) option('--state-dir', 'missing');
  const explicit = oneOf(opts.signature, SIGNATURES);
  if (opts.signature !== undefined && explicit === null) option('--signature', 'invalid');
  const failOn = oneOf(opts.failOn, FAIL_ON);
  if (opts.failOn !== undefined && failOn === null) option('--fail-on', 'invalid');
  const lang = oneOf(opts.lang, LANGS);
  if (opts.lang !== undefined && lang === null) option('--lang', 'invalid');
  if (opts.account !== undefined && !isAccount(opts.account)) option('--account', 'invalid');

  // El perfil y su catálogo.
  let profile: ResolvedProfile | null = null;
  if (hasProfile && (typeof profileRef === 'string' || (typeof profileRef === 'object' && !Array.isArray(profileRef)))) {
    const resolved = resolveProfile(opts.profile, {
      catalog: deps.catalog, bundled: deps.profiles, validatorVersion: deps.validatorVersion, validators: deps.validators,
    });
    if (resolved.ok) profile = resolved.profile;
    else findings.push(...resolved.findings);
  }

  // La firma pedida contra el piso del perfil.
  const floor = profile?.profile.signature ?? null;
  if (explicit === 'optional' && floor === 'required') findings.push(finding('JDX-ENV-008', { signature: explicit, floor }));
  const byDefault = env === null ? null : env === 'production' ? 'required' : 'optional';
  const signature = explicit ?? strongest(byDefault, floor);

  // El estado, con la lectura compartida.
  let state: State | null = null;
  if (opts.state !== undefined) {
    try {
      state = await opts.state.read(async (snapshot) => snapshot);
    } catch (error) {
      if (!(error instanceof StateError)) throw error;
      const lockedSince = typeof error.details?.lockedSince === 'string' ? error.details.lockedSince : deps.clock().toISOString();
      findings.push(finding('JDX-ENV-005', error.reason === 'locked' ? { reason: 'locked', lockedSince } : { reason: error.reason }));
    }
    if (state !== null && state.env !== undefined && env !== null && state.env !== env) {
      findings.push(finding('JDX-ENV-005', { reason: 'env' }));
    }
  }

  // La lista de confianza, solo si hay .jws.
  let trust: VerifiedTrustList | null = null;
  if (input.jws !== undefined) {
    if (opts.trustList === undefined) {
      findings.push(finding('JDX-ENV-001', { reason: 'missing' }));
    } else if (env !== null) {
      const outcome = await verifyTrustList(opts.trustList, {
        env, roots: deps.roots, now: deps.clock(), validatorVersion: deps.validatorVersion,
        maxSeq: state === null ? null : state.trust.maxSeq, validators: deps.validators,
      });
      if (outcome.ok) trust = outcome.trust;
      else findings.push(...outcome.findings);
    }
  }

  const reportOptions: Report['options'] = {
    env,
    profile: profile?.shortId ?? (typeof profileRef === 'string' && profileRef !== '' ? profileRef : null),
    signature,
    failOn: failOn ?? 'error',
    receivedAt: receivedAt === null ? null : receivedAt.text,
    dir: opts.media !== undefined,
    lang: lang ?? 'es',
  };
  if (findings.length > 0 || env === null || profile === null || receivedAt === null || signature === null) {
    return { ok: false, reportOptions, profile, findings };
  }
  return {
    ok: true,
    options: {
      env, profileShortId: profile.shortId, signature, signatureExplicit: explicit !== null,
      failOn: reportOptions.failOn, receivedAt, lang: reportOptions.lang, dir: reportOptions.dir,
    },
    reportOptions,
    profile,
    state,
    trust,
  };
}

function finding(ruleId: Finding['ruleId'], params: { [k: string]: JsonValue }): Finding {
  return { ruleId, instanceLocation: '', params };
}

/** El valor, si es uno de los admitidos; si no, null. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** La firma más fuerte entre el default del entorno y el piso del perfil, de las que se conocen. */
function strongest(a: SignaturePolicy | null, b: SignaturePolicy | null): SignaturePolicy | null {
  if (a === 'required' || b === 'required') return 'required';
  return a ?? b;
}

/** Una cuenta de --accounts: `{ id, identifiers: [{ scheme, value }] }`. */
function isAccount(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { id, identifiers } = value as { id?: unknown; identifiers?: unknown };
  return (
    typeof id === 'string' && id !== '' && Array.isArray(identifiers) &&
    identifiers.every((i: unknown) => typeof i === 'object' && i !== null && typeof (i as { scheme?: unknown }).scheme === 'string' && typeof (i as { value?: unknown }).value === 'string')
  );
}
