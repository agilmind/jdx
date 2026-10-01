/**
 * Fusiona un fragmento de reglas en el catálogo: `node scripts/merge-catalog.mjs
 * <fragmento.json> [--root <dir>]`.
 *
 * - El fragmento tiene la forma del catálogo, `{ catalog, rules }`, y va a
 *   `catalog/<catalog>/rules.json` (bajo `--root`, o el repositorio).
 * - Las reglas quedan en orden de id. Un id que ya está en el catálogo, o que
 *   el fragmento repite, no se fusiona: el script sale con 1 sin escribir nada.
 *   También sale con 1 si el fragmento o el catálogo no son JSON o no tienen
 *   esa forma, y con 2 si falta el argumento o el fragmento no se puede leer.
 * - El archivo sale como todo JSON del repositorio: dos espacios y salto final.
 *
 * El catálogo lo valida loadCatalog (src/catalog/load.ts) en los tests; este
 * script solo junta y ordena.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** @typedef {{ id: string }} RuleEntry */
/** @typedef {{ catalog: string, rules: RuleEntry[] }} CatalogFile */

/** @param {RuleEntry} a @param {RuleEntry} b */
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * El catálogo con las reglas del fragmento, en orden de id. No cambia sus argumentos.
 * @template {RuleEntry} R
 * @param {{ catalog: string, rules: R[] } | null} base
 * @param {{ catalog: string, rules: R[] }} fragment
 * @returns {{ catalog: string, rules: R[] }}
 */
export function mergeCatalog(base, fragment) {
  const current = base ?? { catalog: fragment.catalog, rules: [] };
  if (current.catalog !== fragment.catalog) {
    throw new Error(`el fragmento es del catálogo ${fragment.catalog} y el archivo, del ${current.catalog}`);
  }
  const seen = new Set(current.rules.map((rule) => rule.id));
  for (const rule of fragment.rules) {
    if (seen.has(rule.id)) throw new Error(`regla repetida: ${rule.id}`);
    seen.add(rule.id);
  }
  return { catalog: current.catalog, rules: [...current.rules, ...fragment.rules].sort(byId) };
}

/** El texto del catálogo: JSON con dos espacios y salto final. @param {unknown} catalog */
export function catalogText(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

/**
 * Un archivo con la forma del catálogo: `{ catalog: "M.m", rules: [{ id }…] }`.
 * @param {unknown} value
 * @returns {value is CatalogFile}
 */
function isCatalogFile(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { catalog, rules } = /** @type {{ catalog?: unknown, rules?: unknown }} */ (value);
  return (
    typeof catalog === 'string' &&
    /^\d+\.\d+$/u.test(catalog) &&
    Array.isArray(rules) &&
    rules.every((rule) => typeof rule === 'object' && rule !== null && typeof rule.id === 'string')
  );
}

/**
 * Lee un fragmento o un catálogo: el archivo, o por qué no se puede usar (`unreadable`: no se
 * puede leer; `invalid`: no es JSON o no tiene la forma del catálogo).
 * @param {string} path
 * @returns {{ file: CatalogFile } | { unreadable: string } | { invalid: string }}
 */
function readCatalogFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    return { unreadable: `no se puede leer ${path} (${/** @type {NodeJS.ErrnoException} */ (error).code ?? 'error'})` };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { invalid: `${path} no es JSON` };
  }
  return isCatalogFile(value) ? { file: value } : { invalid: `${path} no tiene la forma { catalog: "M.m", rules: [{ id }…] }` };
}

/** @param {readonly string[]} argv @returns {number} */
export function main(argv) {
  const at = argv.indexOf('--root');
  const root = at >= 0 && argv[at + 1] !== undefined ? resolve(argv[at + 1]) : fileURLToPath(new URL('..', import.meta.url));
  const source = argv.find((arg, i) => !arg.startsWith('--') && (at < 0 || i !== at + 1));
  if (source === undefined) {
    console.error('uso: node scripts/merge-catalog.mjs <fragmento.json> [--root <dir>]');
    return 2;
  }
  const read = readCatalogFile(resolve(source));
  if ('unreadable' in read) {
    console.error(`merge-catalog: ${read.unreadable}`);
    return 2;
  }
  if ('invalid' in read) {
    console.error(`merge-catalog: ${read.invalid}`);
    return 1;
  }
  const fragment = read.file;
  const target = join(root, 'catalog', fragment.catalog, 'rules.json');
  /** @type {CatalogFile | null} */
  let base = null;
  if (existsSync(target)) {
    const current = readCatalogFile(target);
    if (!('file' in current)) {
      console.error(`merge-catalog: ${'invalid' in current ? current.invalid : current.unreadable}`);
      return 1;
    }
    base = current.file;
  }
  let merged;
  try {
    merged = mergeCatalog(base, fragment);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, catalogText(merged));
  } catch (error) {
    console.error(`merge-catalog: ${/** @type {Error} */ (error).message}`);
    return 1;
  }
  console.log(`merge-catalog: ${fragment.rules.length} reglas nuevas, ${merged.rules.length} en catalog/${fragment.catalog}/rules.json`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
