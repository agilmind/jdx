/**
 * Modelo de tipos → JSON Schema 2020-12 del documento JDX, índice de punteros
 * y tipos TS.
 *
 * - Un `$defs` por tipo de types.json, más `Extensions` y `ExtensionValue`; la
 *   raíz es `{ "$ref": "#/$defs/Document" }`.
 * - Formatos con `pattern`, nunca `format`: el soporte de `format` varía entre
 *   validadores.
 * - `type` en todo subschema escrito en línea, para `strictTypes` de Ajv. No lo
 *   llevan las referencias (`$ref`) ni el schema que prohíbe una propiedad,
 *   `{ "not": {} }` (un schema `false` daría un error sin subschema).
 * - Textos sin `minLength` (no hay límites de largo) y sin `null` en ningún
 *   lugar: lo ausente se omite.
 * - En la raíz, el aviso de autoría (src/schema/notice.ts): `$comment` y
 *   `x-jdx-license`.
 * - Anotaciones: `x-jdx-ref` (la lista raíz) y `x-jdx-ref-type` (los `type` de
 *   contrato o `kind` de media admitidos) en cada referencia;
 *   `x-jdx-personal-data` en cada dato personal: `true`, o la condición del
 *   overlay con la que el objeto que lo contiene es personal.
 * - `extensions` solo en los tipos que la admiten; en los demás está prohibida
 *   también en el abierto. El abierto admite otras propiedades desconocidas y
 *   las valida como el valor de una extensión (`unevaluatedProperties` con
 *   `ExtensionValue`): cualquier JSON salvo null, en cualquier nivel.
 * - Las restricciones condicionales del overlay van en `allOf`, una entrada por
 *   restricción con su id en `$comment`.
 * - El estricto sale del mismo modelo y lleva las mismas anotaciones; cambian
 *   solo `$id`, `jdx` y `$schema` (`const` de su menor) y
 *   `unevaluatedProperties`, que es `false` en cada tipo, salvo las extensiones.
 * - `generateIndex` da los punteros concretos de las mismas anotaciones y de
 *   los porcentajes, fechas e instantes (schema/<menor>/index.json).
 * - `generateTypesTs` da los tipos TS del documento (src/generated/jdx-types.ts),
 *   con los nombres de types.json salvo los de TS_RENAMES.
 */
import { PATTERNS, SCALAR_PATTERN } from '../conventions/patterns.js';
import type { Condition, Constraint, PatternName, PropSpec, ScalarName, SchemaIndex, TypeRef, TypesModel } from '../types.js';
import { SCHEMA_COMMENT, SCHEMA_LICENSE } from './notice.js';

type Schema = { [key: string]: unknown };

const BASE = 'https://jdx.jupiter.ar/schema';

/** El texto de un patrón (`RegExp.source` escribe `/` como `\/`). */
function pattern(name: PatternName): string {
  return PATTERNS[name].source.replaceAll('\\/', '/');
}

/** La URL (`$id`) del schema abierto o estricto de una menor. */
export function schemaUrl(minor: string, strict: boolean): string {
  return `${BASE}/${minor}/jdx${strict ? '.strict' : ''}.schema.json`;
}

function scalarSchema(scalar: ScalarName): Schema {
  switch (scalar) {
    case 'text':
      return { type: 'string' };
    case 'boolean':
      return { type: 'boolean' };
    case 'integer':
      return { type: 'integer' };
    case 'integer>=0':
      return { type: 'integer', minimum: 0 };
    case 'integer>=1':
      return { type: 'integer', minimum: 1 };
    case 'year':
      return { type: 'integer', minimum: 1000, maximum: 9999 };
    case 'percent':
      return { type: 'number', minimum: 0, maximum: 100 };
    default: {
      const name = SCALAR_PATTERN[scalar];
      if (name === undefined) throw new Error(`escalar sin patrón: ${scalar}`);
      return { type: 'string', pattern: pattern(name) };
    }
  }
}

function valueSchema(model: TypesModel, ref: TypeRef): Schema {
  if ('scalar' in ref) return scalarSchema(ref.scalar);
  if ('type' in ref) return { $ref: `#/$defs/${ref.type}` };
  if ('ref' in ref) {
    const schema: Schema = { type: 'string', pattern: pattern('localId'), 'x-jdx-ref': ref.ref };
    if (ref.refTypes !== undefined) schema['x-jdx-ref-type'] = ref.refTypes;
    return schema;
  }
  if ('closed' in ref) return { type: 'string', enum: ref.closed };
  if ('open' in ref) {
    const style = model.source.openLists[ref.open]?.style;
    if (style === undefined) throw new Error(`lista abierta desconocida: ${ref.open}`);
    return { type: 'string', pattern: pattern(style === 'scheme' ? 'schemeValue' : 'enumValue') };
  }
  const schema: Schema = { type: 'array', items: valueSchema(model, ref.array) };
  if (ref.minItems !== undefined) schema.minItems = ref.minItems;
  return schema;
}

