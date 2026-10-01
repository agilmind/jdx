/**
 * Datos empaquetados. La librería no lee disco ni red: los
 * schemas, el índice, las listas de valores, el catálogo y los perfiles viajan
 * como texto en src/generated/data.ts (`files`, ruta del repositorio → texto).
 *
 * - BUNDLE_MANIFEST dice qué archivos del repositorio van ahí: patrones de
 *   ruta donde `*` es cualquier texto dentro de un segmento. Los schemas fuente
 *   (schema/src) no van: son del generador.
 * - schemaBundle arma los schemas desde ese texto. Se llama una vez
 *   (defaultValidators) y recién ahí se parsea.
 */
import type { AuxSchemaName, BundleFiles, SchemaBundle, SchemaIndex } from '../types.js';

export const BUNDLE_MANIFEST: readonly string[] = Object.freeze([
  'schema/*.schema.json',
  'schema/*.*/jdx.schema.json',
  'schema/*.*/jdx.strict.schema.json',
  'schema/*.*/index.json',
  'schema/values/*.schema.json',
  'schema/conformance/*.schema.json',
  'values/*.json',
  'catalog/*/*.json',
  'profiles/*/*.json',
]);

const MANIFEST_PATTERNS: readonly RegExp[] = BUNDLE_MANIFEST.map(
  (pattern) => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')).join('[^/]*')}$`),
);

/** Si una ruta del repositorio (con `/`) va al bundle. */
export function inBundle(path: string): boolean {
  return MANIFEST_PATTERNS.some((pattern) => pattern.test(path));
}

/** El archivo de cada schema auxiliar. */
export const AUX_SCHEMA_FILES: Readonly<Record<AuxSchemaName, string>> = Object.freeze({
  profile: 'schema/profile.schema.json',
  catalog: 'schema/catalog.schema.json',
  trustList: 'schema/trust-list.schema.json',
  state: 'schema/jdx-state.schema.json',
  report: 'schema/jdx-report.schema.json',
  accounts: 'schema/accounts.schema.json',
});

const MINOR_FILE = /^schema\/(\d+\.\d+)\/(?:jdx\.schema\.json|jdx\.strict\.schema\.json|index\.json)$/;

/**
 * Los schemas de un bundle: las menores que trae (cada una con su abierto, su
 * estricto y su índice, en orden de versión) y los schemas auxiliares que
 * existan. Una menor a medias es un error de empaquetado y lanza.
 */
export function schemaBundle(files: BundleFiles): SchemaBundle {
  const parse = <T>(path: string): T => JSON.parse(files[path] as string) as T;
  const has = (path: string): boolean => Object.hasOwn(files, path);
  const minors = [...new Set(Object.keys(files).flatMap((path) => MINOR_FILE.exec(path)?.[1] ?? []))].sort((a, b) => {
    const [aMajor = 0, aMinor = 0] = a.split('.').map(Number);
    const [bMajor = 0, bMinor = 0] = b.split('.').map(Number);
    return aMajor - bMajor || aMinor - bMinor;
  });
  const open: Record<string, object> = {};
  const strict: Record<string, object> = {};
  const index: Record<string, SchemaIndex> = {};
  for (const minor of minors) {
    const paths = [`schema/${minor}/jdx.schema.json`, `schema/${minor}/jdx.strict.schema.json`, `schema/${minor}/index.json`] as const;
    const missing = paths.filter((path) => !has(path));
    if (missing.length > 0) throw new Error(`bundle incompleto para la menor ${minor}: falta ${missing.join(', ')}`);
    open[minor] = parse<object>(paths[0]);
    strict[minor] = parse<object>(paths[1]);
    index[minor] = parse<SchemaIndex>(paths[2]);
  }
  const aux: Partial<Record<AuxSchemaName, object>> = {};
  for (const [name, path] of Object.entries(AUX_SCHEMA_FILES) as [AuxSchemaName, string][]) {
    if (has(path)) aux[name] = parse<object>(path);
  }
  return Object.freeze({
    minors: Object.freeze(minors),
    open: Object.freeze(open),
    strict: Object.freeze(strict),
    index: Object.freeze(index),
    aux: Object.freeze(aux),
  });
}
