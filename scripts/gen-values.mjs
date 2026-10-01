/**
 * Listas de valores que salen de las fuentes de schema/src. `npm run gen`
 * las escribe y `gen:check` las controla, como el resto de lo generado:
 *
 * - values/countries.json: los 249 países de ISO 3166-1 de
 *   schema/src/countries.source.json, en orden de alfa-2, con su numérico y sus
 *   nombres en es, pt y en tal como están en la fuente. Los nombres se
 *   generaron una sola vez, con lo que registra `generatedWith` de la fuente;
 *   este script los copia y nunca los vuelve a calcular.
 * - values/tis.json: una entrada `country` por país, con el numérico en 4
 *   dígitos (0032 = AR), y el grupo 2136 con los 249 países como `members`
 *   (alfa-2), en orden de código: los territorios que expande sadaic/0.1.
 * - values/sadaic-genres.json: los 305 subgéneros de la lista oficial de 2006
 *   (schema/src/sadaic-generos-2006.txt), en su orden, cada uno con su código
 *   como texto, su nombre en NFC y su género.
 *
 * Una fuente con un país repetido, un código mal formado, un nombre vacío, un
 * género repetido o una línea que no se entiende no genera: lanza.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** @typedef {{ es: string, pt: string, en: string }} Names */
/** @typedef {{ iso2: string, numeric: string, name: Names }} Country */
/** @typedef {{ code: string, kind: 'country' | 'group', iso2?: string, members?: string[] }} TisEntry */

const LANGS = /** @type {const} */ (['es', 'pt', 'en']);

/** @param {string} a @param {string} b */
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** JSON con dos espacios y salto final, como todo lo generado. @param {unknown} value */
function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * values/countries.json desde la fuente.
 * @param {{ countries: Country[] }} source
 * @param {string} version
 * @returns {{ list: 'countries', version: string, entries: Country[] }}
 */
export function generateCountries(source, version) {
  const seen = new Set();
  const entries = [...source.countries]
    .sort((a, b) => byText(a.iso2, b.iso2))
    .map(({ iso2, numeric, name }) => {
      if (!/^[A-Z]{2}$/.test(iso2) || !/^\d{3}$/.test(numeric)) throw new Error(`país mal formado en la fuente: ${iso2} ${numeric}`);
      if (seen.has(iso2) || seen.has(numeric)) throw new Error(`país repetido en la fuente: ${iso2} ${numeric}`);
      seen.add(iso2).add(numeric);
      for (const lang of LANGS) {
        if (typeof name?.[lang] !== 'string' || name[lang] === '') throw new Error(`${iso2} sin nombre ${lang} en la fuente`);
      }
      return { iso2, numeric, name: { es: name.es, pt: name.pt, en: name.en } };
    });
  return { list: 'countries', version, entries };
}

/**
 * values/tis.json desde la fuente: los países y el grupo 2136, en orden de código.
 * @param {{ countries: Country[] }} source
 * @param {string} version
 * @returns {{ list: 'tis', version: string, entries: TisEntry[] }}
 */
export function generateTis(source, version) {
  const countries = generateCountries(source, version).entries;
  /** @type {TisEntry[]} */
  const entries = countries.map(({ iso2, numeric }) => ({ code: numeric.padStart(4, '0'), kind: 'country', iso2 }));
  entries.push({ code: '2136', kind: 'group', members: countries.map(({ iso2 }) => iso2) });
  return { list: 'tis', version, entries: entries.sort((a, b) => byText(a.code, b.code)) };
}

/** Una fila de la lista de géneros: subgénero, código y género, separados por dos espacios o más. */
const GENRE_ROW = /^(\S(?:.*?\S)?) {2,}(\d+) {2,}(\S(?:.*\S)?)$/;
/** Lo que repite cada página de la lista: título, fecha, encabezado de columnas, número de página y líneas en blanco. */
const GENRE_LAYOUT = /^\f?\s*(?:POR SUBGENERO|LISTADO DE GENEROS AUTORIZADOS|ACTUALIZADO AL [\d /]+|SUBGENERO\s+CODIGO\s+GENERO|Página \d+)?\s*$/;

/**
 * values/sadaic-genres.json desde el texto de la lista oficial.
 * @param {string} text
 * @param {string} version
 * @returns {{ list: 'sadaic-genres', version: string, entries: { code: string, name: string, group: string }[] }}
 */
export function generateGenres(text, version) {
  const seen = new Set();
  const entries = [];
  for (const [i, line] of text.split('\n').entries()) {
    const row = GENRE_ROW.exec(line);
    if (row === null) {
      if (!GENRE_LAYOUT.test(line)) throw new Error(`línea ${i + 1} de la lista de géneros: ${JSON.stringify(line)}`);
      continue;
    }
    const [, rawName, code, group] = /** @type {[string, string, string, string]} */ (row);
    const name = rawName.normalize('NFC');
    if (!/^[1-9]\d{0,2}$/.test(code)) throw new Error(`código de género mal formado: ${name} ${code}`);
    if (seen.has(`${code} ${name}`)) throw new Error(`género repetido: ${code} ${name}`);
    seen.add(`${code} ${name}`);
    entries.push({ code, name, group: group.normalize('NFC') });
  }
  return { list: 'sadaic-genres', version, entries };
}

/**
 * Las listas de valores generadas (ruta → texto), desde las fuentes de `root`.
 * @param {string} root
 * @param {string} version
 * @returns {Map<string, string>}
 */
export function generateValues(root, version) {
  const countries = JSON.parse(readFileSync(join(root, 'schema/src/countries.source.json'), 'utf8'));
  const genres = readFileSync(join(root, 'schema/src/sadaic-generos-2006.txt'), 'utf8');
  return new Map([
    ['values/countries.json', json(generateCountries(countries, version))],
    ['values/sadaic-genres.json', json(generateGenres(genres, version))],
    ['values/tis.json', json(generateTis(countries, version))],
  ]);
}
