/**
 * Schemas del perfil (schema/profile.schema.json) y del catálogo de reglas
 * (schema/catalog.schema.json), empaquetados: se validan con defaultValidators.
 */
import { describe, expect, it } from 'vitest';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { JsonValue } from '../../../src/types.js';

/** El perfil sadaic/0.1 completo, con sus 35 reglas. */
function sadaicProfile(): { [k: string]: JsonValue } {
  return {
    id: 'https://jdx.jupiter.ar/profiles/sadaic/0.1', version: '0.1.0', jdx: '1.x',
    catalog: '1.0', requiresValidator: '>=1.0.0 <2.0.0', society: '061',
    signature: 'optional', defaultLevel: 'warning',
    rules: [
      { ruleId: 'JDX-DEC-001' },
      { ruleId: 'JDX-SHR-002' },
      { ruleId: 'JDX-SHR-004' },
      { ruleId: 'JDX-SHR-006' },
      { ruleId: 'JDX-SHR-007' },
      { ruleId: 'JDX-SHR-008' },
      { ruleId: 'JDX-AGR-001' },
      { ruleId: 'JDX-AGR-002' },
      { ruleId: 'JDX-AGR-003', params: { cap: 25, capWithCondition: { value: 33.3333, conditionScheme: 'SADAIC_ART8' } } },
      { ruleId: 'JDX-AGR-004', params: { types: ['publishing'] } },
      { ruleId: 'JDX-AGR-005' },
      { ruleId: 'JDX-AGR-006', params: { retailMin: 20, arrangementRetailMin: 10 } },
      { ruleId: 'JDX-WRK-001' },
      { ruleId: 'JDX-ROL-001' },
      { ruleId: 'JDX-MIN-001', params: { ageOfMajority: 18 } },
      { ruleId: 'JDX-IDN-001' },
      { ruleId: 'JDX-IDN-002' },
      { ruleId: 'JDX-IDN-003' },
      { ruleId: 'JDX-IDN-005' },
      { ruleId: 'JDX-IDN-006' },
      { ruleId: 'JDX-TER-001' },
      { ruleId: 'JDX-SOC-001' },
      { ruleId: 'JDX-CLS-001' },
      { ruleId: 'JDX-REF-003' },
      { ruleId: 'JDX-REF-004' },
      { ruleId: 'JDX-EDN-001' },
      { ruleId: 'JDX-MED-003' },
      { ruleId: 'JDX-MED-010' },
      { ruleId: 'JDX-CMP-001' },
      { ruleId: 'JDX-CMP-002', params: { scheme: 'SADAIC_GENRE' } },
      { ruleId: 'JDX-CMP-003', params: { registry: 'DNDA_AR' } },
      { ruleId: 'JDX-CMP-004' },
      { ruleId: 'JDX-CMP-005' },
      { ruleId: 'JDX-CMP-006', params: { country: 'AR' } },
      { ruleId: 'JDX-CMP-007' },
    ],
  };
}

const profileErrors = (value: JsonValue) => defaultValidators().validateAux('profile', value);
const catalogErrors = (value: JsonValue) => defaultValidators().validateAux('catalog', value);
const at = (errors: { instanceLocation: string; keyword: string }[]) => errors.map((e) => [e.instanceLocation, e.keyword]);

/** Una entrada de catálogo mínima y válida, de la capa núcleo. */
function coreRule(): { [k: string]: JsonValue } {
  return {
    id: 'JDX-NUM-001',
    layer: 'core',
    check: 'core',
    status: 'active',
    since: '1.0',
    implemented: true,
    level: 'error',
    predicate: { es: 'Porcentaje mal escrito', pt: 'Percentual mal escrito', en: 'Badly written percentage' },
    message: { es: 'El porcentaje {text} no cumple.', pt: 'O percentual {text} não cumpre.', en: 'Percentage {text} does not comply.' },
    profileParamsSchema: { type: 'object', additionalProperties: false },
    resultParamsSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    contextSchema: { type: 'object', properties: { work: { type: 'string' } } },
    example: { params: { text: '33.33333' }, context: { work: 'w1' } },
  };
}

