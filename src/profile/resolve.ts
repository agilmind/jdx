/**
 * El perfil que aplica el receptor, resuelto contra el catálogo.
 *
 * - resolveProfile recibe un id corto empaquetado (`sadaic/0.1`), su URI o un
 *   perfil ya leído (el CLI lee el archivo de `--profile <ruta>`). El id corto
 *   y la URI van al patch más alto de esa menor entre los empaquetados, por
 *   orden de semver.
 * - Un perfil se aplica entero o no se aplica: cada falla es un hallazgo de
 *   entorno (salida 2). JDX-ENV-006 si el perfil no se conoce o no cumple su
 *   schema, pide otro catálogo, o usa una regla desconocida, retirada, sin
 *   implementar, que no es de perfil o repetida, o con params que no cumplen
 *   el schema de la regla; JDX-ENV-007 si pide un validador más nuevo.
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
const PROFILE_FILE = /^profiles\/[^/]+\/[^/]+\.json$/u;

export interface ProfileDeps {
  catalog: Catalog;
  bundled: readonly Profile[];
  validatorVersion: string;
  validators: SchemaValidators;
}

export type ProfileOutcome = { ok: true; profile: ResolvedProfile } | { ok: false; findings: Finding[] };

/** Los perfiles empaquetados (`profiles/<sociedad>/<M.m.p>.json`), en orden de ruta. */
export function bundledProfiles(files: BundleFiles): Profile[] {
  return Object.keys(files)
    .filter((path) => PROFILE_FILE.test(path))
    .sort()
    .map((path) => JSON.parse(files[path] as string) as Profile);
}

export function resolveProfile(ref: string | Profile, deps: ProfileDeps): ProfileOutcome {
  const profile = typeof ref === 'string' ? bundledByRef(ref, deps.bundled) : ref;
  if (profile === undefined) return failed([env006({ reason: 'unknownProfile', profile: ref as string })]);
  if (deps.validators.validateAux('profile', profile as unknown as JsonValue).length > 0) return failed([env006({ reason: 'invalidProfile' })]);
  if (profile.catalog !== deps.catalog.catalog) return failed([env006({ reason: 'unknownCatalog', catalog: profile.catalog })]);
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
  return {
    ok: true,
    profile: deepFreeze({
      profile: structuredClone(profile),
      shortId,
      source: `profile:${shortId}@${profile.version}`,
      applied: `${profile.id}@${profile.version}`,
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

/** El patch más alto empaquetado del id corto o de la URI de una menor. */
function bundledByRef(ref: string, bundled: readonly Profile[]): Profile | undefined {
  const id = SHORT_ID.test(ref) ? `${PROFILE_BASE}${ref}` : ref;
  return bundled
    .filter((profile) => profile.id === id && semver.valid(profile.version) !== null)
    .reduce<Profile | undefined>((best, profile) => (best === undefined || semver.gt(profile.version, best.version) ? profile : best), undefined);
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
