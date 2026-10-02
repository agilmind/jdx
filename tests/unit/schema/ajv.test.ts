/**
 * Ajv del repositorio (src/schema/ajv.ts) y validadores de schema
 * (src/schema/validators.ts), con schemas sintéticos: modo estricto, las tres
 * anotaciones de JDX, la de licencia, el mapeo de los errores de Ajv a
 * SchemaError y los topes de una validación con muchos errores.
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { files } from '../../../src/generated/data.js';
import {
  createAjv, cutErrors, MAX_SCHEMA_ERROR_CHARS, MAX_SCHEMA_ERRORS, SCHEMA_ERROR_LIMIT, SchemaErrorLimit, toSchemaErrors,
} from '../../../src/schema/ajv.js';
import { schemaBundle } from '../../../src/schema/bundle.js';
import { compileSchemas } from '../../../src/schema/validators.js';
import type { Catalog, JsonValue, SchemaBundle } from '../../../src/types.js';

/** Los schemas empaquetados: abiertos, estrictos, auxiliares y los de cada regla del catálogo. */
function bundledSchemas(): [string, unknown][] {
  const bundle = schemaBundle(files);
  const catalog = JSON.parse(files['catalog/1.0/rules.json'] as string) as Catalog;
  return [
    ...Object.entries(bundle.open).map(([minor, s]): [string, unknown] => [`open ${minor}`, s]),
    ...Object.entries(bundle.strict).map(([minor, s]): [string, unknown] => [`strict ${minor}`, s]),
    ...Object.entries(bundle.aux).map(([name, s]): [string, unknown] => [name, s]),
    ...catalog.rules.flatMap((r): [string, unknown][] => [
      [`${r.id} profileParamsSchema`, r.profileParamsSchema], [`${r.id} resultParamsSchema`, r.resultParamsSchema], [`${r.id} contextSchema`, r.contextSchema],
    ]),
  ];
}

const DISCARDED = new Set(['anyOf', 'oneOf', 'not', 'if']);
const ITERATES = new Set(['items', 'prefixItems', 'additionalProperties', 'patternProperties', 'unevaluatedProperties', 'unevaluatedItems', 'propertyNames', 'contains', 'dependentSchemas', '$ref', '$dynamicRef']);

/** Lo que recorre datos dentro de una palabra cuyos errores se descartan, y cada contains, en cualquier lugar. */
function iterationProblems(schema: unknown, name: string): string[] {
  const found: string[] = [];
  const walk = (node: unknown, where: string, inside: boolean): void => {
    if (Array.isArray(node)) node.forEach((child, i) => walk(child, `${where}/${i}`, inside));
    else if (typeof node === 'object' && node !== null) {
      for (const [key, child] of Object.entries(node)) {
        if (key === 'contains' || (inside && ITERATES.has(key))) found.push(`${where}/${key}`);
        walk(child, `${where}/${key}`, inside || DISCARDED.has(key));
      }
    }
  };
  walk(schema, name, false);
  return found;
}

