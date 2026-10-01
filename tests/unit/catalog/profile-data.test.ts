/**
 * Catálogo de reglas, perfil II: identificadores, códigos de territorio,
 * sociedad y clasificación, referencias, completitud de obras y personas, la
 * edición y los archivos. Con estas el catálogo queda completo: 75 reglas
 * activas (10 de entorno, 25 del núcleo, 36 de perfil y 4 de política) y
 * cuatro retiradas.
 */
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { CatalogRule, JsonValue } from '../../../src/types.js';

const catalog = loadCatalog(JSON.parse(files['catalog/1.0/rules.json'] as string) as JsonValue, defaultValidators());
const rule = (id: string): CatalogRule => {
  const found = catalog.rules.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no está en el catálogo: ${id}`);
  return found;
};
const ids = (rules: readonly CatalogRule[]): string[] => rules.map((r) => r.id);
const errorsOf = (schema: object, value: JsonValue) => defaultValidators().validateWith(schema, value).map((e) => [e.instanceLocation, e.keyword]);
const active = catalog.rules.filter((r) => r.status === 'active');

const DATA = [
  'JDX-CLS-001',
  'JDX-CMP-001', 'JDX-CMP-002', 'JDX-CMP-003', 'JDX-CMP-004', 'JDX-CMP-005', 'JDX-CMP-006', 'JDX-CMP-007',
  'JDX-EDN-001',
  'JDX-IDN-001', 'JDX-IDN-002', 'JDX-IDN-003', 'JDX-IDN-004', 'JDX-IDN-005', 'JDX-IDN-006',
  'JDX-MED-003', 'JDX-MED-010', 'JDX-REF-003', 'JDX-REF-004', 'JDX-SOC-001', 'JDX-TER-001',
];

/** Las 75 reglas activas del catálogo 1.0, en orden de id. */
const ACTIVE = [
  'JDX-AGR-001', 'JDX-AGR-002', 'JDX-AGR-003', 'JDX-AGR-004', 'JDX-AGR-005', 'JDX-AGR-006',
  'JDX-CLS-001',
  'JDX-CMP-001', 'JDX-CMP-002', 'JDX-CMP-003', 'JDX-CMP-004', 'JDX-CMP-005', 'JDX-CMP-006', 'JDX-CMP-007',
  'JDX-DEC-001', 'JDX-DEC-002', 'JDX-DEC-003', 'JDX-DEC-004', 'JDX-DEC-005',
  'JDX-EDN-001',
  'JDX-ENV-001', 'JDX-ENV-002', 'JDX-ENV-003', 'JDX-ENV-004', 'JDX-ENV-005',
  'JDX-ENV-006', 'JDX-ENV-007', 'JDX-ENV-008', 'JDX-ENV-009', 'JDX-ENV-010',
  'JDX-IDN-001', 'JDX-IDN-002', 'JDX-IDN-003', 'JDX-IDN-004', 'JDX-IDN-005', 'JDX-IDN-006',
  'JDX-INT-001', 'JDX-JSN-001',
  'JDX-MED-001', 'JDX-MED-002', 'JDX-MED-003', 'JDX-MED-004', 'JDX-MED-006', 'JDX-MED-007', 'JDX-MED-008', 'JDX-MED-009', 'JDX-MED-010',
  'JDX-MIN-001', 'JDX-NUM-001', 'JDX-NUM-002', 'JDX-POL-001', 'JDX-POL-002',
  'JDX-REF-001', 'JDX-REF-002', 'JDX-REF-003', 'JDX-REF-004', 'JDX-ROL-001', 'JDX-SCH-001',
  'JDX-SHR-002', 'JDX-SHR-004', 'JDX-SHR-006', 'JDX-SHR-007', 'JDX-SHR-008',
  'JDX-SIG-001', 'JDX-SIG-002', 'JDX-SIG-003', 'JDX-SIG-004',
  'JDX-SOC-001', 'JDX-TER-001', 'JDX-TRU-001',
  'JDX-VER-001', 'JDX-VER-002', 'JDX-VER-003', 'JDX-VER-004', 'JDX-WRK-001',
];

describe('catálogo: perfil II (datos)', () => {
  it('adds exactly IDN-001..006, TER-001, SOC-001, CLS-001, REF-003, REF-004, CMP-001..007, EDN-001, MED-003 and MED-010', () => {
    const areas = ['CLS', 'CMP', 'EDN', 'IDN', 'MED', 'REF', 'SOC', 'TER'];
    const found = active.filter((r) => r.layer === 'profile' && areas.includes(r.id.slice(4, 7)));
    expect(ids(found)).toEqual(DATA);
    for (const r of found) {
      expect(r.since, r.id).toBe('1.0');
      expect(r.level, r.id).toBeUndefined();
    }
  });

  it('the profile layer has exactly 36 codes', () => {
    const profile = active.filter((r) => r.layer === 'profile');
    expect(profile).toHaveLength(36);
    // Las del perfil I y las de esta tarea, sin repetir.
    expect(new Set(ids(profile)).size).toBe(36);
    expect(ids(profile)).toEqual(expect.arrayContaining([...DATA, 'JDX-DEC-001', 'JDX-SHR-008', 'JDX-AGR-003', 'JDX-MIN-001']));
  });

  it('MED-003 is in the media bucket, MED-010 in profile', () => {
    expect(rule('JDX-MED-003')).toMatchObject({ layer: 'profile', check: 'media' });
    expect(rule('JDX-MED-010')).toMatchObject({ layer: 'profile', check: 'profile' });
    // Las demás de perfil cuentan en profile.
    for (const id of DATA.filter((code) => code !== 'JDX-MED-003')) expect(rule(id).check, id).toBe('profile');
  });

  it('IDN-004 is not implemented', () => {
    expect(rule('JDX-IDN-004')).toMatchObject({ status: 'active', implemented: false, layer: 'profile' });
    expect(active.filter((r) => !r.implemented).map((r) => r.id)).toEqual(['JDX-IDN-004']);
  });

  it('CMP-002, CMP-003 and CMP-006 params schemas accept sadaic/0.1', () => {
    const sadaic: Record<string, { [k: string]: JsonValue }> = {
      'JDX-CMP-002': { scheme: 'SADAIC_GENRE' },
      'JDX-CMP-003': { registry: 'DNDA_AR' },
      'JDX-CMP-006': { country: 'AR' },
    };
    for (const id of DATA) expect(errorsOf(rule(id).profileParamsSchema, sadaic[id] ?? {}), id).toEqual([]);
    expect(errorsOf(rule('JDX-CMP-002').profileParamsSchema, {})).toEqual([['', 'required']]);
    expect(errorsOf(rule('JDX-CMP-002').profileParamsSchema, { scheme: 'sadaic-genres' })).toEqual([['/scheme', 'pattern']]);
    expect(errorsOf(rule('JDX-CMP-003').profileParamsSchema, { registry: 'DNDA_AR', part: 'music' })).toEqual([['/part', 'additionalProperties']]);
    expect(errorsOf(rule('JDX-CMP-006').profileParamsSchema, { country: 'ARG' })).toEqual([['/country', 'pattern']]);
    // CMP-003 da un resultado por parte: params.part es music o lyrics.
    expect(errorsOf(rule('JDX-CMP-003').resultParamsSchema, { registry: 'DNDA_AR', part: 'both' })).toEqual([['/part', 'enum']]);
  });

  it('the catalog has exactly 75 active codes and JDX-MED-005, JDX-SHR-001, JDX-SHR-003 and JDX-SHR-005 retired', () => {
    expect(ids(active)).toEqual(ACTIVE);
    expect(ids(catalog.rules.filter((r) => r.status === 'retired'))).toEqual(['JDX-MED-005', 'JDX-SHR-001', 'JDX-SHR-003', 'JDX-SHR-005']);
    expect(catalog.rules).toHaveLength(79);
    const byLayer = (layers: string[]) => active.filter((r) => layers.includes(r.layer)).length;
    expect([byLayer(['environment']), byLayer(['core', 'schema']), byLayer(['profile']), byLayer(['policy'])]).toEqual([10, 25, 36, 4]);
  });
});
