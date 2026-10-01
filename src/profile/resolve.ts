/**
 * El perfil que aplica el receptor, resuelto contra el catálogo.
 *
 * - resolveProfile recibe un id corto empaquetado (`sadaic/0.1`), su URI o un
 *   perfil ya leído (el CLI lee el archivo de `--profile <ruta>`). El id corto
 *   y la URI van al patch más alto de esa menor entre los empaquetados que
 *   cumplen el schema de los perfiles, por orden de semver.
 * - Un perfil leído que no es igual al empaquetado de su id y versión (o de
 *   una versión que el validador no trae) se marca: su `source` y su `applied`
 *   llevan `+local` detrás de la versión, así el reporte no lo confunde con el
 *   empaquetado.
 * - El catálogo del validador sirve a un perfil de la misma mayor y de una
 *   menor igual o anterior: las menores del catálogo solo suman reglas.
 * - Un perfil se aplica entero o no se aplica: cada falla es un hallazgo de
 *   entorno (salida 2). JDX-ENV-006 si el perfil no se conoce o no cumple su
 *   schema, pide un catálogo que el validador no sirve, o usa una regla
 *   desconocida, retirada, sin implementar, que no es de perfil o repetida, o
 *   con params que no cumplen el schema de la regla (o lo que el schema no
 *   puede decir: en JDX-AGR-003, que el tope con condición no baje del tope);
 *   JDX-ENV-007 si pide un validador más nuevo.
 * - Cada regla toma el nivel que le da el perfil (o su defaultLevel) y sus
 *   params (o `{}`).
 * - admitsJdx dice si el perfil admite la versión jdx del documento: `1.x`
 *   admite toda menor de la 1, `1.0` solo la 1.0. La etapa del schema lo
 *   controla (JDX-ENV-006 `jdxNotAdmitted`).
 */
import semver from 'semver';
import type {
  BundleFiles,
  Catalog,
  CatalogRule,
  Finding,
  JsonValue,
  Profile,
  ResolvedProfile,
  ResolvedRule,
  SchemaValidators,
} from '../types.js';

const PROFILE_BASE = 'https://jdx.jupiter.ar/profiles/';
const SHORT_ID = /^[a-z][a-z0-9-]*\/\d+\.\d+$/u;
/** profiles/<familia>/<M.m.p>.json: la familia y la versión del perfil que trae. */
const PROFILE_FILE = /^profiles\/([a-z][a-z0-9-]*)\/((\d+)\.(\d+)\.\d+)\.json$/u;
const CATALOG_VERSION = /^(\d+)\.(\d+)$/u;
/** La marca de un perfil leído que no es el empaquetado de su id y versión. */
const LOCAL = '+local';

/** Lo que el schema de los params de una regla no puede decir. */
const PARAM_CHECKS: Readonly<Record<string, (params: { [k: string]: JsonValue }) => boolean>> = Object.freeze({
  // El tope con condición no baja del tope: con la condición, el contrato puede dar más, nunca menos.
  'JDX-AGR-003': (params) => {
    const condition = params.capWithCondition;
    const value = typeof condition === 'object' && condition !== null && !Array.isArray(condition) ? condition.value : undefined;
    return typeof params.cap === 'number' && typeof value === 'number' && value >= params.cap;
  },
});

export interface ProfileDeps {
  catalog: Catalog;
  bundled: readonly Profile[];
  validatorVersion: string;
  validators: SchemaValidators;
}

export type ProfileOutcome = { ok: true; profile: ResolvedProfile } | { ok: false; findings: Finding[] };

/**
 * Los perfiles empaquetados, en orden de ruta: cada `profiles/<familia>/<M.m.p>.json`
 * cuyo contenido es un perfil de esa familia, de esa menor y de esa versión. Otro
 * archivo de profiles/ no es un perfil empaquetado.
 */
export function bundledProfiles(files: BundleFiles): Profile[] {
  const out: Profile[] = [];
  for (const path of Object.keys(files).sort()) {
    const found = PROFILE_FILE.exec(path);
    if (found === null) continue;
    const [, family, version, major, minor] = found;
    let profile: unknown;
    try {
      profile = JSON.parse(files[path] as string);
    } catch {
      continue;
    }
    if (isRecord(profile) && profile.version === version && profile.id === `${PROFILE_BASE}${family}/${major}.${minor}`) {
      out.push(profile as unknown as Profile);
    }
  }
  return out;
}