/** Valida con un Ajv nuevo y devuelve los errores ya mapeados. */
function errorsOf(schema: object, value: JsonValue) {
  const validate = createAjv().compile(schema);
  validate(value);
  return toSchemaErrors(validate.errors);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createAjv', () => {
  it('x-jdx-ref, x-jdx-ref-type and x-jdx-personal-data compile under strict', () => {
    const schema = {
      type: 'object',
      properties: {
        agreement: { type: 'string', 'x-jdx-ref': 'agreements', 'x-jdx-ref-type': ['publishing', 'writerSplit'] },
        birthDate: { type: 'string', 'x-jdx-personal-data': true },
        scheme: { type: 'string', 'x-jdx-personal-data': { path: 'scheme', in: ['TAX_ID', 'NATIONAL_ID'] } },
      },
    };
    expect(createAjv().compile(schema)({ agreement: 'a1', birthDate: '1990-05-01', scheme: 'TAX_ID' })).toBe(true);
    // Los valores de las anotaciones tienen su meta-schema: una lista raíz que no existe no compila.
    expect(() => createAjv().compile({ type: 'string', 'x-jdx-ref': 'partys' })).toThrow(/x-jdx-ref/);
    expect(() => createAjv().compile({ type: 'string', 'x-jdx-personal-data': false })).toThrow(/x-jdx-personal-data/);
  });

  it('x-jdx-license compiles under strict and its value has a meta-schema', () => {
    const license = { spdx: 'LicenseRef-Agilmind-JDX', url: 'https://github.com/agilmind/jdx/blob/HEAD/LICENSE' };
    expect(createAjv().compile({ type: 'object', 'x-jdx-license': license })({})).toBe(true);
    // Una anotación, no una validación: no cambia lo que el schema acepta.
    expect(createAjv().compile({ type: 'string', 'x-jdx-license': license })(1)).toBe(false);
    for (const wrong of [{ spdx: 'MIT', url: license.url }, { spdx: license.spdx }, { ...license, name: 'JDX' }, 'LicenseRef-Agilmind-JDX']) {
      expect(() => createAjv().compile({ type: 'object', 'x-jdx-license': wrong }), JSON.stringify(wrong)).toThrow(/x-jdx-license/);
    }
  });

  it('an unknown x-jdx keyword fails under strict', () => {
    expect(() => createAjv().compile({ type: 'string', 'x-jdx-other': true })).toThrow(
      'strict mode: unknown keyword: "x-jdx-other"',
    );
  });

  it('an inline subschema without type throws under strictTypes', () => {
    expect(() => createAjv().compile({ type: 'object', properties: { a: { pattern: '^x$' } } })).toThrow(
      'strict mode: missing type "string" for keyword "pattern" at "#/properties/a" (strictTypes)',
    );
  });
});

