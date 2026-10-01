/**
 * Listas abiertas: un archivo `values/<lista>.json` por lista abierta de
 * types.json, fechado `2026-10`, con al menos sus valores iniciales y el
 * formato de `schema/values/open-list.schema.json`, que admite `schemes`.
 * Crecen a mano, sin tocar el schema del documento.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PATTERNS } from '../../../src/conventions/patterns.js';
import { files } from '../../../src/generated/data.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { JsonValue, OpenValueList, TypesSource } from '../../../src/types.js';
import { loadOpenLists, VALUE_FILES } from '../../../src/values/load.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const SOURCE = JSON.parse(read('schema/src/types.json')) as TypesSource;
const NAMES = Object.keys(SOURCE.openLists).sort();
const OPEN_LIST_SCHEMA = JSON.parse(read('schema/values/open-list.schema.json')) as object;

/** Los archivos de values/ que no son listas abiertas (países, TIS, sociedades y las listas de los esquemas). */
const OTHER_FILES: ReadonlySet<string> = new Set(Object.values(VALUE_FILES));
/** Las listas abiertas en disco, por nombre. */
function openListsOnDisk(): string[] {
  return readdirSync(join(ROOT, 'values'))
    .filter((name) => name.endsWith('.json') && !OTHER_FILES.has(`values/${name}`))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}
const list = (name: string): OpenValueList => JSON.parse(read(`values/${name}.json`)) as OpenValueList;
const codes = (name: string): string[] => list(name).values.map((entry) => entry.code);
const errorsOf = (value: JsonValue) => defaultValidators().validateWith(OPEN_LIST_SCHEMA, value).map((e) => [e.instanceLocation, e.keyword]);

