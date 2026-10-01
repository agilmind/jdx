/**
 * Schema abierto del documento (src/schema/generate.ts, strict: false) desde el
 * modelo de tipos: estructura, aviso de autoría, formatos, sin null ni límites
 * de largo, extensiones y anotaciones.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PATTERNS, SCALAR_PATTERN } from '../../../src/conventions/patterns.js';
import { segmentsOf } from '../../../src/json/pointer.js';
import { createAjv } from '../../../src/schema/ajv.js';
import { generateSchema } from '../../../src/schema/generate.js';
import { loadModel } from '../../../src/schema/model.js';
import { compileSchemas } from '../../../src/schema/validators.js';
import type { JsonValue, TypeRef } from '../../../src/types.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string): string => readFileSync(`${ROOT}${rel}`, 'utf8');
const MODEL = loadModel(JSON.parse(read('schema/src/types.json')), JSON.parse(read('schema/src/types.overlay.json')));
const OPEN = generateSchema(MODEL, '1.0', { strict: false }) as { [k: string]: unknown; $defs: Record<string, Sub> };
const EXAMPLE = JSON.parse(read('docs/ejemplo/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json')) as JsonValue;
const validators = compileSchemas({ minors: ['1.0'], open: { '1.0': OPEN }, strict: {}, index: {}, aux: {} });
const validate = (doc: JsonValue) => validators.validateDocument('1.0', false, doc);

type Sub = { [k: string]: unknown };

/** Una copia del documento con `value` en `pointer` (el último segmento se agrega o se reemplaza). */
function withValue(doc: JsonValue, pointer: string, value: JsonValue): JsonValue {
  const copy = structuredClone(doc);
  const segments = segmentsOf(pointer);
  const last = segments.pop() as string;
  let node = copy as { [k: string]: JsonValue };
  for (const s of segments) node = node[s] as { [k: string]: JsonValue };
  node[last] = value;
  return copy;
}

/** Cada subschema escrito en línea, con su puntero: lo que cuelga de las palabras que llevan schemas. */
function subschemas(schema: unknown, pointer = ''): [string, Sub][] {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return [];
  const sub = schema as Sub;
  const out: [string, Sub][] = [[pointer, sub]];
  for (const key of ['items', 'additionalProperties', 'unevaluatedProperties', 'not', 'if', 'then', 'else']) {
    if (key in sub) out.push(...subschemas(sub[key], `${pointer}/${key}`));
  }
  for (const key of ['properties', 'patternProperties', '$defs']) {
    for (const [name, child] of Object.entries((sub[key] ?? {}) as Sub)) out.push(...subschemas(child, `${pointer}/${key}/${name}`));
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    for (const [i, child] of ((sub[key] ?? []) as unknown[]).entries()) out.push(...subschemas(child, `${pointer}/${key}/${i}`));
  }
  return out;
}

/** El schema de una propiedad, sin los `items` de sus arreglos. */
function leafSchema(typeName: string, prop: string): Sub {
  let schema = (OPEN.$defs[typeName]?.properties as Record<string, Sub>)[prop] as Sub;
  while (schema.type === 'array') schema = schema.items as Sub;
  return schema;
}

const leafOf = (ref: TypeRef): TypeRef => ('array' in ref ? leafOf(ref.array) : ref);
const PROPS = Object.entries(MODEL.source.types).flatMap(([t, type]) =>
  Object.entries(type.props).map(([p, spec]) => ({ t, p, leaf: leafOf(spec.type) })),
);

