/**
 * Schema estricto: el mismo generador que el abierto, con `const` en
 * `jdx` y `$schema` y `unevaluatedProperties: false` en cada tipo, salvo las
 * extensiones. Los archivos de schema/1.0 son la salida de `npm run gen`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { segmentsOf } from '../../../src/json/pointer.js';
import { createAjv } from '../../../src/schema/ajv.js';
import { generateSchema } from '../../../src/schema/generate.js';
import { loadModel } from '../../../src/schema/model.js';
import { compileSchemas } from '../../../src/schema/validators.js';
import type { JsonValue } from '../../../src/types.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string): string => readFileSync(`${ROOT}${rel}`, 'utf8');
const MODEL = loadModel(JSON.parse(read('schema/src/types.json')), JSON.parse(read('schema/src/types.overlay.json')));
type Defs = Record<string, { [k: string]: unknown; properties: Record<string, unknown> }>;
const OPEN = JSON.parse(read('schema/1.0/jdx.schema.json')) as { [k: string]: unknown; $defs: Defs };
const STRICT = JSON.parse(read('schema/1.0/jdx.strict.schema.json')) as { [k: string]: unknown; $defs: Defs };
const EXAMPLE = JSON.parse(read('docs/ejemplo/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json')) as JsonValue;
const validators = compileSchemas({ minors: ['1.0'], open: { '1.0': OPEN }, strict: { '1.0': STRICT }, index: {}, aux: {} });

/** Una copia del documento con `value` en `pointer`. */
function withValue(doc: JsonValue, pointer: string, value: JsonValue): JsonValue {
  const copy = structuredClone(doc);
  const segments = segmentsOf(pointer);
  const last = segments.pop() as string;
  let node = copy as { [k: string]: JsonValue };
  for (const s of segments) node = node[s] as { [k: string]: JsonValue };
  node[last] = value;
  return copy;
}

describe('schema estricto', () => {
  it('strict equals open except $id, unevaluatedProperties and the const of jdx and $schema', () => {
    // Los archivos son la salida del generador.
    expect(STRICT).toEqual(generateSchema(MODEL, '1.0', { strict: true }));
    expect(OPEN).toEqual(generateSchema(MODEL, '1.0', { strict: false }));
    const strip = (schema: { [k: string]: unknown; $defs: Defs }) => {
      const copy = structuredClone(schema);
      delete copy.$id;
      for (const def of Object.values(copy.$defs)) delete def.unevaluatedProperties;
      delete copy.$defs.Document?.properties.jdx;
      delete copy.$defs.Document?.properties.$schema;
      return copy;
    };
    expect(strip(STRICT)).toEqual(strip(OPEN));
    expect(STRICT.$id).toBe('https://jdx.jupiter.ar/schema/1.0/jdx.strict.schema.json');
  });

  it('strict compiles with createAjv', () => {
    expect(() => createAjv().compile(STRICT)).not.toThrow();
  });

  it('the example is valid under strict', () => {
    expect(validators.validateDocument('1.0', true, EXAMPLE)).toEqual([]);
  });

  it('strict rejects percnet', () => {
    const doc = withValue(EXAMPLE, '/works/0/shares/0/percnet', 25);
    expect(validators.validateDocument('1.0', false, doc)).toEqual([]);
    expect(validators.validateDocument('1.0', true, doc)).toEqual([
      {
        instanceLocation: '/works/0/shares/0/percnet',
        keywordLocation: '/$defs/Share/unevaluatedProperties',
        keyword: 'unevaluatedProperties',
        params: { unevaluatedProperty: 'percnet' },
      },
    ]);
  });

  it('strict jdx const 1.0', () => {
    expect(STRICT.$defs.Document?.properties.jdx).toEqual({ type: 'string', const: '1.0' });
    expect(validators.validateDocument('1.0', true, withValue(EXAMPLE, '/jdx', '1.3'))).toEqual([
      { instanceLocation: '/jdx', keywordLocation: '/$defs/Document/properties/jdx/const', keyword: 'const', params: { allowedValue: '1.0' } },
    ]);
  });

  it('strict $schema const is the open URL', () => {
    expect(STRICT.$defs.Document?.properties.$schema).toEqual({ type: 'string', const: 'https://jdx.jupiter.ar/schema/1.0/jdx.schema.json' });
    const doc = withValue(EXAMPLE, '/$schema', 'https://jdx.jupiter.ar/schema/1.0/jdx.strict.schema.json');
    expect(validators.validateDocument('1.0', true, doc).map((e) => [e.instanceLocation, e.keyword])).toEqual([['/$schema', 'const']]);
  });

  it('Registration.part outside works rejected by strict', () => {
    const registration = { registry: 'DNDA_AR', kind: 'contract', number: '123', part: 'both' };
    const doc = withValue(EXAMPLE, '/agreements/0/registrations', [registration]);
    expect(validators.validateDocument('1.0', false, doc)).toEqual([]);
    expect(validators.validateDocument('1.0', true, doc)).toEqual([
      {
        instanceLocation: '/agreements/0/registrations/0/part',
        keywordLocation: '/$defs/Registration/unevaluatedProperties',
        keyword: 'unevaluatedProperties',
        params: { unevaluatedProperty: 'part' },
      },
    ]);
    // En works, `part` es de WorkRegistration: el ejemplo lo usa y pasa.
    expect(STRICT.$defs.WorkRegistration?.properties.part).toEqual({ type: 'string', enum: ['music', 'lyrics', 'both'] });
  });

  it('Extensions has no unevaluatedProperties', () => {
    expect(STRICT.$defs.Extensions).toEqual(OPEN.$defs.Extensions);
    expect(STRICT.$defs.Extensions).not.toHaveProperty('unevaluatedProperties');
    expect(STRICT.$defs.ExtensionValue).not.toHaveProperty('unevaluatedProperties');
    const withFlag = Object.entries(STRICT.$defs).filter(([, def]) => def.unevaluatedProperties === false).map(([name]) => name);
    expect(withFlag).toEqual(Object.keys(MODEL.source.types));
    // Dentro de una extensión vale cualquier clave, también en el estricto.
    const doc = withValue(EXAMPLE, '/works/0/extensions', { 'ar.jupiter.x': { cualquierClave: [1, { otra: true }] } });
    expect(validators.validateDocument('1.0', true, doc)).toEqual([]);
  });
});