/**
 * `$schema` y `jdx` de la raíz: en el abierto, cualquier menor de la mayor; en
 * el estricto, `const` de su menor (`$schema` con la URL del abierto).
 */
function versionSchema(prop: '$schema' | 'jdx', minor: string, strict: boolean): Schema {
  const major = minor.split('.')[0] ?? '';
  if (strict) return { type: 'string', const: prop === 'jdx' ? minor : schemaUrl(minor, false) };
  return prop === 'jdx'
    ? { type: 'string', pattern: `^${major}\\.\\d+$` }
    : { type: 'string', pattern: `^https://jdx\\.jupiter\\.ar/schema/${major}\\.\\d+/jdx\\.schema\\.json$` };
}

function propSchema(model: TypesModel, typeName: string, prop: string, spec: PropSpec, minor: string, strict: boolean): Schema {
  const schema =
    typeName === 'Document' && (prop === '$schema' || prop === 'jdx')
      ? versionSchema(prop, minor, strict)
      : valueSchema(model, spec.type);
  if (spec.personalData === true) {
    const when = model.overlay.personalDataWhen[`${typeName}.${prop}`];
    schema['x-jdx-personal-data'] = when === undefined ? true : { path: when.path, in: when.in };
  }
  return schema;
}

/** El tipo de la propiedad a la que lleva un camino con `.` desde un tipo (el overlay ya está validado). */
function pathType(model: TypesModel, typeName: string, path: string): TypeRef {
  let ref: TypeRef = { type: typeName };
  for (const segment of path.split('.')) {
    if (!('type' in ref)) throw new Error(`camino inválido ${typeName}.${path}`);
    const spec: PropSpec | undefined = model.source.types[ref.type]?.props[segment];
    if (spec === undefined) throw new Error(`camino inválido ${typeName}.${path}`);
    ref = spec.type;
  }
  return ref;
}

/**
 * El `if` de una condición: la propiedad del camino presente y con uno de los
 * valores. Los valores del overlay son textos; los de una propiedad booleana
 * se escriben como booleanos.
 */
function conditionSchema(model: TypesModel, typeName: string, when: Condition): Schema {
  const leaf = pathType(model, typeName, when.path);
  let schema: Schema =
    'scalar' in leaf && leaf.scalar === 'boolean'
      ? { type: 'boolean', enum: when.in.map((v) => v === 'true') }
      : { type: 'string', enum: when.in };
  for (const segment of when.path.split('.').reverse()) {
    schema = { type: 'object', properties: { [segment]: schema }, required: [segment] };
  }
  return schema;
}

/** Las propiedades presentes. `strictRequired` pide nombrarlas en `properties`; su valor lo valida el tipo. */
function requiredSchema(props: readonly string[]): Schema {
  return { type: 'object', properties: Object.fromEntries(props.map((p) => [p, true])), required: [...props] };
}

/** Las propiedades ausentes: cada una con `{ "not": {} }`, así el error apunta a la propiedad. */
function forbiddenSchema(props: readonly string[]): Schema {
  return { type: 'object', properties: Object.fromEntries(props.map((p) => [p, { not: {} }])) };
}

/** Una restricción del overlay como entrada de `allOf`. */
function constraintSchema(model: TypesModel, c: Constraint): Schema {
  const base: Schema = { $comment: c.id, type: 'object' };
  switch (c.kind) {
    case 'anyOfRequired':
      return { ...base, anyOf: c.props.map((p) => requiredSchema([p])) };
    case 'oneOfRequired':
      return { ...base, oneOf: c.props.map((p) => requiredSchema([p])) };
    case 'requiredIf':
      return { ...base, if: conditionSchema(model, c.type, c.when), then: requiredSchema(c.props) };
    case 'forbiddenIf':
      return { ...base, if: conditionSchema(model, c.type, c.when), then: forbiddenSchema(c.props) };
    case 'requiredIff':
      return {
        ...base,
        if: conditionSchema(model, c.type, c.when),
        then: requiredSchema([c.prop]),
        else: forbiddenSchema([c.prop]),
      };
    case 'itemsIf': {
      const items: Schema = {
        type: 'object',
        properties: Object.fromEntries([...c.require.map((p) => [p, true]), ...c.forbid.map((p) => [p, { not: {} }])]),
      };
      if (c.require.length > 0) items.required = [...c.require];
      return {
        ...base,
        if: conditionSchema(model, c.type, c.when),
        then: { type: 'object', properties: { [c.items]: { type: 'array', items } } },
      };
    }
  }
}