describe('schemas del perfil y del catálogo', () => {
  it('sadaic/0.1 validates', () => {
    const profile = sadaicProfile();
    expect(profile.id).toBe('https://jdx.jupiter.ar/profiles/sadaic/0.1');
    expect((profile.rules as JsonValue[]).length).toBe(35);
    expect(profileErrors(profile)).toEqual([]);
  });

  it('id must be https://jdx.jupiter.ar/profiles/<society>/<M.m>', () => {
    expect(profileErrors({ ...sadaicProfile(), id: 'https://jdx.jupiter.ar/profiles/agadu/1.0' })).toEqual([]);
    for (const id of [
      'https://jdx.jupiter.ar/profiles/sadaic/0.1.0',
      'http://jdx.jupiter.ar/profiles/sadaic/0.1',
      'https://jdx.jupiter.ar/profiles/sadaic',
      'https://jdx.jupiter.ar/profiles/SADAIC/0.1',
      'https://example.com/profiles/sadaic/0.1',
    ]) {
      expect(at(profileErrors({ ...sadaicProfile(), id })), id).toEqual([['/id', 'pattern']]);
    }
  });

  it('version must be M.m.p', () => {
    expect(profileErrors({ ...sadaicProfile(), version: '0.1.12' })).toEqual([]);
    for (const version of ['0.1', '0.1.0-beta', 'v0.1.0', '0.1.0.1']) {
      expect(at(profileErrors({ ...sadaicProfile(), version })), version).toEqual([['/version', 'pattern']]);
    }
  });

  it('jdx accepts 1.x and 1.0, rejects 2.x and 1', () => {
    for (const jdx of ['1.x', '1.0', '1.10']) expect(profileErrors({ ...sadaicProfile(), jdx }), jdx).toEqual([]);
    for (const jdx of ['2.x', '1', '1.X', '2.0']) expect(at(profileErrors({ ...sadaicProfile(), jdx })), jdx).toEqual([['/jdx', 'pattern']]);
  });

  it('signature and defaultLevel enums', () => {
    expect(profileErrors({ ...sadaicProfile(), signature: 'required', defaultLevel: 'error' })).toEqual([]);
    expect(at(profileErrors({ ...sadaicProfile(), signature: 'none' }))).toEqual([['/signature', 'enum']]);
    expect(at(profileErrors({ ...sadaicProfile(), defaultLevel: 'info' }))).toEqual([['/defaultLevel', 'enum']]);
    // Todos los campos del perfil son requeridos.
    const { society: _society, ...withoutSociety } = sadaicProfile();
    expect(profileErrors(withoutSociety)).toEqual([
      { instanceLocation: '', keywordLocation: '/required', keyword: 'required', params: { missingProperty: 'society' } },
    ]);
  });

  it('rules[].level accepts error, warning and info', () => {
    const withLevel = (level: string) => ({ ...sadaicProfile(), rules: [{ ruleId: 'JDX-CMP-001', level }] });
    for (const level of ['error', 'warning', 'info']) expect(profileErrors(withLevel(level)), level).toEqual([]);
    expect(at(profileErrors(withLevel('fatal')))).toEqual([['/rules/0/level', 'enum']]);
    expect(at(profileErrors({ ...sadaicProfile(), rules: [{ ruleId: 'JDX-CMP-001', parms: {} }] }))).toEqual([
      ['/rules/0/parms', 'additionalProperties'],
    ]);
  });

  it('catalog entry needs es, pt and en', () => {
    expect(catalogErrors({ catalog: '1.0', rules: [coreRule()] })).toEqual([]);
    const rule = coreRule();
    expect(at(catalogErrors({ catalog: '1.0', rules: [{ ...rule, message: { es: 'x', en: 'y' } }] }))).toEqual([['/rules/0/message', 'required']]);
    expect(at(catalogErrors({ catalog: '1.0', rules: [{ ...rule, predicate: { es: 'x', pt: 'y', en: 'z', fr: 'w' } }] }))).toEqual([
      ['/rules/0/predicate/fr', 'additionalProperties'],
    ]);
    expect(at(catalogErrors({ catalog: '1.0', rules: [{ ...rule, message: { es: '', pt: 'y', en: 'z' } }] }))).toEqual([['/rules/0/message/es', 'minLength']]);
    // El nivel es fijo fuera del perfil, y no va en una regla del perfil.
    const { level: _level, ...withoutLevel } = rule;
    expect(at(catalogErrors({ catalog: '1.0', rules: [withoutLevel] }))).toEqual([['/rules/0', 'required']]);
    expect(catalogErrors({ catalog: '1.0', rules: [{ ...withoutLevel, layer: 'profile', check: 'profile' }] })).toEqual([]);
    expect(at(catalogErrors({ catalog: '1.0', rules: [{ ...rule, layer: 'profile', check: 'profile' }] }))).toEqual([['/rules/0/level', 'not']]);
  });

  it('ruleId pattern', () => {
    for (const ruleId of ['JDX-SHR-1', 'jdx-shr-001', 'JDX-SHRX-001', 'SHR-001']) {
      expect(at(profileErrors({ ...sadaicProfile(), rules: [{ ruleId }] })), ruleId).toEqual([['/rules/0/ruleId', 'pattern']]);
      expect(at(catalogErrors({ catalog: '1.0', rules: [{ ...coreRule(), id: ruleId }] })), ruleId).toEqual([['/rules/0/id', 'pattern']]);
    }
  });
});