describe('toSchemaErrors', () => {
  it('unevaluatedProperty is appended to instanceLocation', () => {
    const schema = {
      $defs: { Share: { type: 'object', properties: { percent: { type: 'number' } }, unevaluatedProperties: false } },
      type: 'object',
      properties: { shares: { type: 'array', items: { $ref: '#/$defs/Share' } } },
    };
    expect(errorsOf(schema, { shares: [{ percent: 25 }, { percnet: 25, 'a/b~c': 1 }] })).toEqual([
      {
        instanceLocation: '/shares/1/percnet',
        keywordLocation: '/$defs/Share/unevaluatedProperties',
        keyword: 'unevaluatedProperties',
        params: { unevaluatedProperty: 'percnet' },
      },
      {
        instanceLocation: '/shares/1/a~1b~0c',
        keywordLocation: '/$defs/Share/unevaluatedProperties',
        keyword: 'unevaluatedProperties',
        params: { unevaluatedProperty: 'a/b~c' },
      },
    ]);
  });

  it('additionalProperty is appended to instanceLocation', () => {
    const schema = {
      type: 'object',
      properties: { extensions: { type: 'object', patternProperties: { '^[a-z]+\\.[a-z]+$': { type: 'string' } }, additionalProperties: false } },
    };
    expect(errorsOf(schema, { extensions: { 'ar.x': 'ok', 'Bad Key': 'no' } })).toEqual([
      {
        instanceLocation: '/extensions/Bad Key',
        keywordLocation: '/properties/extensions/additionalProperties',
        keyword: 'additionalProperties',
        params: { additionalProperty: 'Bad Key' },
      },
    ]);
  });

  it('required keeps the parent and puts missingProperty in params', () => {
    const schema = {
      type: 'object',
      properties: { declaration: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    };
    expect(errorsOf(schema, { declaration: {} })).toEqual([
      {
        instanceLocation: '/declaration',
        keywordLocation: '/properties/declaration/required',
        keyword: 'required',
        params: { missingProperty: 'id' },
      },
    ]);
  });

  it('if wrapper errors are dropped', () => {
    const schema = {
      type: 'object',
      properties: { basis: { type: 'string' }, duration: { type: 'string' } },
      if: { type: 'object', properties: { basis: { type: 'string', enum: ['fixed'] } }, required: ['basis'] },
      then: { type: 'object', properties: { duration: true }, required: ['duration'] },
      else: { type: 'object', properties: { duration: { not: {} } } },
    };
    // Ajv da el error del `then` (o del `else`) y además uno `if` ("must match then schema"): queda el primero.
    expect(errorsOf(schema, { basis: 'fixed' })).toEqual([
      { instanceLocation: '', keywordLocation: '/then/required', keyword: 'required', params: { missingProperty: 'duration' } },
    ]);
    expect(errorsOf(schema, { basis: 'protectionPeriod', duration: 'P1Y' })).toEqual([
      { instanceLocation: '/duration', keywordLocation: '/else/properties/duration/not', keyword: 'not', params: {} },
    ]);
  });

  const workRef = {
    type: 'object',
    properties: { work: { type: 'string' }, external: { type: 'object' } },
    oneOf: [
      { type: 'object', properties: { work: true }, required: ['work'] },
      { type: 'object', properties: { external: true }, required: ['external'] },
    ],
  };

  it('oneOf with neither branch yields one error and no branch errors', () => {
    // Ajv da un `required` por rama y después el `oneOf`: queda solo el del combinador.
    expect(errorsOf(workRef, {})).toEqual([
      { instanceLocation: '', keywordLocation: '/oneOf', keyword: 'oneOf', params: { passingSchemas: null } },
    ]);
  });

  it('oneOf with both branches yields one error', () => {
    expect(errorsOf(workRef, { work: 'w1', external: {} })).toEqual([
      { instanceLocation: '', keywordLocation: '/oneOf', keyword: 'oneOf', params: { passingSchemas: [0, 1] } },
    ]);
  });

  it('anyOf keeps one error', () => {
    const name = {
      type: 'object',
      properties: { full: { type: 'string' }, family: { type: 'string' }, given: { type: 'string', minLength: 1 } },
      anyOf: [
        { type: 'object', properties: { full: true }, required: ['full'] },
        { type: 'object', properties: { family: true }, required: ['family'] },
      ],
    };
    // Los errores fuera de las ramas siguen: el de `given` no es de una rama del anyOf. El orden es el
    // de Ajv, que evalúa los combinadores antes que `properties`.
    expect(errorsOf({ type: 'array', items: name }, [{ given: '' }])).toEqual([
      { instanceLocation: '/0', keywordLocation: '/items/anyOf', keyword: 'anyOf', params: {} },
      { instanceLocation: '/0/given', keywordLocation: '/items/properties/given/minLength', keyword: 'minLength', params: { limit: 1 } },
    ]);
  });
});

describe('compileSchemas', () => {
  function bundleOf(): SchemaBundle {
    return {
      minors: ['1.0'],
      open: { '1.0': { $id: 'https://example.com/open.json', type: 'object', properties: { jdx: { type: 'string' } } } },
      strict: {
        '1.0': { $id: 'https://example.com/strict.json', type: 'object', properties: { jdx: { type: 'string' } }, unevaluatedProperties: false },
      },
      index: {},
      aux: { accounts: { $id: 'https://example.com/accounts.json', type: 'object', properties: { accounts: { type: 'array' } }, required: ['accounts'] } },
    };
  }

  it('validateAux of a schema missing from the bundle throws', () => {
    const validators = compileSchemas(bundleOf());
    expect(validators.validateAux('accounts', { accounts: [] })).toEqual([]);
    expect(() => validators.validateAux('report', {})).toThrow('el bundle no trae el schema auxiliar report');
  });

  it('validateWith caches by schema identity', () => {
    const compile = vi.spyOn(Ajv2020.prototype, 'compile');
    const validators = compileSchemas(bundleOf());
    const params = { type: 'object', properties: { cap: { type: 'number' } }, required: ['cap'] };
    const copy = structuredClone(params);
    expect(validators.validateWith(params, { cap: 25 })).toEqual([]);
    expect(validators.validateWith(params, {})).toEqual([
      { instanceLocation: '', keywordLocation: '/required', keyword: 'required', params: { missingProperty: 'cap' } },
    ]);
    expect(validators.validateWith(copy, { cap: '25' })).toEqual([
      { instanceLocation: '/cap', keywordLocation: '/properties/cap/type', keyword: 'type', params: { type: 'number' } },
    ]);
    expect(compile.mock.calls.filter(([schema]) => schema === params)).toHaveLength(1);
    expect(compile.mock.calls.filter(([schema]) => schema === copy)).toHaveLength(1);
  });

  it('validateWith compiles a schema whose $id is already compiled', () => {
    // El Ajv no registra los schemas por $id: una copia de un schema del bundle (otro objeto, el mismo $id)
    // compila aparte, en cualquier orden, y dos schemas distintos con el mismo $id también.
    const missing = (prop: string) => [
      { instanceLocation: '', keywordLocation: '/required', keyword: 'required', params: { missingProperty: prop } },
    ];
    const bundle = bundleOf();
    const copy = structuredClone(bundle.aux.accounts) as object;
    const auxFirst = compileSchemas(bundle);
    expect(auxFirst.validateAux('accounts', {})).toEqual(missing('accounts'));
    expect(auxFirst.validateWith(copy, {})).toEqual(missing('accounts'));
    const copyFirst = compileSchemas(bundleOf());
    expect(copyFirst.validateWith(structuredClone(copy), {})).toEqual(missing('accounts'));
    expect(copyFirst.validateAux('accounts', {})).toEqual(missing('accounts'));
    const sameId = (prop: string) => ({ $id: 'https://example.com/params.json', type: 'object', properties: { [prop]: true }, required: [prop] });
    expect(auxFirst.validateWith(sameId('cap'), {})).toEqual(missing('cap'));
    expect(auxFirst.validateWith(sameId('right'), {})).toEqual(missing('right'));
  });

  it('firstAuxError stops at the first error, with its own compilation', () => {
    const compile = vi.spyOn(Ajv2020.prototype, 'compile');
    const bundle = bundleOf();
    const validators = compileSchemas(bundle);
    const items = { $id: 'https://example.com/items.json', type: 'object', properties: { items: { type: 'array', items: { type: 'integer' } } } };
    const withItems: SchemaBundle = { ...bundle, aux: { ...bundle.aux, accounts: items } };
    const itemsValidators = compileSchemas(withItems);
    const value = { items: Array.from({ length: 1000 }, (_, i) => `x${i}`) };
    expect(itemsValidators.validateAux('accounts', value)).toHaveLength(MAX_SCHEMA_ERRORS);
    expect(itemsValidators.firstAuxError('accounts', value)).toEqual({
      instanceLocation: '/items/0', keywordLocation: '/properties/items/items/type', keyword: 'type', params: { type: 'integer' },
    });
    expect(itemsValidators.firstAuxError('accounts', { items: [1, 2] })).toBeNull();
    // Cada instancia compila el schema una vez, y la que se detiene en el primer error se arma recién al usarse.
    expect(compile.mock.calls.filter(([schema]) => schema === items)).toHaveLength(2);
    itemsValidators.firstAuxError('accounts', value);
    expect(compile.mock.calls.filter(([schema]) => schema === items)).toHaveLength(2);
    expect(() => validators.firstAuxError('report', {})).toThrow('el bundle no trae el schema auxiliar report');
  });

  it('compileSchemas compiles each schema once and lazily', () => {
    const compile = vi.spyOn(Ajv2020.prototype, 'compile');
    const bundle = bundleOf();
    const validators = compileSchemas(bundle);
    const calls = (schema: object | undefined) => compile.mock.calls.filter(([s]) => s === schema).length;
    expect([calls(bundle.open['1.0']), calls(bundle.strict['1.0']), calls(bundle.aux.accounts)]).toEqual([0, 0, 0]);

    expect(validators.validateDocument('1.0', false, { jdx: '1.0', percnet: 1 })).toEqual([]);
    expect(validators.validateDocument('1.0', false, { jdx: 1 })).toHaveLength(1);
    expect(validators.validateDocument('1.0', true, { jdx: '1.0', percnet: 1 })).toEqual([
      { instanceLocation: '/percnet', keywordLocation: '/unevaluatedProperties', keyword: 'unevaluatedProperties', params: { unevaluatedProperty: 'percnet' } },
    ]);
    validators.validateAux('accounts', {});
    validators.validateAux('accounts', { accounts: [] });
    expect([calls(bundle.open['1.0']), calls(bundle.strict['1.0']), calls(bundle.aux.accounts)]).toEqual([1, 1, 1]);
    expect(() => validators.validateDocument('1.1', false, {})).toThrow('el bundle no trae el schema abierto de la menor 1.1');
  });
});

describe('limits', () => {
  /** Un schema cuyos elementos se validan con su propia función: Ajv junta los errores de cada llamada copiando la lista. */
  const items = {
    $id: 'https://example.com/items.json', type: 'object',
    properties: { items: { type: 'array', items: { $ref: '#/$defs/Item' } } },
    $defs: { Item: { type: 'object', properties: { a: { $ref: '#/$defs/Leaf' } } }, Leaf: { type: 'integer' } },
  };

  it('a value with more errors than SCHEMA_ERROR_LIMIT in one place stops early and gives the first MAX_SCHEMA_ERRORS', () => {
    expect([SCHEMA_ERROR_LIMIT, MAX_SCHEMA_ERRORS, MAX_SCHEMA_ERROR_CHARS]).toEqual([1000, 100, 1_000_000]);
    const validators = compileSchemas({ minors: [], open: {}, strict: {}, index: {}, aux: { accounts: items } });
    // Sin el corte, 200 000 elementos con error tardaban minutos: cada llamada copia todos los errores anteriores.
    const value = { items: Array<number>(200_000).fill(0) };
    const started = performance.now();
    const errors = validators.validateAux('accounts', value);
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(errors).toHaveLength(MAX_SCHEMA_ERRORS);
    expect(errors[0]).toEqual({ instanceLocation: '/items/0', keywordLocation: '/$defs/Item/type', keyword: 'type', params: { type: 'object' } });
    expect(errors.map((e) => e.instanceLocation)).toEqual(Array.from({ length: MAX_SCHEMA_ERRORS }, (_, i) => `/items/${i}`));
    // Debajo del corte, la lista es la de Ajv, cortada en MAX_SCHEMA_ERRORS.
    expect(validators.validateAux('accounts', { items: [0, { a: 'x' }, 1] })).toEqual([
      { instanceLocation: '/items/0', keywordLocation: '/$defs/Item/type', keyword: 'type', params: { type: 'object' } },
      { instanceLocation: '/items/1/a', keywordLocation: '/$defs/Leaf/type', keyword: 'type', params: { type: 'integer' } },
      { instanceLocation: '/items/2', keywordLocation: '/$defs/Item/type', keyword: 'type', params: { type: 'object' } },
    ]);
    expect(validators.firstAuxError('accounts', value)?.instanceLocation).toBe('/items/0');
  });

  it('errors that a combinator discards do not cut a valid value', () => {
    // La primera rama del anyOf da un error por elemento, más que el corte, y se descarta: el valor cumple.
    const validators = compileSchemas({ minors: [], open: {}, strict: {}, index: {}, aux: {} });
    const schema = { type: 'array', anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'array', items: { type: 'integer' } }] };
    expect(validators.validateWith(schema, Array<number>(5000).fill(1))).toEqual([]);
    expect(validators.validateWith(schema, Array<boolean>(5000).fill(true)).length).toBeGreaterThan(0);
  });

  it('every bundled schema keeps data iteration out of anyOf, oneOf, not and if, and uses no contains', () => {
    // Así, cuando una validación se corta, los errores que da no son de una rama que se iba a descartar.
    // contains junta un error por elemento que no cumple, aunque el valor sea válido: no se usa en ningún lado.
    expect(iterationProblems({ type: 'array', contains: { type: 'string' } }, 'x')).toEqual(['x/contains']);
    expect(iterationProblems({ type: 'array', anyOf: [{ type: 'array', items: { type: 'string' } }] }, 'x')).toEqual(['x/anyOf/0/items']);
    expect(iterationProblems({ type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'integer' }] } }, 'x')).toEqual([]);
    const schemas = bundledSchemas();
    expect(schemas.length).toBeGreaterThan(200);
    expect(schemas.flatMap(([name, schema]) => iterationProblems(schema, name))).toEqual([]);
  });

  it('a cut throws a SchemaErrorLimit with the errors gathered, also from inline items and without all errors', () => {
    const thrownBy = (run: () => unknown): unknown => {
      try {
        run();
      } catch (thrown) {
        return thrown;
      }
      return undefined;
    };
    // Elementos validados en la misma función (errors++) y con su propia función (la concatenación).
    const inline = createAjv().compile({ type: 'array', items: { type: 'integer' } });
    const called = createAjv().compile(items);
    for (const thrown of [thrownBy(() => inline(Array<string>(200_000).fill('x'))), thrownBy(() => called({ items: Array<number>(200_000).fill(0) }))]) {
      expect(thrown).toBeInstanceOf(SchemaErrorLimit);
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as SchemaErrorLimit).errors).toHaveLength(SCHEMA_ERROR_LIMIT + 1);
      expect(cutErrors(thrown)).toBe((thrown as SchemaErrorLimit).errors);
    }
    // contains junta errores también en el validador que se detiene en el primero.
    const first = createAjv({ allErrors: false }).compile({ type: 'array', contains: { type: 'string' } });
    expect(thrownBy(() => first(Array<number>(5000).fill(1)))).toBeInstanceOf(SchemaErrorLimit);
    expect(cutErrors({ jdxSchemaErrorLimit: [] })).toBeUndefined();
  });

  it('a cut in the validator that stops at the first error counts as not valid', () => {
    const contains = { $id: 'https://example.com/contains.json', type: 'array', contains: { type: 'string' } };
    const validators = compileSchemas({ minors: [], open: {}, strict: {}, index: {}, aux: { accounts: contains } });
    const value = Array<number>(5000).fill(1);
    const errors = validators.validateAux('accounts', value);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.length).toBeLessThanOrEqual(MAX_SCHEMA_ERRORS);
    expect(validators.firstAuxError('accounts', value)).not.toBeNull();
    expect(validators.validateWith(contains, value).length).toBeGreaterThan(0);
    expect([validators.validateAux('accounts', [1, 'x']), validators.firstAuxError('accounts', [1, 'x'])]).toEqual([[], null]);
  });

  it('the error limit check follows every statement that adds errors in the bundled schemas', () => {
    // Ajv 8 suma errores con dos sentencias: errors++ (uno propio) y errors = vErrors.length (los de una función que
    // llamó). Las demás escrituras de errors lo inician o lo restauran. Si Ajv escribiera de otra forma, el corte no
    // se agregaría: el test lo diría.
    const ajv = createAjv();
    const process = ajv.opts.code.process as (code: string) => string;
    const counts = { increment: 0, concat: 0, restore: 0, start: 0, checks: 0 };
    const other: string[] = [];
    ajv.opts.code.process = (code: string) => {
      for (const [write] of code.matchAll(/(?<![.\w$])errors\s*(?:\+\+|--|[-+*/]?=(?!=))[^;]*;/g)) {
        if (write === 'errors++;') counts.increment++;
        else if (write === 'errors = vErrors.length;') counts.concat++;
        else if (/^errors = _errs\d+;$/.test(write)) counts.restore++;
        else if (write === 'errors = 0;') counts.start++;
        else other.push(write);
      }
      const out = process(code);
      counts.checks += out.split(`if (errors > ${SCHEMA_ERROR_LIMIT}) throw `).length - 1;
      return out;
    };
    for (const [, schema] of bundledSchemas()) ajv.compile(schema as object);
    expect(other).toEqual([]);
    expect(counts.increment).toBeGreaterThan(1000);
    expect(counts.concat).toBeGreaterThan(100);
    expect(counts.checks).toBe(counts.increment + counts.concat);
  });

  it('the error list stops at MAX_SCHEMA_ERROR_CHARS of instance locations and texts', () => {
    // Cada error lleva la clave dos veces: en su lugar y en params.additionalProperty.
    const key = (i: number) => `${'k'.repeat(300_000)}${i}`;
    const value = Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [key(i), 1]));
    const errors = errorsOf({ type: 'object', additionalProperties: false }, value);
    expect(errors.map((e) => [e.instanceLocation.slice(-2), e.instanceLocation.length, String(e.params.additionalProperty).length])).toEqual([
      ['k0', 300_002, 300_001],
      ['k1', 300_002, 300_001],
    ]);
  });
});
