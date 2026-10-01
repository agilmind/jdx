/**
 * `npm run gen` y `npm run gen:check`: todo lo que el repositorio genera.
 * - Desde schema/src/types.json y su overlay: los dos meta-schemas (texto de
 *   las constantes de src/schema/model.ts), por cada menor los schemas abierto
 *   y estricto del documento y su índice de punteros, los tipos TS
 *   (src/generated/jdx-types.ts) y la referencia de campos en español
 *   (docs/campos.md) y en inglés (docs/en/campos.md).
 * - Las listas de valores que salen de las fuentes de schema/src
 *   (scripts/gen-values.mjs): values/countries.json, values/tis.json y
 *   values/sadaic-genres.json.
 * - src/generated/data.ts: cada archivo de BUNDLE_MANIFEST como texto, con los
 *   generados acá tal como quedan; src/generated/roots.ts, desde
 *   trust/roots.json, controlado con parseRootsFile (vacío si no existe);
 *   src/generated/version.ts, desde package.json.
 *
 * - `gen` escribe solo los archivos que cambian y los lista.
 * - `gen:check` regenera en memoria y sale con 1 si algún archivo quedó viejo
 *   o falta. `npm test` lo corre antes de vitest.
 * - `--root <dir>` trabaja sobre otro árbol con la forma del repositorio (los
 *   tests lo usan sobre una copia).
 *
 * Las listas abiertas (`values/<lista>.json`) no se generan: crecen a mano,
 * fechadas, sin tocar el schema.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inBundle } from '../src/schema/bundle.js';
import { FIELD_REFERENCE_PATHS, generateFieldReference } from '../src/schema/fieldReference.js';
import { generateIndex, generateSchema, generateTypesTs } from '../src/schema/generate.js';
import { loadModel, TYPES_OVERLAY_SCHEMA, TYPES_SOURCE_SCHEMA } from '../src/schema/model.js';
import { parseRootsFile } from '../src/trust/keys.js';
import type { JsonValue, PinnedRoots } from '../src/types.js';
import { generateValues } from './gen-values.mjs';

/** La versión de las listas de valores: las fechadas que trae el validador. */
export const VALUES_VERSION = '2026-10';

/** JSON con dos espacios y salto final: el formato de todo archivo generado. */
function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const byPath = ([a]: [string, string], [b]: [string, string]): number => (a < b ? -1 : a > b ? 1 : 0);

/** src/generated/data.ts: cada archivo del bundle como texto, en orden de ruta. */
export function generateDataTs(files: ReadonlyMap<string, string>): string {
  return [
    '/**',
    ' * Archivos empaquetados (BUNDLE_MANIFEST de src/schema/bundle.ts), como texto:',
    ' * generado por `npm run gen`. No editar a mano.',
    ' */',
    'export const files: Readonly<Record<string, string>> = Object.freeze({',
    ...[...files].sort(byPath).map(([path, text]) => `  ${JSON.stringify(path)}: ${JSON.stringify(text)},`),
    '});',
    '',
  ].join('\n');
}

/** src/generated/roots.ts: las raíces fijadas, aparte de data.ts para poder filtrarlas por entorno. */
export function generateRootsTs(roots: PinnedRoots): string {
  return [
    '/**',
    ' * Raíces fijadas por entorno (trust/roots.json): generado por `npm run gen`.',
    ' * No editar a mano.',
    ' */',
    "import type { PinnedRoots } from '../types.js';",
    '',
    `export const roots: PinnedRoots = ${JSON.stringify(roots, null, 2)};`,
    '',
  ].join('\n');
}

/** Los archivos bajo las carpetas de datos que van al bundle (rutas con `/`). */
function bundledOnDisk(root: string): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string): void => {
    if (!existsSync(join(root, dir))) return;
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile() && inBundle(rel)) found.set(rel, readFileSync(join(root, rel), 'utf8'));
    }
  };
  for (const dir of ['schema', 'values', 'catalog', 'profiles']) walk(dir);
  return found;
}

/** Cada archivo generado (ruta del repositorio → texto), en orden de ruta. */
export function generateAll(root: string): Map<string, string> {
  const read = (rel: string): JsonValue => JSON.parse(readFileSync(join(root, rel), 'utf8')) as JsonValue;
  const model = loadModel(read('schema/src/types.json'), read('schema/src/types.overlay.json'));
  const minor = model.source.jdx;
  const generated: [string, string][] = [
    ['schema/src/types.schema.json', json(TYPES_SOURCE_SCHEMA)],
    ['schema/src/types.overlay.schema.json', json(TYPES_OVERLAY_SCHEMA)],
    [`schema/${minor}/jdx.schema.json`, json(generateSchema(model, minor, { strict: false }))],
    [`schema/${minor}/jdx.strict.schema.json`, json(generateSchema(model, minor, { strict: true }))],
    [`schema/${minor}/index.json`, json(generateIndex(model, minor))],
    ['src/generated/jdx-types.ts', generateTypesTs(model)],
    [FIELD_REFERENCE_PATHS.es, generateFieldReference(model, 'es')],
    [FIELD_REFERENCE_PATHS.en, generateFieldReference(model, 'en')],
    ...generateValues(root, VALUES_VERSION),
  ];
  const bundle = bundledOnDisk(root);
  for (const [path, text] of generated) if (inBundle(path)) bundle.set(path, text);
  // Las raíces, controladas: un kid que no es la huella de su clave no llega al validador.
  const roots: PinnedRoots = existsSync(join(root, 'trust/roots.json'))
    ? parseRootsFile(read('trust/roots.json'))
    : { production: [], sandbox: [] };
  const version = (read('package.json') as { version: string }).version;
  const outputs: [string, string][] = [
    ...generated,
    ['src/generated/data.ts', generateDataTs(bundle)],
    ['src/generated/roots.ts', generateRootsTs(roots)],
    [
      'src/generated/version.ts',
      `/** Versión del paquete (package.json): generado por \`npm run gen\`. No editar a mano. */\nexport const VERSION = ${JSON.stringify(version)};\n`,
    ],
  ];
  return new Map(outputs.sort(byPath));
}

/** Los archivos generados que en `root` faltan o tienen otro texto. */
export function checkGenerated(root: string, outputs: ReadonlyMap<string, string> = generateAll(root)): string[] {
  return [...outputs]
    .filter(([rel, text]) => !existsSync(join(root, rel)) || readFileSync(join(root, rel), 'utf8') !== text)
    .map(([rel]) => rel);
}

function main(argv: readonly string[]): number {
  const at = argv.indexOf('--root');
  const root = at >= 0 && argv[at + 1] !== undefined ? resolve(argv[at + 1] as string) : fileURLToPath(new URL('..', import.meta.url));
  const outputs = generateAll(root);
  const stale = checkGenerated(root, outputs);
  if (argv.includes('--check')) {
    if (stale.length > 0) {
      console.error(`gen:check: archivos generados viejos o faltantes (correr npm run gen):\n${stale.map((rel) => `  ${rel}`).join('\n')}`);
      return 1;
    }
    console.log(`gen:check: ${outputs.size} archivos al día`);
    return 0;
  }
  for (const rel of stale) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), outputs.get(rel) as string);
  }
  console.log(`gen: ${outputs.size} archivos, ${stale.length} escritos${stale.map((rel) => `\n  ${rel}`).join('')}`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