describe('generateSchema (abierto)', () => {
  it('open schema compiles with createAjv', () => {
    expect(() => createAjv().compile(OPEN)).not.toThrow();
  });

  it('every inline subschema has type', () => {
    const missing = subschemas(OPEN)
      .filter(([, s]) => !('type' in s) && !('$ref' in s))
      // Lo único sin tipo: el schema que prohíbe una propiedad, `{ "not": {} }`, y su `{}`.
      .filter(([pointer, s]) => !(JSON.stringify(s) === '{"not":{}}' || (pointer.endsWith('/not') && JSON.stringify(s) === '{}')));
    expect(missing.map(([pointer]) => pointer)).toEqual([]);
    // La raíz también es una referencia: `{ "$ref": "#/$defs/Document" }`.
    expect(OPEN.$ref).toBe('#/$defs/Document');
    expect(subschemas(OPEN).length).toBeGreaterThan(500);
  });

  it('no schema uses format', () => {
    expect(JSON.stringify(OPEN)).not.toContain('"format"');
  });

  it('$comment and x-jdx-license', () => {
    expect(OPEN.$comment).toBe('JDX 1.0. Creado por Agilmind SRL. Condiciones de uso: ver x-jdx-license.');
    expect(OPEN['x-jdx-license']).toEqual({ spdx: 'LicenseRef-Agilmind-JDX', url: 'https://github.com/agilmind/jdx/blob/HEAD/LICENSE' });
  });

  it('$id of the open schema', () => {
    expect(OPEN.$id).toBe('https://jdx.jupiter.ar/schema/1.0/jdx.schema.json');
    expect(OPEN.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(Object.keys(OPEN)).toEqual(['$schema', '$id', '$comment', 'x-jdx-license', '$ref', '$defs']);
  });

  it('one $defs entry per type (80)', () => {
    // Los 80 tipos, en el orden de types.json, y las dos definiciones de las extensiones.
    expect(Object.keys(OPEN.$defs)).toEqual([...Object.keys(MODEL.source.types), 'Extensions', 'ExtensionValue']);
    expect(Object.keys(MODEL.source.types)).toHaveLength(80);
  });

  it('the example is valid under open', () => {
    expect(validate(EXAMPLE)).toEqual([]);
  });

  it('open accepts percnet and jdx 1.3', () => {
    const doc = withValue(withValue(EXAMPLE, '/works/0/shares/0/percnet', 25), '/jdx', '1.3');
    expect(validate(doc)).toEqual([]);
    expect(validate(withValue(EXAMPLE, '/$schema', 'https://jdx.jupiter.ar/schema/1.3/jdx.schema.json'))).toEqual([]);
    // La mayor no: 2.0 no cumple el patrón del abierto 1.x, y la URL estricta tampoco.
    expect(validate(withValue(EXAMPLE, '/jdx', '2.0')).map((e) => e.instanceLocation)).toEqual(['/jdx']);
    expect(validate(withValue(EXAMPLE, '/$schema', 'https://jdx.jupiter.ar/schema/1.0/jdx.strict.schema.json'))).toHaveLength(1);
  });

  it('null is rejected at ten sampled positions', () => {
    const pointers = [
      '/profiles/0', '/declaration/language', '/declaration/recipients/0/society', '/parties/0/names/0/given',
      '/parties/0/birthDate', '/works/0/titles/0/text', '/works/0/shares/0/percent', '/recordings/0/title',
      '/agreements/0/territories/include/0', '/media/1/sha256',
    ];
    for (const pointer of pointers) {
      const errors = validate(withValue(EXAMPLE, pointer, null));
      expect(errors.length, pointer).toBeGreaterThan(0);
      expect(errors.every((e) => e.instanceLocation === pointer && e.keyword === 'type'), pointer).toBe(true);
    }
  });

  it('unknown properties admit any JSON but null, at the root and nested', () => {
    // El abierto admite propiedades desconocidas (un archivo de una menor más nueva), pero tampoco ahí vale
    // null: lo desconocido se valida como el valor de una extensión, en cualquier nivel.
    const at = (doc: JsonValue) => validate(doc).map((e) => [e.instanceLocation, e.keywordLocation, e.keyword]);
    expect(validate(withValue(EXAMPLE, '/newRoot', { a: [1, 'b', true, {}] }))).toEqual([]);
    expect(validate(withValue(EXAMPLE, '/works/0/shares/0/newField', 'x'))).toEqual([]);
    const nullType = (pointer: string) => [[pointer, '/$defs/ExtensionValue/type', 'type']];
    expect(at(withValue(EXAMPLE, '/newRoot', null))).toEqual(nullType('/newRoot'));
    expect(at(withValue(EXAMPLE, '/newRoot', { a: null }))).toEqual(nullType('/newRoot/a'));
    expect(at(withValue(EXAMPLE, '/works/0/newField', null))).toEqual(nullType('/works/0/newField'));
    expect(at(withValue(EXAMPLE, '/works/0/shares/0/newField', { b: [1, null] }))).toEqual(nullType('/works/0/shares/0/newField/b/1'));
    // En cada tipo de types.json; las extensiones ya lo hacen con sus propias palabras.
    const defs = Object.entries(OPEN.$defs).filter(([name]) => name !== 'Extensions' && name !== 'ExtensionValue');
    expect(defs).toHaveLength(80);
    for (const [name, def] of defs) expect(def.unevaluatedProperties, name).toEqual({ $ref: '#/$defs/ExtensionValue' });
  });

  it('extensions rejected inside works/0/titles/0', () => {
    const extensions = { 'ar.jupiter.x': 1 };
    expect(validate(withValue(EXAMPLE, '/works/0/titles/0/extensions', extensions))).toEqual([
      {
        instanceLocation: '/works/0/titles/0/extensions',
        keywordLocation: '/$defs/Title/properties/extensions/not',
        keyword: 'not',
        params: {},
      },
    ]);
    // En los siete tipos que la listan, sí.
    expect(validate(withValue(EXAMPLE, '/works/0/extensions', extensions))).toEqual([]);
    expect(validate(withValue(EXAMPLE, '/edition/extensions', extensions))).toEqual([]);
  });

  it('extension key pattern and null value', () => {
    expect(validate(withValue(EXAMPLE, '/extensions', { 'ar.example.editorial': 'editorial-sur', 'ar.jupiter.x': { a: [1, 'b', true, {}] } }))).toEqual([]);
    expect(validate(withValue(EXAMPLE, '/extensions', { 'Bad Key': 1, editorial: 2 })).map((e) => [e.instanceLocation, e.keyword])).toEqual([
      ['/extensions/Bad Key', 'additionalProperties'],
      ['/extensions/editorial', 'additionalProperties'],
    ]);
    expect(validate(withValue(EXAMPLE, '/extensions', { 'ar.jupiter.x': null })).map((e) => [e.instanceLocation, e.keywordLocation])).toEqual([
      ['/extensions/ar.jupiter.x', '/$defs/ExtensionValue/type'],
    ]);
    expect(validate(withValue(EXAMPLE, '/extensions', { 'ar.jupiter.x': { a: [1, null] } })).map((e) => e.instanceLocation)).toEqual([
      '/extensions/ar.jupiter.x/a/1',
    ]);
    // 64 niveles, el máximo del parser: la raíz, extensions y 62 arreglos. Ajv lo valida sin desbordar.
    let deep: JsonValue = 'fondo';
    for (let i = 0; i < 62; i++) deep = [deep];
    expect(validate(withValue(EXAMPLE, '/extensions', { 'ar.jupiter.deep': deep }))).toEqual([]);
  });

  it('text accepts the empty string', () => {
    expect(validate(withValue(EXAMPLE, '/works/0/titles/0/text', ''))).toEqual([]);
    expect(validate(withValue(EXAMPLE, '/parties/0/names/0/given', ''))).toEqual([]);
    expect(JSON.stringify(OPEN)).not.toContain('minLength');
  });

  it('works[].titles needs one element', () => {
    expect(validate(withValue(EXAMPLE, '/works/0/titles', []))).toEqual([
      { instanceLocation: '/works/0/titles', keywordLocation: '/$defs/Work/properties/titles/minItems', keyword: 'minItems', params: { limit: 1 } },
    ]);
  });

  it('45 ref properties carry x-jdx-ref, and x-jdx-ref-type where listed', () => {
    const refs = PROPS.filter(({ leaf }) => 'ref' in leaf);
    expect(refs).toHaveLength(45);
    for (const { t, p, leaf } of refs) {
      if (!('ref' in leaf)) continue;
      const schema = leafSchema(t, p);
      expect(schema['x-jdx-ref'], `${t}.${p}`).toBe(leaf.ref);
      expect(schema['x-jdx-ref-type'], `${t}.${p}`).toEqual(leaf.refTypes);
      expect(schema.pattern, `${t}.${p}`).toBe('^[a-z][a-z0-9-]{0,63}$');
    }
    expect(subschemas(OPEN).filter(([, s]) => 'x-jdx-ref' in s)).toHaveLength(45);
    expect(leafSchema('Share', 'agreement')['x-jdx-ref-type']).toEqual(['publishing', 'subPublishing', 'administration', 'assignment', 'writerSplit']);
  });

  it('scalars use PATTERNS through SCALAR_PATTERN', () => {
    let checked = 0;
    for (const { t, p, leaf } of PROPS) {
      if (!('scalar' in leaf)) continue;
      const name = SCALAR_PATTERN[leaf.scalar];
      const schema = leafSchema(t, p);
      if (t === 'Document' && (p === '$schema' || p === 'jdx')) continue;
      if (name === undefined) {
        expect(schema.pattern, `${t}.${p}`).toBeUndefined();
        continue;
      }
      expect(schema, `${t}.${p}`).toEqual({ type: 'string', pattern: PATTERNS[name].source.replaceAll('\\/', '/'), ...(schema['x-jdx-personal-data'] === undefined ? {} : { 'x-jdx-personal-data': schema['x-jdx-personal-data'] }) });
      checked++;
    }
    // 74 propiedades con escalar de patrón, sin contar `$schema` y `jdx` de la raíz.
    expect(checked).toBe(74);
    expect(leafSchema('Link', 'url').pattern).toBe('^https?://\\S+$');
    expect(leafSchema('Work', 'duration').pattern).toBe('^P(?!$)(\\d+Y)?(\\d+M)?(\\d+D)?(T(?=\\d)(\\d+H)?(\\d+M)?(\\d+S)?)?$');
    expect(leafSchema('PLine', 'year')).toEqual({ type: 'integer', minimum: 1000, maximum: 9999 });
    expect(leafSchema('Share', 'percent')).toEqual({ type: 'number', minimum: 0, maximum: 100 });
  });
});
