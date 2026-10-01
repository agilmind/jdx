/**
 * Modelo de tipos, la fuente canónica de los schemas: schema/src/types.json
 * (tipos, campos, listas abiertas y descripciones) más
 * schema/src/types.overlay.json (restricciones condicionales, datos personales
 * condicionales y traducciones de las descripciones). De acá salen los
 * schemas, el índice, los tipos TS y docs/campos.md.
 *
 * Los dos meta-schemas viven acá como constantes, porque la librería no lee
 * disco; schema/src/types.schema.json y types.overlay.schema.json son su texto
 * (los escribe `npm run gen`). loadModel valida contra ellos y después controla
 * lo que un schema no ve: que cada nombre exista y que cada condición tenga
 * sentido. Lanza: se usa al generar y en los tests, nunca al validar un
 * documento.
 */
import type { ValidateFunction } from 'ajv/dist/2020.js';
import { PATTERNS } from '../conventions/patterns.js';
import type { Condition, JsonValue, ScalarName, TypeRef, TypesModel, TypesOverlay, TypesSource } from '../types.js';
import { createAjv, toSchemaErrors } from './ajv.js';
import { SCHEMA_COMMENT, SCHEMA_LICENSE } from './notice.js';

/** Todos los escalares: un Record exige cada ScalarName. */
const SCALARS: Readonly<Record<ScalarName, true>> = {
  text: true, boolean: true, integer: true, 'integer>=0': true, 'integer>=1': true, year: true, percent: true,
  instant: true, date: true, duration: true, amount: true, currency: true, sha256: true, uuid: true, localId: true,
  issuerId: true, kid: true, country: true, subdivision: true, tis: true, society: true, language: true, url: true,
  uri: true, email: true, phone: true, mediaType: true, fraction: true, schemaVersion: true,
};

const TYPE_NAME = '^[A-Z][A-Za-z]*$';
const PROP_NAME = '^\\$?[a-z][A-Za-z0-9]*$';
const TYPE_PROP = '^[A-Z][A-Za-z]*\\.\\$?[a-z][A-Za-z0-9]*$';
const TYPE_OR_PROP = '^[A-Z][A-Za-z]*(\\.\\$?[a-z][A-Za-z0-9]*)?$';
const DESCRIPTION = { type: 'string', minLength: 1 };

