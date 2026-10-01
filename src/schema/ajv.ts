/**
 * Ajv del repositorio y el mapeo de sus errores a SchemaError.
 *
 * - Una sola configuración para todo: JSON Schema 2020-12 (Ajv2020), modo
 *   estricto y todos los errores. La usan los schemas de JDX, los auxiliares
 *   (perfil, catálogo, lista de confianza, estado, reporte, cuentas) y los
 *   params y context del catálogo.
 * - Las anotaciones de JDX (x-jdx-ref, x-jdx-ref-type, x-jdx-personal-data) y
 *   la de licencia que lleva en la raíz todo schema publicado (x-jdx-license)
 *   son palabras registradas, cada una con el meta-schema de su valor. En
 *   modo estricto cualquier otra palabra desconocida no compila.
 * - verbose: cada error trae el subschema que lo dio (parentSchema). Con eso
 *   las ramas de oneOf/anyOf se reconocen por identidad, y toSchemaErrorsIn da
 *   keywordLocation absoluto: el schemaPath de Ajv es relativo a la función de
 *   cada $ref que no hace inline, la de cualquier tipo que use otros tipos.
 * - allowUnionTypes: el valor de una extensión (cualquier JSON salvo null) y
 *   los campos del reporte que admiten null llevan una lista de tipos.
 * - addUsedSchema: false: un schema compilado no queda registrado por su $id.
 *   Los schemas de JDX solo usan referencias internas (#/$defs/…), y así otro
 *   objeto con el mismo $id (una copia de un schema del bundle, dos params del
 *   catálogo) compila aparte en lugar de lanzar.
 */
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import type { JsonPointer, JsonValue, RootList, SchemaError } from '../types.js';

const ROOT_LISTS: readonly RootList[] = ['parties', 'works', 'recordings', 'agreements', 'media'];

export function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({ strict: true, allErrors: true, verbose: true, allowUnionTypes: true, addUsedSchema: false });
  ajv.addKeyword({
    keyword: 'x-jdx-ref',
    schemaType: 'string',
    metaSchema: { type: 'string', enum: [...ROOT_LISTS] },
  });
  ajv.addKeyword({
    keyword: 'x-jdx-ref-type',
    schemaType: 'array',
    metaSchema: { type: 'array', items: { type: 'string' }, minItems: 1 },
  });
  ajv.addKeyword({
    keyword: 'x-jdx-personal-data',
    schemaType: ['boolean', 'object'],
    // true: el dato es personal. Con una condición, el objeto que contiene la
    // propiedad es personal cuando su propiedad `path` vale uno de `in`.
    metaSchema: {
      anyOf: [
        { type: 'boolean', const: true },
        {
          type: 'object',
          properties: { path: { type: 'string' }, in: { type: 'array', items: { type: 'string' }, minItems: 1 } },
          required: ['path', 'in'],
          additionalProperties: false,
        },
      ],
    },
  });
  ajv.addKeyword({
    keyword: 'x-jdx-license',
    schemaType: 'object',
    // El identificador SPDX de la licencia y la URL de su texto (src/schema/notice.ts).
    metaSchema: {
      type: 'object',
      properties: {
        spdx: { type: 'string', pattern: '^LicenseRef-[A-Za-z0-9.-]+$' },
        url: { type: 'string', pattern: '^https://\\S+$' },
      },
      required: ['spdx', 'url'],
      additionalProperties: false,
    },
  });
  return ajv;
}

/**
 * Errores de Ajv → SchemaError, uno por error que queda:
 * - unevaluatedProperties y additionalProperties: instanceLocation apunta a la
 *   propiedad (el puntero del objeto más la propiedad, escapada);
 * - required: instanceLocation es el objeto y params.missingProperty la propiedad;
 * - los errores `if` ("must match then schema") se descartan: queda el del then
 *   o el del else;
 * - de oneOf y anyOf queda el error del combinador; los de sus ramas se descartan.
 * keywordLocation es el schemaPath de Ajv sin `#`, como JSON Pointer.
 */
export function toSchemaErrors(errors: readonly ErrorObject[] | null | undefined): SchemaError[] {
  return convert(errors, undefined);
}

/**
 * Como toSchemaErrors, con keywordLocation absoluto dentro de `root`, el schema
 * compilado: la ubicación del subschema que dio el error, más la palabra.
 */
export function toSchemaErrorsIn(root: object, errors: readonly ErrorObject[] | null | undefined): SchemaError[] {
  return convert(errors, locationsOf(root));
}

