/**
 * Fusiona un fragmento de reglas en el catálogo: `node scripts/merge-catalog.mjs
 * <fragmento.json> [--root <dir>]`.
 *
 * - El fragmento tiene la forma del catálogo, `{ catalog, rules }`, y va a
 *   `catalog/<catalog>/rules.json` (bajo `--root`, o el repositorio).
 * - Las reglas quedan en orden de id. Un id que ya está en el catálogo, o que
 *   el fragmento repite, no se fusiona: el script sale con 1 sin escribir nada.
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

/** @param {readonly string[]} argv @returns {number} */
export function main(argv) {
  const at = argv.indexOf('--root');
  const root = at >= 0 && argv[at + 1] !== undefined ? resolve(argv[at + 1]) : fileURLToPath(new URL('..', import.meta.url));
  const source = argv.find((arg, i) => !arg.startsWith('--') && (at < 0 || i !== at + 1));
  if (source === undefined) {
    console.error('uso: node scripts/merge-catalog.mjs <fragmento.json> [--root <dir>]');
    return 2;
  }
  /** @type {CatalogFile} */
  const fragment = JSON.parse(readFileSync(resolve(source), 'utf8'));
  const target = join(root, 'catalog', fragment.catalog, 'rules.json');
  /** @type {CatalogFile | null} */
  const base = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : null;
  let merged;
  try {
    merged = mergeCatalog(base, fragment);
  } catch (error) {
    console.error(`merge-catalog: ${/** @type {Error} */ (error).message}`);
    return 1;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, catalogText(merged));
  console.log(`merge-catalog: ${fragment.rules.length} reglas nuevas, ${merged.rules.length} en catalog/${fragment.catalog}/rules.json`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
