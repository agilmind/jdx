/**
 * Catálogo de reglas (catalog/1.0/rules.json): las reglas de entorno, núcleo
 * y política, cada una con su capa, su bucket de `checks`, su nivel fijo, su
 * predicado y su mensaje en es, pt y en, y los schemas de sus params y de su
 * context. El archivo se arma fusionando fragmentos con
 * scripts/merge-catalog.mjs, que los ordena por id y no admite un id repetido.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main as mergeMain, mergeCatalog } from '../../../scripts/merge-catalog.mjs';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { CatalogRule, JsonValue } from '../../../src/types.js';
import { planter } from '../../helpers/files.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CATALOG_FILE = 'catalog/1.0/rules.json';
const bundled = (): JsonValue => JSON.parse(files[CATALOG_FILE] as string) as JsonValue;
const catalog = loadCatalog(bundled(), defaultValidators());
const rule = (id: string): CatalogRule => {
  const found = catalog.rules.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no está en el catálogo: ${id}`);
  return found;
};
const ids = (rules: readonly CatalogRule[]): string[] => rules.map((r) => r.id);
const active = catalog.rules.filter((r) => r.status === 'active');

const ENVIRONMENT = [
  'JDX-ENV-001', 'JDX-ENV-002', 'JDX-ENV-003', 'JDX-ENV-004', 'JDX-ENV-005',
  'JDX-ENV-006', 'JDX-ENV-007', 'JDX-ENV-008', 'JDX-ENV-009', 'JDX-ENV-010', 'JDX-ENV-011',
];
const CORE = [
  'JDX-DEC-002', 'JDX-DEC-003', 'JDX-DEC-004', 'JDX-DEC-005', 'JDX-INT-001', 'JDX-JSN-001',
  'JDX-MED-001', 'JDX-MED-002', 'JDX-MED-004', 'JDX-MED-006', 'JDX-MED-007', 'JDX-MED-008', 'JDX-MED-009',
  'JDX-NUM-001', 'JDX-NUM-002', 'JDX-REF-001', 'JDX-REF-002', 'JDX-SCH-001',
  'JDX-SIG-002', 'JDX-SIG-003', 'JDX-SIG-004', 'JDX-VER-001', 'JDX-VER-002', 'JDX-VER-003', 'JDX-VER-004',
];
const POLICY = ['JDX-POL-001', 'JDX-POL-002', 'JDX-SIG-001', 'JDX-TRU-001'];
const FIXED = [...ENVIRONMENT, ...CORE, ...POLICY];

const trees = planter('jdx-catalog-');
afterEach(() => trees.cleanup());

describe('catálogo: entorno, núcleo y política', () => {
  it('has exactly the environment, core and policy codes', () => {
    expect(ids(active.filter((r) => r.layer === 'environment'))).toEqual(ENVIRONMENT);
    // SCH-001 es de la capa schema; las demás del núcleo, de core.
    expect(ids(active.filter((r) => r.layer === 'core' || r.layer === 'schema'))).toEqual(CORE);
    expect(rule('JDX-SCH-001').layer).toBe('schema');
    expect(ids(active.filter((r) => r.layer === 'policy'))).toEqual(POLICY);
    // Ordenado por id, y el bundle trae el archivo tal cual.
    expect(ids(catalog.rules)).toEqual([...ids(catalog.rules)].sort());
    expect(catalog.catalog).toBe('1.0');
    expect(files[CATALOG_FILE]).toBe(readFileSync(join(ROOT, CATALOG_FILE), 'utf8'));
  });

  it('fixed levels (VER-003, VER-004, SIG-004, POL-001, POL-002 and TRU-001 warning; DEC-005 info; rest error)', () => {
    const warning = ['JDX-POL-001', 'JDX-POL-002', 'JDX-SIG-004', 'JDX-TRU-001', 'JDX-VER-003', 'JDX-VER-004'];
    for (const id of FIXED) {
      const expected = warning.includes(id) ? 'warning' : id === 'JDX-DEC-005' ? 'info' : 'error';
      expect(rule(id).level, id).toBe(expected);
    }
    // SIG-001 lleva error en el catálogo: el nivel de cada resultado lo da la firma pedida.
    expect(rule('JDX-SIG-001').level).toBe('error');
  });

  it('check buckets (MED-002/007/008 media; SIG-002..004 signature; JSN-001 json; VER-* and SCH-001 schema; SIG-001, POL-*, TRU-001 policy)', () => {
    const bucket = (id: string): string => {
      if (id.startsWith('JDX-ENV-')) return 'environment';
      if (['JDX-MED-002', 'JDX-MED-007', 'JDX-MED-008'].includes(id)) return 'media';
      if (['JDX-SIG-002', 'JDX-SIG-003', 'JDX-SIG-004'].includes(id)) return 'signature';
      if (id === 'JDX-JSN-001') return 'json';
      if (id.startsWith('JDX-VER-') || id === 'JDX-SCH-001') return 'schema';
      if (POLICY.includes(id)) return 'policy';
      return 'core';
    };
    for (const id of FIXED) expect(rule(id).check, id).toBe(bucket(id));
  });

  it('MED-005 is retired', () => {
    const med005 = rule('JDX-MED-005');
    expect(med005).toMatchObject({ status: 'retired', implemented: false, layer: 'profile', since: '1.0' });
    expect(med005.predicate.es).toContain('JDX-MED-010');
    expect(ids(active)).not.toContain('JDX-MED-005');
    // Las demás de entorno, núcleo y política están implementadas.
    for (const id of FIXED) expect(rule(id), id).toMatchObject({ status: 'active', implemented: true, since: '1.0' });
  });

  it('es/pt/en predicate and message', () => {
    for (const r of catalog.rules) {
      for (const texts of [r.predicate, r.message]) {
        expect(Object.keys(texts).sort(), r.id).toEqual(['en', 'es', 'pt']);
        expect(new Set([texts.es, texts.pt, texts.en]).size, `${r.id}: tres idiomas distintos`).toBe(3);
        for (const text of Object.values(texts)) {
          expect(text, r.id).toBe(text.trim());
          expect(text.endsWith('.'), `${r.id}: ${text}`).toBe(true);
        }
      }
    }
  });

  it('resultParams and context schemas compile', () => {
    const validators = defaultValidators();
    for (const r of catalog.rules) {
      // El ejemplo cumple los schemas de los params y del context de su resultado.
      expect(validators.validateWith(r.resultParamsSchema, r.example.params ?? {}), r.id).toEqual([]);
      expect(validators.validateWith(r.contextSchema, (r.example.context ?? {}) as JsonValue), r.id).toEqual([]);
      expect(() => validators.validateWith(r.profileParamsSchema, {}), r.id).not.toThrow();
    }
    // Fuera del perfil no hay params de perfil: el schema admite solo un objeto vacío.
    for (const id of FIXED) {
      const schema = rule(id).profileParamsSchema;
      expect(validators.validateWith(schema, {}), id).toEqual([]);
      expect(validators.validateWith(schema, { cap: 25 }).map((e) => e.keyword), id).toEqual(['additionalProperties']);
    }
    // Un resultado con params de otra forma no cumple: ENV-006 pide el ruleId de la regla que falla.
    const env006 = rule('JDX-ENV-006').resultParamsSchema;
    expect(validators.validateWith(env006, { reason: 'retiredRule', ruleId: 'JDX-SHR-001' })).toEqual([]);
    expect(validators.validateWith(env006, { reason: 'retiredRule' }).map((e) => e.keyword)).toEqual(['required']);
    expect(validators.validateWith(env006, { reason: 'jdxNotAdmitted', jdx: '1.1' })).toEqual([]);
    expect(validators.validateWith(rule('JDX-JSN-001').resultParamsSchema, { reason: 'comment' }).map((e) => e.keyword)).toEqual(['enum']);
  });

  it('place-dependent core rules (REF-002, VER-004, NUM-001 and NUM-002) carry an optional context', () => {
    const validators = defaultValidators();
    const keys = (id: string) => Object.keys((rule(id).contextSchema as { properties?: object }).properties ?? {});
    const all = ['work', 'party', 'agreement', 'media', 'recording'];
    expect([keys('JDX-REF-002'), keys('JDX-VER-004'), keys('JDX-NUM-001'), keys('JDX-NUM-002')]).toEqual([
      all,
      all,
      ['work', 'agreement', 'recording'],
      all,
    ]);
    for (const id of ['JDX-REF-002', 'JDX-VER-004', 'JDX-NUM-001', 'JDX-NUM-002']) {
      expect((rule(id).contextSchema as { required?: string[] }).required, id).toBeUndefined();
      // Sin context vale: un dato de la declaración no es de ninguna lista.
      expect(validators.validateWith(rule(id).contextSchema, {}), id).toEqual([]);
    }
    // Un porcentaje solo está en obras, grabaciones y contratos.
    expect(validators.validateWith(rule('JDX-NUM-001').contextSchema, { party: 'p1' }).map((e) => e.keyword)).toEqual(['additionalProperties']);
  });

  it('merge-catalog keeps ids sorted and refuses duplicates', () => {
    const first = mergeCatalog(null, { catalog: '1.0', rules: [{ id: 'JDX-ENV-002' }, { id: 'JDX-ENV-001' }] });
    expect(first).toEqual({ catalog: '1.0', rules: [{ id: 'JDX-ENV-001' }, { id: 'JDX-ENV-002' }] });
    const second = mergeCatalog(first, { catalog: '1.0', rules: [{ id: 'JDX-CMP-001' }] });
    expect(second.rules.map((r) => r.id)).toEqual(['JDX-CMP-001', 'JDX-ENV-001', 'JDX-ENV-002']);
    expect(first.rules).toHaveLength(2);
    expect(() => mergeCatalog(second, { catalog: '1.0', rules: [{ id: 'JDX-ENV-001' }] })).toThrow('regla repetida: JDX-ENV-001');
    expect(() => mergeCatalog(null, { catalog: '1.0', rules: [{ id: 'JDX-CMP-001' }, { id: 'JDX-CMP-001' }] })).toThrow('regla repetida: JDX-CMP-001');
    expect(() => mergeCatalog(second, { catalog: '1.1', rules: [] })).toThrow('catálogo 1.1');

    // El script escribe catalog/<versión>/rules.json en la raíz dada y no pisa nada si el fragmento repite un id.
    const root = trees.plant({ 'fragmento.json': JSON.stringify({ catalog: '1.0', rules: [{ id: 'JDX-ENV-002' }, { id: 'JDX-ENV-001' }] }) });
    const fragment = join(root, 'fragmento.json');
    expect(mergeMain([fragment, '--root', root])).toBe(0);
    const written = readFileSync(join(root, CATALOG_FILE), 'utf8');
    expect(written).toBe(`${JSON.stringify({ catalog: '1.0', rules: [{ id: 'JDX-ENV-001' }, { id: 'JDX-ENV-002' }] }, null, 2)}\n`);
    expect(mergeMain([fragment, '--root', root])).toBe(1);
    expect(readFileSync(join(root, CATALOG_FILE), 'utf8')).toBe(written);
    writeFileSync(fragment, JSON.stringify({ catalog: '2.0', rules: [{ id: 'JDX-ENV-001' }] }));
    expect(mergeMain([fragment, '--root', root])).toBe(0);
    expect(existsSync(join(root, 'catalog/2.0/rules.json'))).toBe(true);
  });

  it('merge-catalog exits 2 without a readable fragment and 1 with a fragment or catalog that is not JSON or not a catalog', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const root = trees.plant({
        'roto.json': '{ "catalog": "1.0", ',
        'lista.json': '[]',
        'sin-ids.json': JSON.stringify({ catalog: '1.0', rules: [{ code: 'JDX-ENV-001' }] }),
        'sin-version.json': JSON.stringify({ catalog: 'uno', rules: [] }),
        'bueno.json': JSON.stringify({ catalog: '1.0', rules: [{ id: 'JDX-ENV-001' }] }),
      });
      const at = (name: string) => join(root, name);
      // Sin fragmento, o con uno que no se puede leer: uso.
      expect(mergeMain(['--root', root])).toBe(2);
      expect(mergeMain([at('no-existe.json'), '--root', root])).toBe(2);
      expect(mergeMain([root, '--root', root])).toBe(2);
      // Un fragmento que no es JSON o no tiene la forma del catálogo: rechazado, sin escribir nada.
      for (const name of ['roto.json', 'lista.json', 'sin-ids.json', 'sin-version.json']) expect(mergeMain([at(name), '--root', root]), name).toBe(1);
      expect(existsSync(join(root, 'catalog'))).toBe(false);
      // Un catálogo que ya está y no es JSON: rechazado, sin pisarlo.
      expect(mergeMain([at('bueno.json'), '--root', root])).toBe(0);
      writeFileSync(join(root, CATALOG_FILE), '{ roto');
      expect(mergeMain([at('bueno.json'), '--root', root])).toBe(1);
      expect(readFileSync(join(root, CATALOG_FILE), 'utf8')).toBe('{ roto');
      expect(errors.mock.calls.map(([text]) => String(text).replace(root, '<raíz>'))).toEqual([
        'uso: node scripts/merge-catalog.mjs <fragmento.json> [--root <dir>]',
        'merge-catalog: no se puede leer <raíz>/no-existe.json (ENOENT)',
        'merge-catalog: no se puede leer <raíz> (EISDIR)',
        'merge-catalog: <raíz>/roto.json no es JSON',
        'merge-catalog: <raíz>/lista.json no tiene la forma { catalog: "M.m", rules: [{ id }…] }',
        'merge-catalog: <raíz>/sin-ids.json no tiene la forma { catalog: "M.m", rules: [{ id }…] }',
        'merge-catalog: <raíz>/sin-version.json no tiene la forma { catalog: "M.m", rules: [{ id }…] }',
        'merge-catalog: <raíz>/catalog/1.0/rules.json no es JSON',
      ]);
    } finally {
      errors.mockRestore();
    }
  });

  it('loadCatalog refuses a catalog off its schema, repeated or unsorted ids, schemas that do not compile and examples that do not match', () => {
    const validators = defaultValidators();
    const base = bundled() as { catalog: string; rules: JsonValue[] };
    const entry = (id: string) => base.rules.find((r) => (r as { id: string }).id === id) as { [k: string]: JsonValue };
    const env001 = entry('JDX-ENV-001');
    const withRules = (rules: JsonValue[]): JsonValue => ({ catalog: '1.0', rules });
    expect(() => loadCatalog({ catalog: '1.0' }, validators)).toThrow('catalog.schema.json');
    expect(() => loadCatalog(withRules([env001, env001]), validators)).toThrow('regla repetida en el catálogo: JDX-ENV-001');
    expect(() => loadCatalog(withRules([entry('JDX-ENV-002'), env001]), validators)).toThrow('orden de id');
    expect(() => loadCatalog(withRules([{ ...env001, contextSchema: { type: 'object', unknownKeyword: true } }]), validators)).toThrow(
      'JDX-ENV-001: contextSchema no compila',
    );
    expect(() => loadCatalog(withRules([{ ...env001, example: { params: { reason: 'lost' } } }]), validators)).toThrow(
      'JDX-ENV-001: el ejemplo no cumple resultParamsSchema',
    );
    // Lo que devuelve está congelado y no comparte objetos con la entrada.
    const input = bundled();
    const loaded = loadCatalog(input, validators);
    expect(Object.isFrozen(loaded) && Object.isFrozen(loaded.rules[0]) && Object.isFrozen(loaded.rules[0]?.message)).toBe(true);
    expect(Object.isFrozen((input as { rules: object[] }).rules[0])).toBe(false);
  });
});
