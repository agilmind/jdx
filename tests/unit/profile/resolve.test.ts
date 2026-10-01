/**
 * Resolución del perfil: el receptor lo elige por id corto (sadaic/0.1), por
 * URI o con el perfil ya leído de un archivo. El id corto y la URI van al patch
 * más alto de esa menor que trae el validador. Un perfil que no se puede
 * aplicar entero (regla desconocida, retirada o sin implementar, params que
 * no cumplen, catálogo desconocido, validador viejo) da un hallazgo de
 * entorno por falla: nada se saltea en silencio.
 */
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { VERSION } from '../../../src/generated/version.js';
import { admitsJdx, bundledProfiles, resolveProfile } from '../../../src/profile/resolve.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { Finding, JsonValue, Profile, ResolvedProfile } from '../../../src/types.js';
import { sadaicProfile } from '../../helpers/sadaicProfile.js';

const PROFILE_FILE = 'profiles/sadaic/0.1.0.json';
const validators = defaultValidators();
const catalog = loadCatalog(JSON.parse(files['catalog/1.0/rules.json'] as string) as JsonValue, validators);
const bundled = bundledProfiles(files);
const deps = { catalog, bundled, validatorVersion: VERSION, validators };
type Deps = typeof deps;
const resolve = (ref: string | Profile, more: Partial<Deps> = {}) => resolveProfile(ref, { ...deps, ...more });

function resolved(outcome: ReturnType<typeof resolveProfile>): ResolvedProfile {
  if (!outcome.ok) throw new Error(`no resolvió: ${JSON.stringify(outcome.findings)}`);
  return outcome.profile;
}
/** Los hallazgos de una resolución que falla, como [ruleId, params]: de entorno, del archivo entero y con params que cumplen su regla. */
function findings(outcome: ReturnType<typeof resolveProfile>): [string, Finding['params']][] {
  expect(outcome.ok).toBe(false);
  const found = outcome.ok ? [] : outcome.findings;
  for (const f of found) {
    const rule = catalog.rules.find((r) => r.id === f.ruleId);
    expect(rule?.layer, f.ruleId).toBe('environment');
    expect(f.instanceLocation, f.ruleId).toBe('');
    expect(validators.validateWith(rule?.resultParamsSchema ?? {}, f.params ?? {}), JSON.stringify(f)).toEqual([]);
  }
  return found.map((f) => [f.ruleId, f.params]);
}
const withRules = (change: (rules: Profile['rules']) => Profile['rules']): Profile => {
  const profile = sadaicProfile();
  return { ...profile, rules: change(profile.rules) };
};
const env006 = (params: { [k: string]: JsonValue }): [string, Finding['params']] => ['JDX-ENV-006', params];