describe('listas abiertas', () => {
  it('one file per open list of types.json (27)', () => {
    expect(NAMES).toHaveLength(27);
    expect(openListsOnDisk()).toEqual(NAMES);
    for (const name of NAMES) expect(list(name).list, name).toBe(name);
    expect(list('nameTypes')).toEqual({
      list: 'nameTypes',
      version: '2026-10',
      values: [{ code: 'legal' }, { code: 'pseudonym' }, { code: 'trade' }],
    });
  });

  it('each file contains the initial values of types.json', () => {
    for (const [name, spec] of Object.entries(SOURCE.openLists)) {
      const found = codes(name);
      expect(found, name).toEqual(expect.arrayContaining(spec.initial));
      expect(new Set(found).size, name).toBe(found.length);
      // Cada valor con el patrón del estilo de su lista, y ninguno propio (X_): esos no se comparan con las listas.
      const pattern = spec.style === 'enum' ? PATTERNS.enumValue : PATTERNS.schemeValue;
      for (const code of found) {
        expect(pattern.test(code), `${name}: ${code}`).toBe(true);
        expect(code.startsWith('X_'), `${name}: ${code}`).toBe(false);
      }
    }
    expect(codes('titleTypes')).toEqual(SOURCE.openLists.titleTypes?.initial);
    expect(codes('mediaKinds')).toContain('taxIdCertificate');
  });

  it('version is 2026-10 everywhere', () => {
    const all = readdirSync(join(ROOT, 'values')).filter((name) => name.endsWith('.json'));
    expect(all.length).toBeGreaterThanOrEqual(27);
    for (const name of all) expect((JSON.parse(read(`values/${name}`)) as { version: string }).version, name).toBe('2026-10');
  });

  it('instrumentSchemes is empty', () => {
    expect(SOURCE.openLists.instrumentSchemes).toEqual({ initial: [], style: 'scheme' });
    expect(list('instrumentSchemes')).toEqual({ list: 'instrumentSchemes', version: '2026-10', values: [] });
  });

  it('identifierTypes maps tax types to TAX_ID and document types to NATIONAL_ID through schemes', () => {
    const byScheme = new Map<string, string[]>();
    for (const entry of list('identifierTypes').values) {
      expect(entry.schemes, entry.code).toHaveLength(1);
      const scheme = entry.schemes?.[0] as string;
      byScheme.set(scheme, [...(byScheme.get(scheme) ?? []), entry.code]);
    }
    expect(Object.fromEntries(byScheme)).toEqual({
      TAX_ID: ['CUIT', 'CUIL', 'CDI', 'CPF', 'CNPJ', 'RFC', 'RUT', 'NIT', 'RUC', 'RIF'],
      NATIONAL_ID: ['DNI', 'CI', 'CURP', 'CEDULA', 'RG', 'RUN', 'PASSPORT'],
    });
    // Los dos son esquemas de la lista de esquemas de identificador, y ninguna otra lista lleva schemes.
    expect(codes('identifierSchemes')).toEqual(expect.arrayContaining(['TAX_ID', 'NATIONAL_ID']));
    for (const name of NAMES.filter((n) => n !== 'identifierTypes')) {
      expect(list(name).values.filter((entry) => entry.schemes !== undefined), name).toEqual([]);
    }
  });

  it('open-list schema admits schemes only as scheme codes', () => {
    for (const name of NAMES) expect(errorsOf(list(name) as unknown as JsonValue), name).toEqual([]);
    const withEntry = (entry: JsonValue): JsonValue => ({ list: 'identifierTypes', version: '2026-10', values: [entry] });
    expect(errorsOf(withEntry({ code: 'CUIT', schemes: ['TAX_ID', 'X_JUPITER_TAX'] }))).toEqual([]);
    expect(errorsOf(withEntry({ code: 'CUIT', schemes: ['tax_id'] }))).toEqual([['/values/0/schemes/0', 'pattern']]);
    expect(errorsOf(withEntry({ code: 'CUIT', schemes: ['TAX-ID'] }))).toEqual([['/values/0/schemes/0', 'pattern']]);
    expect(errorsOf(withEntry({ code: 'CUIT', schemes: 'TAX_ID' }))).toEqual([['/values/0/schemes', 'type']]);
    expect(errorsOf(withEntry({ code: 'CUIT', schemes: [] }))).toEqual([['/values/0/schemes', 'minItems']]);
    expect(errorsOf(withEntry({ code: 'CUIT', schemes: ['TAX_ID', 'TAX_ID'] }))).toEqual([['/values/0/schemes', 'uniqueItems']]);
    // El resto del formato: code de enumeración o de esquema, sin valores propios; name con es, pt o en.
    expect(errorsOf(withEntry({ code: 'originalPublisher', name: { es: 'Editora original', en: 'Original publisher' } }))).toEqual([]);
    expect(errorsOf(withEntry({ code: 'X_JUPITER_STEM' }))).toEqual([['/values/0/code', 'pattern']]);
    expect(errorsOf(withEntry({ code: 'Cuit' }))).toEqual([['/values/0/code', 'pattern']]);
    expect(errorsOf(withEntry({ code: 'CUIT', name: {} }))).toEqual([['/values/0/name', 'minProperties']]);
    expect(errorsOf(withEntry({ code: 'CUIT', name: { fr: 'x' } }))).toEqual([['/values/0/name/fr', 'additionalProperties']]);
    expect(errorsOf(withEntry({ code: 'CUIT', country: 'AR' }))).toEqual([['/values/0/country', 'additionalProperties']]);
    expect(errorsOf({ list: 'identifierTypes', version: '2026-1', values: [] })).toEqual([['/version', 'pattern']]);
    expect(errorsOf({ list: 'identifier_types', version: '2026-10', values: [] })).toEqual([['/list', 'pattern']]);
  });

  it('loadOpenLists exposes the 27 lists by name', () => {
    const lists = loadOpenLists(files);
    expect([...lists.keys()].sort()).toEqual(NAMES);
    for (const name of NAMES) expect(lists.get(name), name).toEqual(list(name));
    const titleTypes = lists.get('titleTypes') as OpenValueList;
    expect(Object.isFrozen(titleTypes) && Object.isFrozen(titleTypes.values) && Object.isFrozen(titleTypes.values[0])).toBe(true);
    // Solo values/<lista>.json de una lista abierta: ni los otros archivos de values/ ni lo que no está en values/.
    const other = {
      'values/titleTypes.json': files['values/titleTypes.json'] as string,
      'values/tis.json': '{ "list": "tis", "version": "2026-10", "entries": [] }',
      'values/sadaic-art8.json': '{ "list": "sadaic-art8", "version": "2026-10", "values": [] }',
      'values/sub/x.json': '{}',
      'schema/values/open-list.schema.json': '{}',
    };
    expect([...loadOpenLists(other).keys()]).toEqual(['titleTypes']);
    // Un archivo cuyo list no es su nombre es un error de empaquetado.
    expect(() => loadOpenLists({ 'values/titleTypes.json': '{ "list": "nameTypes", "version": "2026-10", "values": [] }' })).toThrow(
      'values/titleTypes.json: list es "nameTypes", no titleTypes',
    );
  });
});
