/**
 * Catálogo de reglas, perfil I: la declaración, los derechos, los contratos,
 * las obras derivadas, los roles y los autores menores. La autoría se lee
 * sobre la obra entera (a lo sumo 100, y exactamente 100 en un perfil que pide
 * declarar la obra entera), el porcentaje del contrato sobre la parte de cada
 * autor que representa, y las filas de editora tienen que ser lo que da el
 * contrato. Los códigos de la lectura anterior quedan retirados y no se
 * reutilizan.
 */
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { CatalogRule, JsonValue } from '../../../src/types.js';
import { sadaicParams } from '../../helpers/sadaicProfile.js';

const catalog = loadCatalog(JSON.parse(files['catalog/1.0/rules.json'] as string) as JsonValue, defaultValidators());
const rule = (id: string): CatalogRule => {
  const found = catalog.rules.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no está en el catálogo: ${id}`);
  return found;
};
const errorsOf = (schema: object, value: JsonValue) => defaultValidators().validateWith(schema, value).map((e) => [e.instanceLocation, e.keyword]);

const RIGHTS = [
  'JDX-AGR-001', 'JDX-AGR-002', 'JDX-AGR-003', 'JDX-AGR-004', 'JDX-AGR-005', 'JDX-AGR-006',
  'JDX-DEC-001', 'JDX-MIN-001', 'JDX-ROL-001',
  'JDX-SHR-002', 'JDX-SHR-004', 'JDX-SHR-006', 'JDX-SHR-007', 'JDX-SHR-008', 'JDX-WRK-001',
];

describe('catálogo: perfil I (derechos)', () => {
  it('adds exactly DEC-001, SHR-002, SHR-004, SHR-006..008, AGR-001..006, WRK-001, ROL-001 and MIN-001', () => {
    const areas = ['AGR', 'DEC', 'MIN', 'ROL', 'SHR', 'WRK'];
    const found = catalog.rules.filter((r) => r.status === 'active' && r.layer === 'profile' && areas.includes(r.id.slice(4, 7)));
    expect(found.map((r) => r.id)).toEqual(RIGHTS);
    for (const r of found) {
      expect(r, r.id).toMatchObject({ check: 'profile', implemented: true, since: '1.0' });
      // El nivel de una regla de perfil lo da el perfil.
      expect(r.level, r.id).toBeUndefined();
    }
  });

  it('SHR-001, SHR-003 and SHR-005 are retired', () => {
    expect(catalog.rules.filter((r) => r.status === 'retired').map((r) => r.id)).toEqual(
      expect.arrayContaining(['JDX-SHR-001', 'JDX-SHR-003', 'JDX-SHR-005']),
    );
    for (const [id, replacedBy] of [
      ['JDX-SHR-001', ['JDX-SHR-006', 'JDX-SHR-007']],
      ['JDX-SHR-003', ['JDX-AGR-003']],
      ['JDX-SHR-005', ['JDX-SHR-008']],
    ] as const) {
      expect(rule(id), id).toMatchObject({ status: 'retired', implemented: false, layer: 'profile' });
      // El predicado dice qué regla controla ahora lo que hacía, en los tres idiomas.
      for (const text of Object.values(rule(id).predicate)) for (const code of replacedBy) expect(text, id).toContain(code);
    }
  });

  it('profile params schemas accept sadaic/0.1 and reject cap as string or unknown keys', () => {
    for (const id of RIGHTS) expect(errorsOf(rule(id).profileParamsSchema, sadaicParams(id)), id).toEqual([]);
    const agr003 = rule('JDX-AGR-003').profileParamsSchema;
    expect(errorsOf(agr003, { cap: '25', capWithCondition: { value: 33.3333, conditionScheme: 'SADAIC_ART8' } })).toEqual([['/cap', 'type']]);
    expect(errorsOf(agr003, { ...sadaicParams('JDX-AGR-003'), tope: 25 })).toEqual([['/tope', 'additionalProperties']]);
    expect(errorsOf(agr003, { cap: 25 })).toEqual([['', 'required']]);
    expect(errorsOf(agr003, { cap: 125, capWithCondition: { value: 33.3333, conditionScheme: 'art8' } })).toEqual([
      ['/cap', 'maximum'],
      ['/capWithCondition/conditionScheme', 'pattern'],
    ]);
    expect(errorsOf(rule('JDX-AGR-004').profileParamsSchema, { types: ['edition'] })).toEqual([['/types/0', 'enum']]);
    expect(errorsOf(rule('JDX-MIN-001').profileParamsSchema, { ageOfMajority: 18.5 })).toEqual([['/ageOfMajority', 'type']]);
    // Las reglas sin params no admiten ninguno.
    expect(errorsOf(rule('JDX-SHR-006').profileParamsSchema, { cap: 100 })).toEqual([['/cap', 'additionalProperties']]);
  });

  it('SHR-002 result params allow writer; SHR-008 requires agreement and expected', () => {
    const cell = { right: 'performing', country: 'AR', countries: 249, sum: 110, cap: 100 };
    const shr002 = rule('JDX-SHR-002').resultParamsSchema;
    expect(errorsOf(shr002, cell)).toEqual([]);
    expect(errorsOf(shr002, { ...cell, sum: 90, writer: true })).toEqual([]);
    expect(errorsOf(shr002, { ...cell, writer: false })).toEqual([['/writer', 'const']]);
    expect(errorsOf(shr002, { ...cell, right: 'lyrics' })).toEqual([['/right', 'enum']]);
    const shr008 = rule('JDX-SHR-008').resultParamsSchema;
    const total = { agreement: 'a1', right: 'performing', country: 'ES', countries: 1, sum: 37.5, expected: 25 };
    expect(errorsOf(shr008, total)).toEqual([]);
    expect(errorsOf(shr008, { ...total, via: ['p1'], sum: 25, expected: 12.5 })).toEqual([]);
    const { agreement: _agreement, ...withoutAgreement } = total;
    const { expected: _expected, ...withoutExpected } = total;
    expect(errorsOf(shr008, withoutAgreement)).toEqual([['', 'required']]);
    expect(errorsOf(shr008, withoutExpected)).toEqual([['', 'required']]);
    expect(errorsOf(shr008, { ...total, via: [] })).toEqual([['/via', 'minItems']]);
    expect(errorsOf(shr008, { ...total, cap: 25 })).toEqual([['/cap', 'additionalProperties']]);
  });

  it('SHR-006 and SHR-007 result params are { sum }', () => {
    for (const id of ['JDX-SHR-006', 'JDX-SHR-007']) {
      const schema = rule(id).resultParamsSchema;
      expect(schema, id).toEqual({ type: 'object', properties: { sum: { type: 'number', minimum: 0 } }, required: ['sum'], additionalProperties: false });
      expect(errorsOf(schema, { sum: 200 }), id).toEqual([]);
      expect(rule(id).contextSchema, id).toMatchObject({ required: ['work'] });
    }
  });

  it('AGR-003 result params are { percent, cap }', () => {
    const agr003 = rule('JDX-AGR-003');
    expect(Object.keys((agr003.resultParamsSchema as { properties: object }).properties)).toEqual(['percent', 'cap']);
    expect(errorsOf(agr003.resultParamsSchema, { percent: 30, cap: 25 })).toEqual([]);
    expect(errorsOf(agr003.resultParamsSchema, { percent: 30 })).toEqual([['', 'required']]);
    expect(agr003.contextSchema).toMatchObject({ required: ['agreement'] });
    expect(agr003.example).toEqual({ params: { percent: 30, cap: 25 }, context: { agreement: 'a1' } });
  });

  it('context keys are among work, party, agreement, media, recording', () => {
    const keys = ['work', 'party', 'agreement', 'media', 'recording'];
    for (const r of catalog.rules) {
      const schema = r.contextSchema as { type: string; properties?: Record<string, object>; required?: string[]; additionalProperties: boolean };
      expect(schema.type, r.id).toBe('object');
      expect(schema.additionalProperties, r.id).toBe(false);
      for (const key of Object.keys(schema.properties ?? {})) expect(keys, `${r.id}: ${key}`).toContain(key);
      for (const key of schema.required ?? []) expect(Object.keys(schema.properties ?? {}), r.id).toContain(key);
    }
  });
});