describe('resolución del perfil', () => {
  it('the bundled file equals the literal sadaic/0.1 profile', () => {
    const text = files[PROFILE_FILE] as string;
    expect(JSON.parse(text)).toEqual(sadaicProfile());
    // Escrito como todo JSON del repositorio, y válido contra su schema.
    expect(text).toBe(`${JSON.stringify(sadaicProfile(), null, 2)}\n`);
    expect(validators.validateAux('profile', JSON.parse(text) as JsonValue)).toEqual([]);
    expect(bundled).toEqual([sadaicProfile()]);
  });

  it('short id and URI resolve to 0.1.0', () => {
    const byShortId = resolved(resolve('sadaic/0.1'));
    expect(byShortId.profile.version).toBe('0.1.0');
    expect(resolved(resolve('https://jdx.jupiter.ar/profiles/sadaic/0.1'))).toEqual(byShortId);
    // El perfil ya leído se aplica tal cual.
    expect(resolved(resolve(sadaicProfile()))).toEqual(byShortId);
  });

  it('highest bundled patch wins', () => {
    const patch = (version: string): Profile => ({ ...sadaicProfile(), version });
    const other = { ...sadaicProfile(), id: 'https://jdx.jupiter.ar/profiles/sadaic/0.2', version: '0.2.0' };
    const more = { bundled: [patch('0.1.0'), patch('0.1.10'), patch('0.1.3'), other] };
    expect(resolved(resolve('sadaic/0.1', more)).profile.version).toBe('0.1.10');
    expect(resolved(resolve('https://jdx.jupiter.ar/profiles/sadaic/0.1', more)).applied).toBe('https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.10');
    expect(resolved(resolve('sadaic/0.2', more)).profile.version).toBe('0.2.0');
  });

  it('unknown short id → ENV-006', () => {
    for (const profile of ['sadaic/0.9', 'agadu/1.0', 'sadaic', 'https://example.com/profiles/sadaic/0.1', 'perfiles/sadaic-0.1.json']) {
      expect(findings(resolve(profile)), profile).toEqual([env006({ reason: 'unknownProfile', profile })]);
    }
  });

  it('unknown rule → ENV-006', () => {
    const profile = withRules((rules) => [...rules, { ruleId: 'JDX-XYZ-001' }]);
    expect(findings(resolve(profile))).toEqual([env006({ reason: 'unknownRule', ruleId: 'JDX-XYZ-001' })]);
  });

  it('retired rule → ENV-006', () => {
    for (const ruleId of ['JDX-SHR-001', 'JDX-SHR-003', 'JDX-SHR-005', 'JDX-MED-005'] as const) {
      expect(findings(resolve(withRules((rules) => [...rules, { ruleId }]))), ruleId).toEqual([env006({ reason: 'retiredRule', ruleId })]);
    }
  });

  it('not implemented rule (IDN-004) → ENV-006', () => {
    const profile = withRules((rules) => [...rules, { ruleId: 'JDX-IDN-004' }]);
    expect(findings(resolve(profile))).toEqual([env006({ reason: 'notImplemented', ruleId: 'JDX-IDN-004' })]);
  });

  it('a core rule in a profile → ENV-006', () => {
    for (const ruleId of ['JDX-NUM-001', 'JDX-SIG-001', 'JDX-ENV-001'] as const) {
      expect(findings(resolve(withRules((rules) => [...rules, { ruleId }]))), ruleId).toEqual([env006({ reason: 'notProfileRule', ruleId })]);
    }
  });

  it('invalid params → ENV-006 with ruleId', () => {
    const agr003 = withRules((rules) =>
      rules.map((r) => (r.ruleId === 'JDX-AGR-003' ? { ...r, params: { cap: '25', capWithCondition: { value: 33.3333, conditionScheme: 'SADAIC_ART8' } } } : r)),
    );
    expect(findings(resolve(agr003))).toEqual([env006({ reason: 'invalidParams', ruleId: 'JDX-AGR-003' })]);
    // Sin los params que la regla necesita, o con params que no lleva.
    const without = withRules((rules) => rules.map((r) => (r.ruleId === 'JDX-MIN-001' ? { ruleId: r.ruleId } : r)));
    expect(findings(resolve(without))).toEqual([env006({ reason: 'invalidParams', ruleId: 'JDX-MIN-001' })]);
    const extra = withRules((rules) => rules.map((r) => (r.ruleId === 'JDX-CMP-001' ? { ...r, params: { scheme: 'SADAIC_GENRE' } } : r)));
    expect(findings(resolve(extra))).toEqual([env006({ reason: 'invalidParams', ruleId: 'JDX-CMP-001' })]);
  });

  it('duplicate ruleId → ENV-006 with ruleId', () => {
    const profile = withRules((rules) => [...rules, { ruleId: 'JDX-CMP-001', level: 'error' }]);
    // El schema del perfil no expresa la unicidad por clave: la controla la resolución.
    expect(validators.validateAux('profile', profile as unknown as JsonValue)).toEqual([]);
    expect(findings(resolve(profile))).toEqual([env006({ reason: 'duplicateRule', ruleId: 'JDX-CMP-001' })]);
  });

  it('unknown catalog → ENV-006', () => {
    expect(findings(resolve({ ...sadaicProfile(), catalog: '2.0' }))).toEqual([env006({ reason: 'unknownCatalog', catalog: '2.0' })]);
  });

  it('jdx 2.x → ENV-006', () => {
    expect(findings(resolve({ ...sadaicProfile(), jdx: '2.x' }))).toEqual([env006({ reason: 'invalidProfile' })]);
    // Un perfil que no cumple su schema no se mira más: un solo hallazgo.
    const broken = { ...sadaicProfile(), jdx: '2.x', catalog: '2.0', rules: [{ ruleId: 'JDX-XYZ-001' }] } as Profile;
    expect(findings(resolve(broken))).toEqual([env006({ reason: 'invalidProfile' })]);
  });

  it('requiresValidator >=2.0.0 → ENV-007', () => {
    expect(findings(resolve({ ...sadaicProfile(), requiresValidator: '>=2.0.0' }))).toEqual([
      ['JDX-ENV-007', { reason: 'requiresValidator', required: '>=2.0.0', version: '1.0.0' }],
    ]);
    // Un texto que no es un rango de npm no cumple el perfil.
    expect(findings(resolve({ ...sadaicProfile(), requiresValidator: 'el último' }))).toEqual([env006({ reason: 'invalidProfile' })]);
  });

  it('1.0.0 satisfies >=1.0.0 <2.0.0', () => {
    expect(VERSION).toBe('1.0.0');
    for (const validatorVersion of ['1.0.0', '1.9.3']) expect(resolve('sadaic/0.1', { validatorVersion }).ok, validatorVersion).toBe(true);
    for (const validatorVersion of ['0.9.0', '2.0.0', '1.0.0-beta.1']) {
      expect(findings(resolve('sadaic/0.1', { validatorVersion })), validatorVersion).toEqual([
        ['JDX-ENV-007', { reason: 'requiresValidator', required: '>=1.0.0 <2.0.0', version: validatorVersion }],
      ]);
    }
  });

  it('several failures give one finding each', () => {
    const profile = { ...withRules((rules) => [{ ruleId: 'JDX-XYZ-001' }, ...rules, { ruleId: 'JDX-SHR-001' }, { ruleId: 'JDX-DEC-001' }]), requiresValidator: '>=3.0.0' };
    expect(findings(resolve(profile))).toEqual([
      ['JDX-ENV-007', { reason: 'requiresValidator', required: '>=3.0.0', version: '1.0.0' }],
      env006({ reason: 'unknownRule', ruleId: 'JDX-XYZ-001' }),
      env006({ reason: 'retiredRule', ruleId: 'JDX-SHR-001' }),
      env006({ reason: 'duplicateRule', ruleId: 'JDX-DEC-001' }),
    ]);
  });

  it('effective levels from defaultLevel', () => {
    const levels = (profile: string | Profile) => [...new Set(resolved(resolve(profile)).rules.map((r) => r.level))];
    expect(levels('sadaic/0.1')).toEqual(['warning']);
    expect(levels({ ...sadaicProfile(), defaultLevel: 'error' })).toEqual(['error']);
    // El nivel de la regla manda sobre el del perfil; los params faltantes quedan {}.
    const mixed = resolved(resolve(withRules((rules) => rules.map((r) => (r.ruleId === 'JDX-CMP-001' ? { ...r, level: 'info' } : r)))));
    expect(mixed.rules.find((r) => r.ruleId === 'JDX-CMP-001')).toEqual({ ruleId: 'JDX-CMP-001', level: 'info', params: {} });
    expect(mixed.rules.find((r) => r.ruleId === 'JDX-AGR-004')).toEqual({ ruleId: 'JDX-AGR-004', level: 'warning', params: { types: ['publishing'] } });
  });

  it('source and applied strings', () => {
    const profile = resolved(resolve('sadaic/0.1'));
    expect(profile.shortId).toBe('sadaic/0.1');
    expect(profile.source).toBe('profile:sadaic/0.1@0.1.0');
    expect(profile.applied).toBe('https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.0');
    const patched = resolved(resolve({ ...sadaicProfile(), version: '0.1.3' }));
    expect([patched.source, patched.applied]).toEqual(['profile:sadaic/0.1@0.1.3', 'https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.3']);
  });

  it('35 rules, IDN-004 excluded', () => {
    const profile = resolved(resolve('sadaic/0.1'));
    expect(profile.rules).toHaveLength(35);
    expect(profile.rules.map((r) => r.ruleId)).toEqual(sadaicProfile().rules.map((r) => r.ruleId));
    // Son las 36 reglas de perfil del catálogo, salvo la que no está implementada.
    const profileRules = catalog.rules.filter((r) => r.layer === 'profile' && r.status === 'active').map((r) => r.id);
    expect([...profile.rules.map((r) => r.ruleId)].sort()).toEqual(profileRules.filter((id) => id !== 'JDX-IDN-004'));
    // Lo resuelto no comparte objetos con el perfil de entrada y está congelado.
    const input = sadaicProfile();
    const fromObject = resolved(resolve(input));
    expect(fromObject.profile).toEqual(input);
    expect(fromObject.profile).not.toBe(input);
    expect(Object.isFrozen(fromObject) && Object.isFrozen(fromObject.rules[8]?.params)).toBe(true);
  });

  it('admitsJdx: 1.x admits 1.0 and 1.7, 1.0 admits only 1.0, none admits 2.0', () => {
    const any = { ...sadaicProfile(), jdx: '1.x' };
    const exact = { ...sadaicProfile(), jdx: '1.0' };
    expect([admitsJdx(any, '1.0'), admitsJdx(any, '1.7'), admitsJdx(any, '1.10')]).toEqual([true, true, true]);
    expect([admitsJdx(exact, '1.0'), admitsJdx(exact, '1.1'), admitsJdx(exact, '1.00')]).toEqual([true, false, false]);
    for (const jdx of ['2.0', '2.x', '1', '', 'x']) expect([admitsJdx(any, jdx), admitsJdx(exact, jdx)], jdx).toEqual([false, false]);
  });
});
