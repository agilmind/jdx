/**
 * Todas las listas de valores empaquetadas como `ValueLists`
 * (src/values/load.ts): las 27 listas abiertas, TIS, sociedades, países,
 * géneros y las listas de los esquemas `SADAIC_ART8` y `SADAIC_CONTRACT`, todas
 * de la misma versión fechada. Cada archivo de values/ cumple su schema.
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { files } from '../../../src/generated/data.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { JsonValue } from '../../../src/types.js';
import { loadValues, VALUE_FILES } from '../../../src/values/load.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const parse = (path: string): { list: string; version: string; entries?: unknown[]; values?: unknown[] } =>
  JSON.parse(files[path] as string) as { list: string; version: string };

/** El schema de cada archivo de values/: los que no son listas abiertas tienen el suyo; el resto, el de lista abierta. */
const SCHEMA_OF: Readonly<Record<string, string>> = {
  [VALUE_FILES.tis]: 'schema/values/tis.schema.json',
  [VALUE_FILES.societies]: 'schema/values/societies.schema.json',
  [VALUE_FILES.countries]: 'schema/values/countries.schema.json',
  [VALUE_FILES.sadaicGenres]: 'schema/values/genres.schema.json',
};
const OPEN_LIST_SCHEMA = 'schema/values/open-list.schema.json';
const schemas = new Map<string, object>();
const schemaFor = (path: string): object => {
  const schemaPath = SCHEMA_OF[path] ?? OPEN_LIST_SCHEMA;
  if (!schemas.has(schemaPath)) schemas.set(schemaPath, JSON.parse(files[schemaPath] as string) as object);
  return schemas.get(schemaPath) as object;
};

describe('loadValues', () => {
  it('loadValues returns every list with version 2026-10', () => {
    const values = loadValues(files);
    expect(values.version).toBe('2026-10');
    expect(values.open.size).toBe(27);
    for (const [name, list] of values.open) expect(list.version, name).toBe('2026-10');
    expect(values.tis).toEqual(parse(VALUE_FILES.tis).entries);
    expect(values.tis).toHaveLength(250);
    expect(values.societies).toEqual(parse(VALUE_FILES.societies).entries);
    expect(values.societies).toHaveLength(6);
    expect(values.countries).toEqual(parse(VALUE_FILES.countries).entries);
    expect(values.countries).toHaveLength(249);
    expect(values.sadaicGenres).toEqual(parse(VALUE_FILES.sadaicGenres).entries);
    expect(values.sadaicGenres).toHaveLength(305);
    expect(values.sadaicArt8).toEqual(parse(VALUE_FILES.sadaicArt8));
    expect(values.sadaicContract).toEqual(parse(VALUE_FILES.sadaicContract));
    // Congelado entero: las mismas listas sirven a todas las validaciones.
    expect(Object.isFrozen(values) && Object.isFrozen(values.tis) && Object.isFrozen(values.tis[0])).toBe(true);
    expect(Object.isFrozen(values.sadaicGenres[0]) && Object.isFrozen(values.sadaicArt8.values)).toBe(true);
    // Un bundle con versiones mezcladas, sin un archivo o con un list cambiado es un error de empaquetado.
    const tis = files[VALUE_FILES.tis] as string;
    expect(() => loadValues({ ...files, [VALUE_FILES.tis]: tis.replace('"version": "2026-10"', '"version": "2026-11"') })).toThrow(
      'las listas de valores tienen versiones distintas: 2026-10, 2026-11',
    );
    const { [VALUE_FILES.societies]: _societies, ...withoutSocieties } = files;
    expect(() => loadValues(withoutSocieties)).toThrow('el bundle no trae values/societies.json');
    expect(() => loadValues({ ...files, [VALUE_FILES.tis]: tis.replace('"list": "tis"', '"list": "countries"') })).toThrow(
      'values/tis.json: list es "countries", no tis',
    );
  });

  it('every values file conforms to its schema', () => {
    const bundled = Object.keys(files).filter((path) => path.startsWith('values/'));
    // Los 33 archivos de values/: 27 listas abiertas y los seis de VALUE_FILES, todos en el bundle.
    expect(bundled).toHaveLength(33);
    expect(bundled).toEqual(expect.arrayContaining(Object.values(VALUE_FILES)));
    const onDisk = readdirSync(`${ROOT}values`).filter((name) => name.endsWith('.json')).map((name) => `values/${name}`);
    expect(bundled).toEqual(onDisk.sort());
    for (const path of bundled) {
      expect(defaultValidators().validateWith(schemaFor(path), parse(path) as unknown as JsonValue), path).toEqual([]);
      expect(parse(path).list, path).toBe(path.slice('values/'.length, -'.json'.length));
    }
    // Las listas de los esquemas usan el formato de las listas abiertas.
    expect(SCHEMA_OF[VALUE_FILES.sadaicArt8]).toBeUndefined();
    expect(SCHEMA_OF[VALUE_FILES.sadaicContract]).toBeUndefined();
  });
});