function typeSchema(model: TypesModel, typeName: string, minor: string, strict: boolean): Schema {
  const type = model.source.types[typeName];
  if (type === undefined) throw new Error(`tipo desconocido: ${typeName}`);
  const properties: Schema = {};
  const required: string[] = [];
  for (const [prop, spec] of Object.entries(type.props)) {
    properties[prop] = propSchema(model, typeName, prop, spec, minor, strict);
    if (spec.required) required.push(prop);
  }
  properties.extensions = type.extensions ? { $ref: '#/$defs/Extensions' } : { not: {} };
  const schema: Schema = { type: 'object', properties };
  if (required.length > 0) schema.required = required;
  const constraints = model.overlay.constraints.filter((c) => c.type === typeName);
  if (constraints.length > 0) schema.allOf = constraints.map((c) => constraintSchema(model, c));
  // Lo desconocido: en el estricto no vale; en el abierto, cualquier JSON salvo null.
  schema.unevaluatedProperties = strict ? false : { $ref: '#/$defs/ExtensionValue' };
  return schema;
}

/** El schema abierto o estricto del documento de una menor: un solo generador para los dos. */
export function generateSchema(model: TypesModel, minor: string, opts: { strict: boolean }): object {
  const defs: Record<string, Schema> = {};
  for (const typeName of Object.keys(model.source.types)) defs[typeName] = typeSchema(model, typeName, minor, opts.strict);
  defs.Extensions = {
    type: 'object',
    patternProperties: { [pattern('extensionKey')]: { $ref: '#/$defs/ExtensionValue' } },
    additionalProperties: false,
  };
  // Cualquier JSON salvo null, en cualquier nivel; la profundidad la acota el parser.
  defs.ExtensionValue = {
    type: ['boolean', 'number', 'string', 'array', 'object'],
    items: { $ref: '#/$defs/ExtensionValue' },
    additionalProperties: { $ref: '#/$defs/ExtensionValue' },
  };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: schemaUrl(minor, opts.strict),
    $comment: SCHEMA_COMMENT,
    'x-jdx-license': { ...SCHEMA_LICENSE },
    $ref: '#/$defs/Document',
    $defs: defs,
  };
}

/**
 * Los lugares del documento que las reglas buscan por puntero (patrones con `*`
 * por cada índice), bajando desde Document por el modelo, en el orden de
 * types.json: referencias (REF-002/003), listas abiertas (VER-004), porcentajes
 * (NUM-001), fechas e instantes (NUM-002) y datos personales. Son datos, no
 * schema: salen del mismo modelo que las anotaciones del schema.
 *
 * Datos personales: `personalData` lleva la propiedad que siempre lo es;
 * `personalDataWhen`, el objeto que lo es según una de sus propiedades (el
 * overlay: un Name con `type` legal, un Identifier con `scheme` TAX_ID o
 * NATIONAL_ID), con la condición. La condición se evalúa contra el documento.
 */
export function generateIndex(model: TypesModel, minor: string): SchemaIndex {
  const index: SchemaIndex = { minor, refs: [], openLists: [], percents: [], dates: [], instants: [], personalData: [], personalDataWhen: [] };
  const visit = (typeName: string, prefix: string): void => {
    const type = model.source.types[typeName];
    if (type === undefined) throw new Error(`tipo desconocido: ${typeName}`);
    for (const [prop, spec] of Object.entries(type.props)) {
      const at = `${prefix}/${prop.replaceAll('~', '~0').replaceAll('/', '~1')}`;
      if (spec.personalData === true) {
        const when = model.overlay.personalDataWhen[`${typeName}.${prop}`];
        if (when === undefined) index.personalData.push(at);
        else index.personalDataWhen.push({ pattern: prefix, path: when.path, in: when.in });
      }
      let pattern = at;
      let leaf = spec.type;
      while ('array' in leaf) {
        pattern += '/*';
        leaf = leaf.array;
      }
      if ('type' in leaf) visit(leaf.type, pattern);
      else if ('ref' in leaf) index.refs.push(leaf.refTypes === undefined ? { pattern, list: leaf.ref } : { pattern, list: leaf.ref, refTypes: leaf.refTypes });
      else if ('open' in leaf) {
        const list = model.source.openLists[leaf.open];
        if (list === undefined) throw new Error(`lista abierta desconocida: ${leaf.open}`);
        index.openLists.push({ pattern, list: leaf.open, style: list.style });
      } else if ('scalar' in leaf) {
        if (leaf.scalar === 'percent') index.percents.push(pattern);
        if (leaf.scalar === 'date') index.dates.push(pattern);
        if (leaf.scalar === 'instant') index.instants.push(pattern);
      }
    }
  };
  visit('Document', '');
  return index;
}

