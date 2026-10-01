/**
 * Géneros SADAIC (values/sadaic-genres.json): la lista oficial de
 * 2006, con 305 subgéneros. Códigos de 1 a 3 dígitos, como texto y sin ceros a
 * la izquierda; la lista repite códigos (114, 302), así que un género se
 * identifica por el par (`code`, `name`), que controla JDX-CLS-001. La genera
 * `npm run gen` desde schema/src/sadaic-generos-2006.txt (scripts/gen-values.mjs).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateGenres } from '../../../scripts/gen-values.mjs';
import { files } from '../../../src/generated/data.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { GenreEntry, JsonValue } from '../../../src/types.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE = readFileSync(join(ROOT, 'schema/src/sadaic-generos-2006.txt'), 'utf8');
const GENRES = JSON.parse(files['values/sadaic-genres.json'] as string) as { list: string; version: string; entries: GenreEntry[] };
const SCHEMA = JSON.parse(files['schema/values/genres.schema.json'] as string) as object;
const errorsOf = (value: unknown) => defaultValidators().validateWith(SCHEMA, value as JsonValue).map((e) => [e.instanceLocation, e.keyword]);
const namesOf = (code: string): string[] => GENRES.entries.filter((g) => g.code === code).map((g) => g.name);
/** Una página de la lista oficial con las filas dadas, con su encabezado y su pie. */
const page = (...rows: string[]): string =>
  ['\f                                POR SUBGENERO', '', '                     LISTADO DE GENEROS AUTORIZADOS', 'ACTUALIZADO AL 10 / 10 / 2006',
    '         SUBGENERO                    CODIGO            GENERO', ...rows, '', '                                   Página 1', ''].join('\n');

describe('géneros SADAIC 2006', () => {
  it('305 entries', () => {
    expect(GENRES.list).toBe('sadaic-genres');
    expect(GENRES.version).toBe('2026-10');
    expect(GENRES.entries).toHaveLength(305);
    expect(errorsOf(GENRES)).toEqual([]);
    expect(`${JSON.stringify(generateGenres(SOURCE, '2026-10'), null, 2)}\n`).toBe(files['values/sadaic-genres.json']);
    // En el orden de la lista oficial (por subgénero), de AFRO a ZORTZICO.
    expect(GENRES.entries[0]).toEqual({ code: '500', name: 'AFRO', group: 'INTERNACIONAL' });
    expect(GENRES.entries.at(-1)).toEqual({ code: '585', name: 'ZORTZICO', group: 'INTERNACIONAL' });
    // Una línea que no es una fila ni parte del encabezado o del pie no se saltea: el generador lanza.
    expect(generateGenres(page('ZAMBA                                    345    FOLKLORE'), '2026-10').entries).toEqual([
      { code: '345', name: 'ZAMBA', group: 'FOLKLORE' },
    ]);
    expect(() => generateGenres(page('ZAMBA 345 FOLKLORE'), '2026-10')).toThrow('línea 6 de la lista de géneros: "ZAMBA 345 FOLKLORE"');
  });

  it('group counts 122/56/81/40/6', () => {
    const counts: Record<string, number> = {};
    for (const genre of GENRES.entries) counts[genre.group] = (counts[genre.group] ?? 0) + 1;
    expect(counts).toEqual({ INTERNACIONAL: 122, 'SINFONICO Y CAMARA': 56, FOLKLORE: 81, MELODICO: 40, POPULAR: 6 });
  });

  it('codes of 1 to 3 digits without leading zeros', () => {
    for (const genre of GENRES.entries) expect(/^[1-9]\d{0,2}$/.test(genre.code), `${genre.code} ${genre.name}`).toBe(true);
    expect(new Set(GENRES.entries.map((g) => g.code)).size).toBe(303);
    expect(errorsOf({ ...GENRES, entries: [{ code: '04', name: 'TANGO', group: 'POPULAR' }] })).toEqual([['/entries/0/code', 'pattern']]);
    expect(errorsOf({ ...GENRES, entries: [{ code: 4, name: 'TANGO', group: 'POPULAR' }] })).toEqual([['/entries/0/code', 'type']]);
    expect(() => generateGenres(page('TANGO                                    04     POPULAR'), '2026-10')).toThrow(
      'código de género mal formado: TANGO 04',
    );
  });

  it('TANGO is 4', () => {
    expect(GENRES.entries.filter((g) => g.name === 'TANGO')).toEqual([{ code: '4', name: 'TANGO', group: 'POPULAR' }]);
    expect(GENRES.entries.find((g) => g.code === '605')).toEqual({ code: '605', name: 'JAZZ', group: 'INTERNACIONAL' });
  });

  it('311 CHACARERA and 345 ZAMBA exist', () => {
    expect(namesOf('311')).toEqual(['CHACARERA']);
    expect(namesOf('345')).toEqual(['ZAMBA']);
    expect(GENRES.entries.find((g) => g.code === '311')?.group).toBe('FOLKLORE');
  });

  it('114 is JINGLE and MELODIA', () => {
    expect(namesOf('114')).toEqual(['JINGLE', 'MELODIA']);
  });

  it('302 is BAILES and CACHARPAYA', () => {
    expect(namesOf('302')).toEqual(['BAILES', 'CACHARPAYA']);
  });

  it('(code, name) pairs are unique', () => {
    const pairs = GENRES.entries.map((g) => `${g.code}\u0000${g.name}`);
    expect(new Set(pairs).size).toBe(305);
    // Solo 114 y 302 repiten código.
    const repeated = [...new Set(GENRES.entries.map((g) => g.code))].filter((code) => namesOf(code).length > 1);
    expect(repeated.sort()).toEqual(['114', '302']);
    expect(() =>
      generateGenres(page('ZAMBA                                    345    FOLKLORE', 'ZAMBA                                    345    FOLKLORE'), '2026-10'),
    ).toThrow('género repetido: 345 ZAMBA');
  });

  it('names are NFC', () => {
    for (const genre of GENRES.entries) expect(genre.name, genre.code).toBe(genre.name.normalize('NFC'));
    expect(GENRES.entries.find((g) => g.code === '501')).toEqual({ code: '501', name: 'AIRES ESPAÑOLES', group: 'INTERNACIONAL' });
    // Una fuente escrita en NFD da los mismos nombres.
    const nfd = page(`${'AIRES ESPAÑOLES'.normalize('NFD')}                          501    INTERNACIONAL`);
    expect(generateGenres(nfd, '2026-10').entries).toEqual([{ code: '501', name: 'AIRES ESPAÑOLES', group: 'INTERNACIONAL' }]);
  });
});