export function resolveProfile(ref: string | Profile, deps: ProfileDeps): ProfileOutcome {
  const profile = typeof ref === 'string' ? bundledByRef(ref, deps) : ref;
  if (profile === undefined) return failed([env006({ reason: 'unknownProfile', profile: ref as string })]);
  if (deps.validators.validateAux('profile', profile as unknown as JsonValue).length > 0) return failed([env006({ reason: 'invalidProfile' })]);
  if (!catalogServes(deps.catalog.catalog, profile.catalog)) return failed([env006({ reason: 'unknownCatalog', catalog: profile.catalog })]);
  if (semver.validRange(profile.requiresValidator) === null) return failed([env006({ reason: 'invalidProfile' })]);

  const findings: Finding[] = [];
  if (!semver.satisfies(deps.validatorVersion, profile.requiresValidator)) {
    findings.push({
      ruleId: 'JDX-ENV-007',
      instanceLocation: '',
      params: { reason: 'requiresValidator', required: profile.requiresValidator, version: deps.validatorVersion },
    });
  }
  const catalogRules = new Map<string, CatalogRule>(deps.catalog.rules.map((rule) => [rule.id, rule]));
  const seen = new Set<string>();
  const rules: ResolvedRule[] = [];
  for (const ref of profile.rules) {
    const params = ref.params ?? {};
    const problem = ruleProblem(ref.ruleId, params, seen, catalogRules, deps.validators);
    seen.add(ref.ruleId);
    if (problem !== null) findings.push(env006({ reason: problem, ruleId: ref.ruleId }));
    else rules.push({ ruleId: ref.ruleId, level: ref.level ?? profile.defaultLevel, params: structuredClone(params) });
  }
  if (findings.length > 0) return failed(findings);

  const shortId = profile.id.slice(PROFILE_BASE.length);
  // Un perfil leído que no es el empaquetado de su id y versión se marca en el reporte.
  const version = typeof ref === 'string' || isBundled(profile, deps.bundled) ? profile.version : `${profile.version}${LOCAL}`;
  return {
    ok: true,
    profile: deepFreeze({
      profile: structuredClone(profile),
      shortId,
      source: `profile:${shortId}@${version}`,
      applied: `${profile.id}@${version}`,
      rules,
    }),
  };
}

/** Si el perfil admite el `jdx` del documento: la misma mayor y, salvo `x`, la misma menor. */
export function admitsJdx(profile: Profile, jdx: string): boolean {
  const [major, minor] = profile.jdx.split('.');
  const found = /^(\d+)\.(\d+)$/u.exec(jdx);
  return found !== null && found[1] === major && (minor === 'x' || found[2] === minor);
}

/** El patch más alto empaquetado del id corto o de la URI de una menor, entre los que cumplen el schema de los perfiles. */
function bundledByRef(ref: string, deps: ProfileDeps): Profile | undefined {
  const id = SHORT_ID.test(ref) ? `${PROFILE_BASE}${ref}` : ref;
  return deps.bundled
    .filter((profile) => profile.id === id && deps.validators.validateAux('profile', profile as unknown as JsonValue).length === 0)
    .reduce<Profile | undefined>((best, profile) => (best === undefined || semver.gt(profile.version, best.version) ? profile : best), undefined);
}

/** Si el catálogo del validador sirve al perfil: la misma mayor y una menor igual o mayor que la que pide. */
function catalogServes(validator: string, wanted: string): boolean {
  const have = CATALOG_VERSION.exec(validator);
  const want = CATALOG_VERSION.exec(wanted);
  return have !== null && want !== null && Number(have[1]) === Number(want[1]) && Number(want[2]) <= Number(have[2]);
}

/** Si el perfil es, como JSON, el empaquetado de su id y versión. */
function isBundled(profile: Profile, bundled: readonly Profile[]): boolean {
  return bundled.some((other) => other.id === profile.id && other.version === profile.version && sameJson(other, profile));
}

/** Igualdad de dos valores JSON, sin mirar el orden de las claves. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => sameJson(item, b[i]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lo que impide aplicar una regla del perfil, o null. */
function ruleProblem(
  ruleId: string,
  params: { [k: string]: JsonValue },
  seen: ReadonlySet<string>,
  catalogRules: ReadonlyMap<string, CatalogRule>,
  validators: SchemaValidators,
): string | null {
  if (seen.has(ruleId)) return 'duplicateRule';
  const rule = catalogRules.get(ruleId);
  if (rule === undefined) return 'unknownRule';
  if (rule.status === 'retired') return 'retiredRule';
  if (rule.layer !== 'profile') return 'notProfileRule';
  if (!rule.implemented) return 'notImplemented';
  if (validators.validateWith(rule.profileParamsSchema, params).length > 0) return 'invalidParams';
  if (Object.hasOwn(PARAM_CHECKS, ruleId) && PARAM_CHECKS[ruleId]?.(params) === false) return 'invalidParams';
  return null;
}

function env006(params: { [k: string]: JsonValue }): Finding {
  return { ruleId: 'JDX-ENV-006', instanceLocation: '', params };
}

function failed(findings: Finding[]): ProfileOutcome {
  return { ok: false, findings };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