/**
 * Nombres de TS que no son los de types.json: `Document` es también un tipo
 * del DOM; `Signer` se confunde con el firmante de la librería (JwsSigner); y
 * `Condition` ya es el tipo de las condiciones del overlay en src/types.ts.
 */
export const TS_RENAMES: Readonly<Record<string, string>> = Object.freeze({
  Document: 'JdxDocument',
  Signer: 'EvidenceSigner',
  Condition: 'AgreementCondition',
});

function tsName(typeName: string): string {
  return Object.hasOwn(TS_RENAMES, typeName) ? (TS_RENAMES[typeName] as string) : typeName;
}

const NUMERIC: ReadonlySet<ScalarName> = new Set(['integer', 'integer>=0', 'integer>=1', 'year', 'percent']);

function tsType(ref: TypeRef): string {
  if ('scalar' in ref) return ref.scalar === 'boolean' ? 'boolean' : NUMERIC.has(ref.scalar) ? 'number' : 'string';
  if ('type' in ref) return tsName(ref.type);
  if ('closed' in ref) return ref.closed.map((v) => `'${v}'`).join(' | ');
  if ('array' in ref) {
    const item = tsType(ref.array);
    return `readonly ${item.includes(' | ') ? `(${item})` : item}[]`;
  }
  return 'string';
}

/** El comentario de una propiedad: su descripción y, si es una lista abierta o una referencia, cuál. */
function tsDoc(model: TypesModel, spec: PropSpec): string {
  let leaf = spec.type;
  while ('array' in leaf) leaf = leaf.array;
  const parts: string[] = [spec.description];
  if ('open' in leaf) {
    const initial = model.source.openLists[leaf.open]?.initial ?? [];
    parts.push(`Lista abierta \`${leaf.open}\`: ${initial.length > 0 ? initial.join(', ') : 'sin valores iniciales'}, o un valor propio \`X_\`.`);
  }
  if ('ref' in leaf) parts.push(`Id local de \`${leaf.ref}\`${leaf.refTypes === undefined ? '' : ` (${leaf.refTypes.join(', ')})`}.`);
  return parts.join(' ').replaceAll('*/', '*\\/');
}

/** Los tipos TS del documento: una interfaz por tipo de types.json, con sus propiedades de solo lectura. */
export function generateTypesTs(model: TypesModel): string {
  const renamed = Object.entries(TS_RENAMES).map(([from, to]) => `${from} → ${to}`).join(', ');
  const lines = [
    '/**',
    ` * Tipos del documento JDX ${model.source.jdx}: generado por \`npm run gen\``,
    ' * desde schema/src/types.json. No editar a mano.',
    ' *',
    ' * Los nombres son los de types.json, salvo los de TS_RENAMES:',
    ` * ${renamed}.`,
    ' * Los patrones, las restricciones condicionales y las listas abiertas los',
    ' * controla el schema: acá un id, una fecha o un valor de lista abierta son `string`.',
    ' */',
    '',
    '/** El valor de una extensión: cualquier JSON salvo null. */',
    'export type ExtensionValue = boolean | number | string | readonly ExtensionValue[] | { readonly [key: string]: ExtensionValue };',
    '',
    '/** Extensiones: cada clave es un dominio invertido (`ar.example.x`). */',
    'export type Extensions = { readonly [key: string]: ExtensionValue };',
  ];
  for (const [typeName, type] of Object.entries(model.source.types)) {
    lines.push('', `/** ${type.description.replaceAll('*/', '*\\/')} */`, `export interface ${tsName(typeName)} {`);
    for (const [prop, spec] of Object.entries(type.props)) {
      const doc = tsDoc(model, spec);
      if (doc !== '') lines.push(`  /** ${doc} */`);
      const key = /^[$A-Za-z_][$\w]*$/.test(prop) ? prop : `'${prop}'`;
      lines.push(`  readonly ${key}${spec.required ? '' : '?'}: ${tsType(spec.type)};`);
    }
    if (type.extensions) lines.push('  readonly extensions?: Extensions;');
    lines.push('}');
  }
  return `${lines.join('\n')}\n`;
}
