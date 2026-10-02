/**
 * El primer paso de una validación: el entorno. Si algo falla, el archivo no
 * se evalúa (código de salida 2) y cada falla da su resultado JDX-ENV-*.
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
 *   razón (y, bloqueado, desde cuándo; ilegible, por qué); un estado de otro
 *   entorno, JDX-ENV-005 `env`. Un estado nunca escrito no tiene entorno y pasa: lo fija la
 *   primera escritura.
 * - La carpeta de la entrega, si hay y su resolver la controla (check, con
 *   privateCopy): una que no se puede usar da JDX-ENV-011 con su causa y el
 *   lugar. Lo que check dice de cómo va a buscar va al reporte (dirLookup).
 * - Solo si hay .jws, la lista de confianza: sin lista, JDX-ENV-001 `missing`;
 *   con lista, verifyTrustList con el reloj del validador y el maxSeq del
 *   estado, si el estado es del mismo entorno (el de otro entorno ya dio
 *   JDX-ENV-005 y su maxSeq es de otra serie). Sin .jws, la lista no se mira.
 *
 * Las opciones del reporte salen siempre: el entorno o null, el id corto del
 * perfil resuelto (o el pedido, si no resolvió), la firma efectiva, `failOn` y
 * `lang` (o sus defaults si no sirven), `receivedAt` o null, si hay carpeta
 * de la entrega y cómo se busca en ella (o null). `privateCopy`, si viene, es
 * un booleano (JDX-ENV-010 `--private-copy`). Una falla del estado que no es un StateError, o de la
 * carpeta que no es un MediaFolderError, no es del entorno: se deja pasar, y
 * validate la devuelve como JDX-INT-001.
 */
import { parseInstant } from '../conventions/time.js';
import { MediaFolderError } from '../media/errors.js';
import { resolveProfile } from '../profile/resolve.js';
import { STATE_UNREADABLE_CAUSES, StateError } from '../state/errors.js';
import { verifyTrustList } from '../trust/verifyList.js';
import type {
  EnvironmentOutcome,
  Env,
  FailOn,
  Finding,
  JsonValue,
  Lang,
  MediaLookup,
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
  if (opts.privateCopy !== undefined && typeof opts.privateCopy !== 'boolean') option('--private-copy', 'invalid');

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
      findings.push(finding('JDX-ENV-005', stateParams(error, deps.clock)));
    }
    if (state !== null && state.env !== undefined && env !== null && state.env !== env) {
      findings.push(finding('JDX-ENV-005', { reason: 'env' }));
    }
  }

  // La carpeta de la entrega, y cómo se va a buscar en ella.
  let dirLookup: MediaLookup | null = null;
  if (opts.media?.check !== undefined) {
    try {
      dirLookup = (await opts.media.check({ privateCopy: opts.privateCopy === true })) ?? null;
    } catch (error) {
      if (!(error instanceof MediaFolderError)) throw error;
      findings.push(folderFinding(error));
    }
  }

  // La lista de confianza, solo si hay .jws.
  let trust: VerifiedTrustList | null = null;
  if (input.jws !== undefined) {
    if (opts.trustList === undefined) {
      findings.push(finding('JDX-ENV-001', { reason: 'missing' }));
    } else if (env !== null) {
      const maxSeq = state !== null && (state.env === undefined || state.env === env) ? state.trust.maxSeq : null;
      const outcome = await verifyTrustList(opts.trustList, {
        env, roots: deps.roots, now: deps.clock(), validatorVersion: deps.validatorVersion, maxSeq, validators: deps.validators,
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
    dirLookup,
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

/** Los params de JDX-ENV-005 para un StateError: la razón, desde cuándo está bloqueado (o el reloj) y por qué no se lee. */
function stateParams(error: StateError, clock: () => Date): { [k: string]: JsonValue } {
  if (error.reason === 'locked') {
    return { reason: 'locked', lockedSince: typeof error.details?.lockedSince === 'string' ? error.details.lockedSince : clock().toISOString() };
  }
  const cause = error.details?.cause;
  if (error.reason === 'unreadable' && (STATE_UNREADABLE_CAUSES as readonly JsonValue[]).includes(cause ?? null)) {
    return { reason: 'unreadable', cause: cause as JsonValue };
  }
  return { reason: error.reason };
}

/** JDX-ENV-011 de una carpeta de la entrega que no se puede usar: la causa y el lugar. */
export function folderFinding(error: MediaFolderError): Finding {
  return finding('JDX-ENV-011', { cause: error.reason, path: error.path });
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
