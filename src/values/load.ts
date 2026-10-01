/**
 * Listas de valores empaquetadas: se leen del bundle (src/generated/data.ts),
 * nunca del disco.
 *
 * - Cada lista abierta de types.json está en `values/<lista>.json`, con el formato
 *   de schema/values/open-list.schema.json. `JDX-VER-004` compara contra ellas.
 * - VALUE_FILES nombra los otros archivos de values/: países, TIS, sociedades,
 *   géneros y las listas de los esquemas `SADAIC_ART8` y `SADAIC_CONTRACT`.
 * - loadValues las junta todas en `ValueLists`, con la versión fechada que
 *   comparten.
 *
 * Que cada archivo cumpla su schema lo fijan los tests; acá un archivo cuyo
 * `list` no es su nombre, uno que falta o versiones mezcladas son errores de
 * empaquetado y lanzan. Lo que se devuelve está congelado: las mismas listas
 * sirven a todas las validaciones.
 */
import type {
  BundleFiles,
  CountryEntry,
  GenreEntry,
  OpenValueList,
  SocietyEntry,
  TisEntry,
  ValueLists,
} from '../types.js';

/** Los archivos de values/ que no son listas abiertas. */
export const VALUE_FILES = Object.freeze({
  tis: 'values/tis.json',
  societies: 'values/societies.json',
  countries: 'values/countries.json',
  sadaicGenres: 'values/sadaic-genres.json',
  sadaicArt8: 'values/sadaic-art8.json',
  sadaicContract: 'values/sadaic-contract.json',
} as const);

const OTHER_FILES: ReadonlySet<string> = new Set(Object.values(VALUE_FILES));
const OPEN_LIST_FILE = /^values\/([a-z][A-Za-z0-9]*)\.json$/;

/** El valor con cada objeto y cada arreglo congelados. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Las listas abiertas del bundle por nombre (`values/<lista>.json`). */
export function loadOpenLists(files: BundleFiles): ReadonlyMap<string, OpenValueList> {
  const lists = new Map<string, OpenValueList>();
  for (const path of Object.keys(files).sort()) {
    const name = OPEN_LIST_FILE.exec(path)?.[1];
    if (name === undefined || OTHER_FILES.has(path)) continue;
    const list = JSON.parse(files[path] as string) as OpenValueList;
    if (list.list !== name) throw new Error(`${path}: list es ${JSON.stringify(list.list)}, no ${name}`);
    lists.set(name, deepFreeze(list));
  }
  return lists;
}

interface EntriesFile<T> { list: string; version: string; entries: T[] }

/** Un archivo de VALUE_FILES, parseado y congelado; su `list` es su nombre de archivo. */
function readValueFile<T extends { list: string; version: string }>(files: BundleFiles, path: string): T {
  if (!Object.hasOwn(files, path)) throw new Error(`el bundle no trae ${path}`);
  const value = JSON.parse(files[path] as string) as T;
  const name = path.slice('values/'.length, -'.json'.length);
  if (value.list !== name) throw new Error(`${path}: list es ${JSON.stringify(value.list)}, no ${name}`);
  return deepFreeze(value);
}

/** Todas las listas de valores del bundle, de una sola versión. */
export function loadValues(files: BundleFiles): ValueLists {
  const open = loadOpenLists(files);
  const tis = readValueFile<EntriesFile<TisEntry>>(files, VALUE_FILES.tis);
  const societies = readValueFile<EntriesFile<SocietyEntry>>(files, VALUE_FILES.societies);
  const countries = readValueFile<EntriesFile<CountryEntry>>(files, VALUE_FILES.countries);
  const genres = readValueFile<EntriesFile<GenreEntry>>(files, VALUE_FILES.sadaicGenres);
  const art8 = readValueFile<OpenValueList>(files, VALUE_FILES.sadaicArt8);
  const contract = readValueFile<OpenValueList>(files, VALUE_FILES.sadaicContract);
  const versions = [...new Set([...open.values(), tis, societies, countries, genres, art8, contract].map((list) => list.version))].sort();
  if (versions.length !== 1) throw new Error(`las listas de valores tienen versiones distintas: ${versions.join(', ')}`);
  return Object.freeze({
    version: versions[0] as string,
    open,
    tis: tis.entries,
    societies: societies.entries,
    countries: countries.entries,
    sadaicGenres: genres.entries,
    sadaicArt8: art8,
    sadaicContract: contract,
  });
}