/** Meta-schema de schema/src/types.json (TypesSource). */
export const TYPES_SOURCE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://jdx.jupiter.ar/schema/src/types.schema.json',
  $comment: SCHEMA_COMMENT,
  'x-jdx-license': { ...SCHEMA_LICENSE },
  title: 'Tipos de JDX (schema/src/types.json)',
  type: 'object',
  properties: {
    jdx: { type: 'string', pattern: '^\\d+\\.\\d+$' },
    openLists: {
      type: 'object',
      propertyNames: { type: 'string', pattern: '^[a-z][A-Za-z0-9]*$' },
      additionalProperties: { $ref: '#/$defs/OpenList' },
    },
    types: {
      type: 'object',
      propertyNames: { type: 'string', pattern: TYPE_NAME },
      additionalProperties: { $ref: '#/$defs/Type' },
    },
  },
  required: ['jdx', 'openLists', 'types'],
  additionalProperties: false,
  $defs: {
    OpenList: {
      type: 'object',
      properties: {
        initial: { type: 'array', items: { type: 'string' } },
        style: { type: 'string', enum: ['enum', 'scheme'] },
      },
      required: ['initial', 'style'],
      additionalProperties: false,
    },
    Type: {
      type: 'object',
      properties: {
        group: DESCRIPTION,
        description: DESCRIPTION,
        extensions: { type: 'boolean' },
        props: {
          type: 'object',
          propertyNames: { type: 'string', pattern: PROP_NAME },
          additionalProperties: { $ref: '#/$defs/Prop' },
        },
      },
      required: ['group', 'description', 'extensions', 'props'],
      additionalProperties: false,
    },
    Prop: {
      type: 'object',
      properties: {
        type: { $ref: '#/$defs/TypeRef' },
        required: { type: 'boolean' },
        personalData: { type: 'boolean', const: true },
        description: DESCRIPTION,
      },
      required: ['type', 'required', 'description'],
      additionalProperties: false,
    },
    TypeRef: {
      type: 'object',
      oneOf: [
        {
          type: 'object',
          properties: { scalar: { type: 'string', enum: Object.keys(SCALARS) } },
          required: ['scalar'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: { type: { type: 'string', pattern: TYPE_NAME } },
          required: ['type'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            ref: { type: 'string', enum: ['parties', 'works', 'recordings', 'agreements', 'media'] },
            refTypes: { type: 'array', items: { type: 'string', pattern: '^[a-z][A-Za-z0-9]*$' }, minItems: 1 },
          },
          required: ['ref'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: { closed: { type: 'array', items: { type: 'string' }, minItems: 1 } },
          required: ['closed'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: { open: { type: 'string', pattern: '^[a-z][A-Za-z0-9]*$' } },
          required: ['open'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: { array: { $ref: '#/$defs/TypeRef' }, minItems: { type: 'integer', const: 1 } },
          required: ['array'],
          additionalProperties: false,
        },
      ],
    },
  },
};

/** Meta-schema de schema/src/types.overlay.json (TypesOverlay). */
export const TYPES_OVERLAY_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://jdx.jupiter.ar/schema/src/types.overlay.schema.json',
  $comment: SCHEMA_COMMENT,
  'x-jdx-license': { ...SCHEMA_LICENSE },
  title: 'Restricciones, datos personales condicionales y traducciones (schema/src/types.overlay.json)',
  type: 'object',
  properties: {
    constraints: { type: 'array', items: { $ref: '#/$defs/Constraint' } },
    personalDataWhen: {
      type: 'object',
      propertyNames: { type: 'string', pattern: TYPE_PROP },
      additionalProperties: { $ref: '#/$defs/Condition' },
    },
    translations: {
      type: 'object',
      propertyNames: { type: 'string', pattern: TYPE_OR_PROP },
      additionalProperties: {
        type: 'object',
        properties: { pt: { type: 'string' }, en: { type: 'string' } },
        additionalProperties: false,
      },
    },
  },
  required: ['constraints', 'personalDataWhen', 'translations'],
  additionalProperties: false,
  $defs: {
    Condition: {
      type: 'object',
      properties: {
        path: { type: 'string', pattern: '^[a-z][A-Za-z0-9]*(\\.[a-z][A-Za-z0-9]*)*$' },
        in: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['path', 'in'],
      additionalProperties: false,
    },
    Constraint: {
      type: 'object',
      oneOf: [
        {
          type: 'object',
          properties: {
            id: { $ref: '#/$defs/Id' },
            kind: { type: 'string', enum: ['anyOfRequired', 'oneOfRequired'] },
            type: { type: 'string', pattern: TYPE_NAME },
            props: { type: 'array', items: { type: 'string', pattern: PROP_NAME }, minItems: 2, uniqueItems: true },
          },
          required: ['id', 'kind', 'type', 'props'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            id: { $ref: '#/$defs/Id' },
            kind: { type: 'string', enum: ['requiredIf', 'forbiddenIf'] },
            type: { type: 'string', pattern: TYPE_NAME },
            when: { $ref: '#/$defs/Condition' },
            props: { type: 'array', items: { type: 'string', pattern: PROP_NAME }, minItems: 1, uniqueItems: true },
          },
          required: ['id', 'kind', 'type', 'when', 'props'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            id: { $ref: '#/$defs/Id' },
            kind: { type: 'string', const: 'requiredIff' },
            type: { type: 'string', pattern: TYPE_NAME },
            when: { $ref: '#/$defs/Condition' },
            prop: { type: 'string', pattern: PROP_NAME },
          },
          required: ['id', 'kind', 'type', 'when', 'prop'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            id: { $ref: '#/$defs/Id' },
            kind: { type: 'string', const: 'itemsIf' },
            type: { type: 'string', pattern: TYPE_NAME },
            when: { $ref: '#/$defs/Condition' },
            items: { type: 'string', pattern: PROP_NAME },
            require: { type: 'array', items: { type: 'string', pattern: PROP_NAME } },
            forbid: { type: 'array', items: { type: 'string', pattern: PROP_NAME } },
          },
          required: ['id', 'kind', 'type', 'when', 'items', 'require', 'forbid'],
          additionalProperties: false,
        },
      ],
    },
    Id: { type: 'string', pattern: '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' },
  },
};

let metaValidators: { source: ValidateFunction; overlay: ValidateFunction } | undefined;

/** Valida types.json y el overlay y devuelve el modelo. Lanza con todos los problemas juntos. */
export function loadModel(source: JsonValue, overlay: JsonValue): TypesModel {
  if (metaValidators === undefined) {
    const ajv = createAjv();
    metaValidators = { source: ajv.compile(TYPES_SOURCE_SCHEMA), overlay: ajv.compile(TYPES_OVERLAY_SCHEMA) };
  }
  const problems: string[] = [];
  for (const [name, validate, value] of [
    ['types.json', metaValidators.source, source],
    ['types.overlay.json', metaValidators.overlay, overlay],
  ] as const) {
    if (!validate(value)) {
      for (const e of toSchemaErrors(validate.errors)) {
        problems.push(`${name}: ${e.instanceLocation || '/'} no cumple ${e.keyword} ${JSON.stringify(e.params)}`);
      }
    }
  }
  if (problems.length === 0) {
    const model = { source: source as unknown as TypesSource, overlay: overlay as unknown as TypesOverlay };
    problems.push(...checkSource(model.source), ...checkOverlay(model));
    if (problems.length === 0) return model;
  }
  throw new Error(`modelo de tipos inválido:\n${problems.join('\n')}`);
}

function leafOf(ref: TypeRef): TypeRef {
  return 'array' in ref ? leafOf(ref.array) : ref;
}

function checkSource(source: TypesSource): string[] {
  const problems: string[] = [];
  const usedLists = new Set<string>();
  if (!Object.hasOwn(source.types, 'Document')) problems.push('types.json: falta el tipo Document');
  for (const [typeName, type] of Object.entries(source.types)) {
    for (const [prop, spec] of Object.entries(type.props)) {
      const leaf = leafOf(spec.type);
      if ('type' in leaf && !Object.hasOwn(source.types, leaf.type)) {
        problems.push(`types.json: ${typeName}.${prop} usa el tipo ${leaf.type}, que no existe`);
      }
      if ('open' in leaf) {
        usedLists.add(leaf.open);
        if (!Object.hasOwn(source.openLists, leaf.open)) {
          problems.push(`types.json: ${typeName}.${prop} usa la lista ${leaf.open}, que no existe`);
        }
      }
    }
  }
  for (const list of Object.keys(source.openLists)) {
    if (!usedLists.has(list)) problems.push(`types.json: la lista ${list} no la usa ninguna propiedad`);
  }
  return problems;
}

/** El tipo de la propiedad a la que lleva `path` desde `typeName` (con `.` baja por tipos), o un problema. */
function resolvePath(source: TypesSource, typeName: string, path: string): TypeRef | string {
  let current = typeName;
  const segments = path.split('.');
  for (const [i, segment] of segments.entries()) {
    const type = source.types[current];
    const spec = type !== undefined && Object.hasOwn(type.props, segment) ? type.props[segment] : undefined;
    if (spec === undefined) return `${current} no tiene la propiedad ${segment}`;
    if (i === segments.length - 1) return spec.type;
    if (!('type' in spec.type)) return `${current}.${segment} no es un tipo de types.json`;
    current = spec.type.type;
  }
  return `camino vacío`;
}

/** Un valor de condición sirve si la propiedad es booleana (true/false), de lista cerrada o de lista abierta. */
function checkCondition(source: TypesSource, typeName: string, when: Condition, where: string): string[] {
  const ref = resolvePath(source, typeName, when.path);
  if (typeof ref === 'string') return [`${where}: ${ref}`];
  const valid = (value: string): boolean => {
    if ('scalar' in ref && ref.scalar === 'boolean') return value === 'true' || value === 'false';
    if ('closed' in ref) return ref.closed.includes(value);
    if ('open' in ref) {
      const style = source.openLists[ref.open]?.style;
      return (style === 'scheme' ? PATTERNS.schemeValue : PATTERNS.enumValue).test(value);
    }
    return false;
  };
  return when.in.filter((v) => !valid(v)).map((v) => `${where}: ${JSON.stringify(v)} no es un valor de ${typeName}.${when.path}`);
}

function checkOverlay({ source, overlay }: TypesModel): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const hasProp = (typeName: string, prop: string): boolean => {
    const type = source.types[typeName];
    return type !== undefined && Object.hasOwn(type.props, prop);
  };
  for (const c of overlay.constraints) {
    const where = `restricción ${c.id}`;
    if (ids.has(c.id)) problems.push(`${where}: id repetido`);
    ids.add(c.id);
    if (!Object.hasOwn(source.types, c.type)) {
      problems.push(`${where}: el tipo ${c.type} no existe`);
      continue;
    }
    const props = c.kind === 'requiredIff' ? [c.prop] : c.kind === 'itemsIf' ? [c.items] : c.props;
    for (const p of props) if (!hasProp(c.type, p)) problems.push(`${where}: ${c.type} no tiene la propiedad ${p}`);
    if ('when' in c) problems.push(...checkCondition(source, c.type, c.when, where));
    if (c.kind === 'itemsIf' && hasProp(c.type, c.items)) {
      const items = source.types[c.type]?.props[c.items]?.type;
      if (items === undefined || !('array' in items) || !('type' in items.array)) {
        problems.push(`${where}: ${c.type}.${c.items} no es una lista de un tipo de types.json`);
      } else {
        const itemType = items.array.type;
        for (const p of [...c.require, ...c.forbid]) {
          if (!hasProp(itemType, p)) problems.push(`${where}: ${itemType} no tiene la propiedad ${p}`);
        }
      }
    }
  }
  for (const [key, when] of Object.entries(overlay.personalDataWhen)) {
    const [typeName = '', prop = ''] = key.split('.');
    if (!hasProp(typeName, prop)) {
      problems.push(`datos personales ${key}: la propiedad no existe`);
    } else if (source.types[typeName]?.props[prop]?.personalData !== true) {
      problems.push(`datos personales ${key}: types.json no la marca personalData`);
    } else {
      problems.push(...checkCondition(source, typeName, when, `datos personales ${key}`));
    }
  }
  for (const key of Object.keys(overlay.translations)) {
    const [typeName = '', prop] = key.split('.');
    const exists = prop === undefined ? Object.hasOwn(source.types, typeName) : hasProp(typeName, prop);
    if (!exists) problems.push(`traducciones ${key}: ${prop === undefined ? 'el tipo' : 'la propiedad'} no existe`);
  }
  return problems;
}