function convert(errors: readonly ErrorObject[] | null | undefined, locations: Locations | undefined): SchemaError[] {
  if (!errors || errors.length === 0) return [];
  const combinators = combinatorsByInstance(errors);
  const out: SchemaError[] = [];
  for (const e of errors) {
    if (e.keyword === 'if') continue;
    if (combinators.size > 0 && isBranchError(e, combinators)) continue;
    let instanceLocation = e.instancePath;
    if (e.keyword === 'unevaluatedProperties') instanceLocation += `/${escape(String(e.params.unevaluatedProperty))}`;
    if (e.keyword === 'additionalProperties') instanceLocation += `/${escape(String(e.params.additionalProperty))}`;
    out.push({
      instanceLocation,
      keywordLocation: keywordLocation(e, locations),
      keyword: e.keyword,
      params: { ...(e.params as Record<string, JsonValue>) },
    });
  }
  return out;
}

type Locations = ReadonlyMap<object, JsonPointer>;
const locationCache = new WeakMap<object, Locations>();

/** Puntero de cada objeto y arreglo del schema, por identidad (el schema es JSON: ninguno se repite). */
function locationsOf(root: object): Locations {
  let map = locationCache.get(root);
  if (map === undefined) {
    const found = new Map<object, JsonPointer>();
    const stack: [unknown, JsonPointer][] = [[root, '']];
    while (stack.length > 0) {
      const [node, pointer] = stack.pop() as [unknown, JsonPointer];
      if (typeof node !== 'object' || node === null || found.has(node)) continue;
      found.set(node, pointer);
      for (const [key, child] of Object.entries(node)) stack.push([child, `${pointer}/${escape(key)}`]);
    }
    map = found;
    locationCache.set(root, map);
  }
  return map;
}

function keywordLocation(e: ErrorObject, locations: Locations | undefined): JsonPointer {
  const parent: unknown = e.parentSchema;
  const at = locations !== undefined && typeof parent === 'object' && parent !== null ? locations.get(parent) : undefined;
  if (at !== undefined) return `${at}/${escape(e.keyword)}`;
  // El schemaPath de Ajv es un fragmento de URI: sin `#` y sin el %-encoding es un JSON Pointer.
  // Un schema `false` no es una palabra: el puntero termina en el `false`.
  const path = decodeURIComponent(e.schemaPath.replace(/^#/, ''));
  return e.keyword === 'false schema' ? path.replace(/\/false schema$/, '') : path;
}

interface Combinator { schemaPath: string; branches: ReadonlySet<unknown> }

/** Errores oneOf/anyOf por instancePath, con los subschemas de sus ramas. */
function combinatorsByInstance(errors: readonly ErrorObject[]): Map<string, Combinator[]> {
  const byInstance = new Map<string, Combinator[]>();
  for (const e of errors) {
    if (e.keyword !== 'oneOf' && e.keyword !== 'anyOf') continue;
    const list = byInstance.get(e.instancePath) ?? [];
    list.push({ schemaPath: e.schemaPath, branches: subschemasOf(e.schema) });
    byInstance.set(e.instancePath, list);
  }
  return byInstance;
}

const subschemaCache = new WeakMap<object, ReadonlySet<unknown>>();

function subschemasOf(branches: unknown): ReadonlySet<unknown> {
  if (typeof branches !== 'object' || branches === null) return new Set();
  let set = subschemaCache.get(branches);
  if (set === undefined) {
    const found = new Set<unknown>();
    const stack: unknown[] = [branches];
    while (stack.length > 0) {
      const node = stack.pop();
      if (typeof node !== 'object' || node === null || found.has(node)) continue;
      found.add(node);
      stack.push(...Object.values(node));
    }
    set = found;
    subschemaCache.set(branches, set);
  }
  return set;
}

/**
 * Un error es de una rama si su instancia es la del combinador o está debajo,
 * y su subschema está dentro de las ramas (por identidad) o su schemaPath sigue
 * al del combinador. Un combinador dentro de la rama de otro también cuenta
 * como error de esa rama; el propio combinador no está en sus ramas.
 */
function isBranchError(e: ErrorObject, combinators: ReadonlyMap<string, Combinator[]>): boolean {
  return ancestors(e.instancePath).some((at) =>
    (combinators.get(at) ?? []).some((c) => c.branches.has(e.parentSchema) || e.schemaPath.startsWith(`${c.schemaPath}/`)),
  );
}

/** El puntero y cada uno de sus prefijos, hasta '' incluido. */
function ancestors(pointer: string): string[] {
  const out = [pointer];
  for (let i = pointer.lastIndexOf('/'); i >= 0; i = i === 0 ? -1 : pointer.lastIndexOf('/', i - 1)) {
    out.push(pointer.slice(0, i));
  }
  return out;
}

/** Un segmento de JSON Pointer (RFC 6901). */
function escape(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}
