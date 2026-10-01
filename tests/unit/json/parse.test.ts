/**
 * Parser I-JSON (src/json/parse.ts): bytes → valor, texto de cada número por
 * puntero y todas las fallas de JDX-JSN-001 (RFC 7493). Iterativo, sin
 * recursión, con profundidad máxima 64; sin valor parcial cuando algo falla.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_DEPTH, MAX_FAILURE_POINTER_CHARS, MAX_FAILURES, parseJson } from '../../../src/json/parse.js';
import type { JsonFailure, JsonValue, ParsedJson } from '../../../src/types.js';

const EXAMPLE = fileURLToPath(
  new URL('../../../docs/ejemplo/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json', import.meta.url),
);

/** Texto → bytes UTF-8; los arreglos de números van como bytes crudos. */
function bytes(...parts: (string | number[])[]): Uint8Array {
  const chunks = parts.map((p) => (typeof p === 'string' ? new TextEncoder().encode(p) : Uint8Array.from(p)));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function ok(input: string | Uint8Array): ParsedJson {
  const r = parseJson(typeof input === 'string' ? bytes(input) : input);
  if (!r.ok) throw new Error(`se esperaba un JSON válido: ${JSON.stringify(r.failures)}`);
  return r.json;
}

function failures(input: string | Uint8Array): JsonFailure[] {
  const r = parseJson(typeof input === 'string' ? bytes(input) : input);
  if (r.ok) throw new Error('se esperaba una falla');
  expect(r).not.toHaveProperty('json');
  return r.failures;
}

/** Punteros de todos los números de un valor (recursivo: solo para valores chicos de test). */
function numberPointers(value: JsonValue, pointer = ''): string[] {
  if (typeof value === 'number') return [pointer];
  if (value === null || typeof value !== 'object') return [];
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  return entries.flatMap(([k, v]) => numberPointers(v, `${pointer}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`));
}

describe('parseJson', () => {
  it('parses the example like JSON.parse', () => {
    const raw = readFileSync(EXAMPLE);
    const expected = JSON.parse(raw.toString('utf8')) as JsonValue;
    const json = ok(new Uint8Array(raw));
    expect(json.value).toEqual(expected);
    expect([...json.numberTexts.keys()].sort()).toEqual(numberPointers(expected).sort());
    expect(json.numberTexts.get('/declaration/revision')).toBe('1');
    expect(json.numberTexts.get('/works/0/shares/0/percent')).toBe('25');
    expect(json.numberTexts.get('/media/1/size')).toBe('5234011');
  });

  it('keeps number texts by pointer (25, 12.5, 33.3333, -0, 1E2)', () => {
    const json = ok('{"a":25,"b":[12.5,33.3333],"c":{"d":-0,"e":1E2},"f":"7"}');
    expect(Object.fromEntries(json.numberTexts)).toEqual({
      '/a': '25', '/b/0': '12.5', '/b/1': '33.3333', '/c/d': '-0', '/c/e': '1E2',
    });
    expect(json.value).toEqual({ a: 25, b: [12.5, 33.3333], c: { d: -0, e: 100 }, f: '7' });
    expect(Object.is((json.value as { c: { d: number } }).c.d, -0)).toBe(true);
    expect(Object.fromEntries(ok(' 42 ').numberTexts)).toEqual({ '': '42' });
    // Se comporta como un Map de solo lectura: en el orden del texto, con get y has sobre punteros canónicos.
    expect([...json.numberTexts.keys()]).toEqual(['/a', '/b/0', '/b/1', '/c/d', '/c/e']);
    expect([...json.numberTexts.values()]).toEqual(['25', '12.5', '33.3333', '-0', '1E2']);
    const seen: string[] = [];
    json.numberTexts.forEach((text, pointer) => seen.push(`${pointer}=${text}`));
    expect(seen).toEqual(['/a=25', '/b/0=12.5', '/b/1=33.3333', '/c/d=-0', '/c/e=1E2']);
    expect(json.numberTexts.size).toBe(5);
    expect(json.numberTexts.get('/b/1')).toBe('33.3333');
    for (const missing of ['', 'a', '/b', '/b/01', '/b/-', '/b/2', '/f', '/c/d/0', '/c/~2', '/constructor']) {
      expect(json.numberTexts.get(missing), missing).toBeUndefined();
      expect(json.numberTexts.has(missing), missing).toBe(false);
    }
  });

  it('rejects BOM', () => {
    expect(failures(bytes([0xef, 0xbb, 0xbf], '{"a":1}'))).toEqual([{ reason: 'bom', pointer: '', offset: 0 }]);
  });

  it('rejects invalid UTF-8', () => {
    // 0xff nunca es UTF-8; 0xc3 sin continuación; 0xc0 0xaf es una forma larga de "/".
    expect(failures(bytes('{"a":"x', [0xff], '","b":["', [0xc3], '"],"c":"', [0xc0, 0xaf], '"}'))).toEqual([
      { reason: 'utf8', pointer: '/a', offset: 7 },
      { reason: 'utf8', pointer: '/b/0', offset: 16 },
      { reason: 'utf8', pointer: '/c', offset: 25 },
    ]);
    // En una clave, la falla apunta al objeto que la contiene; fuera de un string, corta.
    expect(failures(bytes('{"o":{"', [0xe2, 0x82], '":1}}'))).toEqual([{ reason: 'utf8', pointer: '/o', offset: 7 }]);
    expect(failures(bytes('[1,', [0xff], ']'))).toEqual([{ reason: 'utf8', pointer: '/1', offset: 3 }]);
  });

  it('rejects CESU-8 encoded surrogates as utf8', () => {
    // U+1F600 en CESU-8: dos surrogates de 3 bytes cada uno (ED A0 BD, ED B8 80). Una falla por string.
    expect(failures(bytes('{"a":"', [0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80], '"}'))).toEqual([
      { reason: 'utf8', pointer: '/a', offset: 6 },
    ]);
    expect(ok(bytes('{"a":"', [0xf0, 0x9f, 0x98, 0x80], '"}')).value).toEqual({ a: '\u{1F600}' });
  });

  it('reports every duplicate key with its pointer', () => {
    expect(failures('{"a":1,"b":{"c":1,"c":2},"a":3,"a":4}')).toEqual([
      { reason: 'duplicateKey', pointer: '/b/c', offset: 18 },
      { reason: 'duplicateKey', pointer: '/a', offset: 25 },
      { reason: 'duplicateKey', pointer: '/a', offset: 31 },
    ]);
    // La misma clave en objetos distintos no es duplicada.
    expect(ok('[{"a":1},{"a":2}]').value).toEqual([{ a: 1 }, { a: 2 }]);
    // En el orden del texto: la clave repetida antes que el surrogate suelto de adentro de la clave.
    expect(failures('{"\\ud800":1,"\\ud800":2}')).toEqual([
      { reason: 'loneSurrogate', pointer: '', offset: 2 },
      { reason: 'duplicateKey', pointer: '/\ud800', offset: 12 },
      { reason: 'loneSurrogate', pointer: '', offset: 13 },
    ]);
    // Una clave con UTF-8 inválido no se compara: no se sabe qué clave es (decodificada, sería U+FFFD).
    expect(failures(bytes('{"a', [0xff], '":1,"a', [0xff], '":2}'))).toEqual([
      { reason: 'utf8', pointer: '', offset: 3 },
      { reason: 'utf8', pointer: '', offset: 10 },
    ]);
    expect(failures(bytes('{"', [0xff], '":1,"', [0xfe], '":2,"\uFFFD":3}'))).toEqual([
      { reason: 'utf8', pointer: '', offset: 2 },
      { reason: 'utf8', pointer: '', offset: 8 },
    ]);
  });

  it('duplicate detection compares unescaped keys', () => {
    expect(failures('{"a":1,"\\u0061":2}')).toEqual([{ reason: 'duplicateKey', pointer: '/a', offset: 7 }]);
    expect(failures('{"é":1,"\\u00e9":2}')).toEqual([{ reason: 'duplicateKey', pointer: '/é', offset: 8 }]);
  });

  it('rejects escaped lone high surrogate', () => {
    expect(failures('{"a":"x\\ud83d","b":"\\ud83dx"}')).toEqual([
      { reason: 'loneSurrogate', pointer: '/a', offset: 7 },
      { reason: 'loneSurrogate', pointer: '/b', offset: 20 },
    ]);
  });

  it('rejects escaped lone low surrogate', () => {
    expect(failures('["\\ude00", "\\ude00\\ud83d"]')).toEqual([
      { reason: 'loneSurrogate', pointer: '/0', offset: 2 },
      { reason: 'loneSurrogate', pointer: '/1', offset: 12 },
    ]);
  });

  it('accepts escaped surrogate pair', () => {
    expect(ok('{"a":"\\ud83d\\ude00","b":"\\uD83D\\uDE00"}').value).toEqual({ a: '\u{1F600}', b: '\u{1F600}' });
  });

  it('accepts noncharacters, escaped and raw (U+FDD0, U+FFFF, U+10FFFF)', () => {
    // JDX-JSN-001 nombra los surrogates sueltos; los no-caracteres (RFC 7493 §2.1) pasan.
    const expected = ['\uFDD0', '\uFFFF', '\u{10FFFF}'];
    expect(ok('["\\uFDD0","\\uFFFF","\\uDBFF\\uDFFF"]').value).toEqual(expected);
    expect(ok(bytes('["', [0xef, 0xb7, 0x90], '","', [0xef, 0xbf, 0xbf], '","', [0xf4, 0x8f, 0xbf, 0xbf], '"]')).value).toEqual(expected);
    expect(ok('{"\\uFFFE":1}').value).toEqual({ '\uFFFE': 1 });
  });

  it('rejects integer literal 9007199254740992', () => {
    expect(failures('{"a":9007199254740992,"b":-9007199254740993}')).toEqual([
      { reason: 'integerRange', pointer: '/a', offset: 5 },
      { reason: 'integerRange', pointer: '/b', offset: 26 },
    ]);
    // 17 dígitos y un millón de dígitos: integerRange en el primer byte, sin lanzar.
    expect(failures('[10000000000000000]')).toEqual([{ reason: 'integerRange', pointer: '/0', offset: 1 }]);
    expect(failures(`[${'1'.repeat(1_000_000)}]`)).toEqual([{ reason: 'integerRange', pointer: '/0', offset: 1 }]);
  });

  it('accepts ±9007199254740991', () => {
    const json = ok('[9007199254740991,-9007199254740991,9007199254740991.0,-9.007199254740991e15]');
    expect(json.value).toEqual([9007199254740991, -9007199254740991, 9007199254740991, -9007199254740991]);
    // Más allá falla en cualquier notación: todo double de esa magnitud es entero.
    expect(failures('[9007199254740992.5,9007199254740993.0,1e20,-1e300]')).toEqual([
      { reason: 'integerRange', pointer: '/0', offset: 1 },
      { reason: 'integerRange', pointer: '/1', offset: 20 },
      { reason: 'integerRange', pointer: '/2', offset: 39 },
      { reason: 'integerRange', pointer: '/3', offset: 44 },
    ]);
  });

  it('rejects 1e400 as numberRange', () => {
    expect(failures('[1e400,-1.8e308]')).toEqual([
      { reason: 'numberRange', pointer: '/0', offset: 1 },
      { reason: 'numberRange', pointer: '/1', offset: 7 },
    ]);
  });

  it('rejects non-zero literal that underflows to 0', () => {
    expect(failures('[1e-400,0.00e-999,2e-324,5e-324]')).toEqual([
      { reason: 'numberRange', pointer: '/0', offset: 1 },
      { reason: 'numberRange', pointer: '/2', offset: 18 },
    ]);
    // 0.00e-999 es un cero escrito; 5e-324 es el menor double positivo.
    expect(ok('[0.00e-999,5e-324]').value).toEqual([0, 5e-324]);
  });

  it('rejects literals with more precision than a double as numberRange', () => {
    // RFC 7493 §2.2: con punto o exponente, el texto tiene que valer lo mismo que el decimal
    // más corto de su double. 9007199254740991.4 da 2^53 − 1, pero no lo es.
    expect(failures('[3.141592653589793238462643383279,1.0000000000000001,9007199254740991.4,-0.30000000000000001]')).toEqual([
      { reason: 'numberRange', pointer: '/0', offset: 1 },
      { reason: 'numberRange', pointer: '/1', offset: 34 },
      { reason: 'numberRange', pointer: '/2', offset: 53 },
      { reason: 'numberRange', pointer: '/3', offset: 72 },
    ]);
    // Ceros de más y exponentes no agregan precisión: pasan.
    expect(ok('[0.1,12.50,1E2,33.3333,0.30000000000000004,1.0e-7,-2.5E-3,9007199254740991.0,-0.000]').value).toEqual([
      0.1, 12.5, 100, 33.3333, 0.30000000000000004, 1e-7, -0.0025, 9007199254740991, -0,
    ]);
  });

  it('rejects leading zeros, trailing commas, comments, NaN, single quotes', () => {
    // El puntero es el del valor que se rompe o, si el valor ya terminó, el de su contenedor:
    // en {"a":01} el 0 es un número entero y lo que sobra es el 1, dentro del objeto.
    for (const [text, pointer, offset] of [
      ['{"a":01}', '', 6], ['[-01]', '', 3], ['[1,]', '/1', 3], ['{"a":1,}', '', 7], ['[1] // x', '', 4],
      ['/* x */ [1]', '', 0], ['[NaN]', '/0', 1], ['[Infinity]', '/0', 1], ["{'a':1}", '', 1], ['["a\\x"]', '/0', 3],
      ['[.5]', '/0', 1], ['[1.]', '/0', 3], ['[1e]', '/0', 3], ['[+1]', '/0', 1], ['{"a" 1}', '/a', 5],
      ['[1 2]', '', 3], ['[tru]', '/0', 1],
    ] as const) {
      expect(failures(text), text).toEqual([{ reason: 'syntax', pointer, offset }]);
    }
  });

  it('rejects raw control characters in strings', () => {
    expect(failures('{"a":"x\ty"}')).toEqual([{ reason: 'syntax', pointer: '/a', offset: 7 }]);
    expect(failures(bytes('["', [0x00], '"]'))).toEqual([{ reason: 'syntax', pointer: '/0', offset: 2 }]);
    expect(ok('{"a":"x\\ty\\u0000\\/"}').value).toEqual({ a: 'x\ty\u0000/' });
  });

  it('rejects trailing data', () => {
    expect(failures('{"a":1} {"b":2}')).toEqual([{ reason: 'syntax', pointer: '', offset: 8 }]);
    expect(failures('[1]]')).toEqual([{ reason: 'syntax', pointer: '', offset: 3 }]);
    expect(ok('{"a":1} \r\n\t').value).toEqual({ a: 1 });
  });

  it('empty input fails with reason empty', () => {
    expect(failures(new Uint8Array())).toEqual([{ reason: 'empty', pointer: '', offset: 0 }]);
    expect(failures(' \n\t\r ')).toEqual([{ reason: 'empty', pointer: '', offset: 5 }]);
    expect(failures(bytes([0xef, 0xbb, 0xbf]))).toEqual([
      { reason: 'bom', pointer: '', offset: 0 },
      { reason: 'empty', pointer: '', offset: 3 },
    ]);
  });

  it('64 levels parse; 65 fail with reason depth at the first deeper pointer', () => {
    expect(MAX_DEPTH).toBe(64);
    const arrays = (n: number) => '['.repeat(n) + ']'.repeat(n);
    const objects = (n: number) => '{"a":'.repeat(n - 1) + '{}' + '}'.repeat(n - 1);
    expect(ok(arrays(64)).value).toBeInstanceOf(Array);
    expect(ok(objects(64)).value).toBeInstanceOf(Object);
    // Como System.Text.Json (MaxDepth 64): falla el contenedor 65, en el byte donde abre.
    expect(failures(arrays(65))).toEqual([{ reason: 'depth', pointer: '/0'.repeat(64), offset: 64 }]);
    expect(failures(objects(65))).toEqual([{ reason: 'depth', pointer: '/a'.repeat(64), offset: 320 }]);
    // Los escalares no suman niveles.
    expect(ok(`${'['.repeat(64)}1${']'.repeat(64)}`).numberTexts.get('/0'.repeat(64))).toBe('1');
  });

  it('one million nested arrays fail with depth and do not throw', () => {
    const deep = bytes('['.repeat(1_000_000) + ']'.repeat(1_000_000));
    expect(failures(deep)).toEqual([{ reason: 'depth', pointer: '/0'.repeat(64), offset: 64 }]);
    const inExtensions = bytes(`{"works":[{"extensions":{"ar.x":${'['.repeat(1_000_000)}`);
    expect(failures(inExtensions)).toEqual([
      { reason: 'depth', pointer: `/works/0/extensions/ar.x${'/0'.repeat(60)}`, offset: 92 },
    ]);
  });

  it('stops reading at the 100th failure (MAX_FAILURES), also with long pointers', () => {
    expect(MAX_FAILURES).toBe(100);
    // 63 niveles de claves de 150 caracteres y 100 000 claves repetidas adentro: sin tope serían
    // 99 999 fallas con punteros de 9,5 KB, casi 1 GB de texto. Las 100 suman 951 500
    // caracteres de punteros, debajo de MAX_FAILURE_POINTER_CHARS.
    const k = 'k'.repeat(150);
    const text = `{"${k}":`.repeat(63) + `{${Array(100_000).fill('"a":1').join(',')}}` + '}'.repeat(63);
    const started = performance.now();
    const found = failures(text);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(found).toHaveLength(100);
    expect(new Set(found.map((f) => `${f.reason} ${f.pointer}`))).toEqual(new Set([`duplicateKey ${`/${k}`.repeat(63)}/a`]));
    expect(found[99]?.offset).toBe(63 * 154 + 1 + 6 * 100);
    // La falla que corta la lectura también cuenta.
    expect(failures(`[${Array(99).fill('1e400').join(',')},]`).map((f) => f.reason)).toEqual([...Array(99).fill('numberRange'), 'syntax']);
    expect(failures(`[${Array(150).fill('1e400').join(',')},]`).map((f) => f.reason)).toEqual(Array(100).fill('numberRange'));
  });

  it('stops reading when failure pointers add up to MAX_FAILURE_POINTER_CHARS', () => {
    expect(MAX_FAILURE_POINTER_CHARS).toBe(1_000_000);
    // Una clave larga con 150 claves repetidas adentro: cada falla lleva la clave entera. Sin este
    // tope, una clave de 6 MB daba 100 fallas de 6 MB y JSON.stringify(failures) lanzaba
    // "Invalid string length". La falla que llega al tope también cuenta. Una clave de "/"
    // da un puntero del doble de largo ("~1" por cada "/").
    for (const [key, count] of [
      ['k'.repeat(6_000_000), 1], ['k'.repeat(300_000), 4], ['/'.repeat(300_000), 2], ['k'.repeat(9_000), 100],
    ] as const) {
      const pointer = `/${key.replaceAll('~', '~0').replaceAll('/', '~1')}/a`;
      const text = `{"${key}":{${Array(150).fill('"a":1').join(',')}}}`;
      const started = performance.now();
      const found = failures(text);
      expect(performance.now() - started).toBeLessThan(1000);
      expect(found.map((f) => `${f.reason} ${f.offset} ${f.pointer.length}`)).toEqual(
        Array.from({ length: count }, (_, j) => `duplicateKey ${key.length + 11 + 6 * j} ${pointer.length}`),
      );
      expect(found.every((f) => f.pointer === pointer)).toBe(true);
      // Sin la última, los punteros suman menos que el tope; la última no pasa del doble de la entrada.
      expect(found.slice(0, -1).reduce((n, f) => n + f.pointer.length, 0)).toBeLessThan(MAX_FAILURE_POINTER_CHARS);
      expect(pointer.length).toBeLessThanOrEqual(2 * text.length);
      // 64 por falla: lo que JSON.stringify agrega al puntero.
      expect(JSON.stringify(found).length).toBeLessThan(MAX_FAILURE_POINTER_CHARS + 2 * text.length + 64 * count);
    }
  });

  it('__proto__ and constructor keys are own properties and prototypes stay untouched', () => {
    const json = ok('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"a":[{"__proto__":1}]}');
    const value = json.value as Record<string, JsonValue>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.keys(value)).toEqual(['__proto__', 'constructor', 'a']);
    expect(Object.hasOwn(value, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(value, '__proto__')?.value).toEqual({ polluted: true });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect((Object.prototype as unknown as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(value).toEqual(JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"a":[{"__proto__":1}]}'));
    expect(failures('{"__proto__":1,"__proto__":2}')).toEqual([{ reason: 'duplicateKey', pointer: '/__proto__', offset: 15 }]);
  });

  it('pointers escape ~ and /', () => {
    const json = ok('{"a/b":{"c~d":1,"~1":[2]}}');
    expect(Object.fromEntries(json.numberTexts)).toEqual({ '/a~1b/c~0d': '1', '/a~1b/~01/0': '2' });
    expect(failures('{"x/y":{"~":1,"~":2}}')).toEqual([{ reason: 'duplicateKey', pointer: '/x~1y/~0', offset: 14 }]);
    expect(json.numberTexts.get('/a~1b/~01/0')).toBe('2');
    expect(json.numberTexts.get('/a/b/c~d')).toBeUndefined();
  });

  it('long member names keep number pointers linear', () => {
    // V8 hashea por el largo los strings de más de 16 383 caracteres: con un Map de un puntero
    // por número, 17 000 × 5000 tardaba 17 s y 100 000 × 10 000, 450 s y 1,1 GB.
    for (const [keys, count] of [
      [['k'.repeat(17_000)], 5_000], [['k'.repeat(100_000)], 10_000], [Array<string>(63).fill('k'.repeat(300)), 5_000],
    ] as const) {
      const text = keys.map((key) => `{"${key}":`).join('') + `[${Array(count).fill('0').join(',')}]` + '}'.repeat(keys.length);
      const prefix = keys.map((key) => `/${key}`).join('');
      const started = performance.now();
      const json = ok(text);
      expect(performance.now() - started).toBeLessThan(1000);
      expect(json.numberTexts.size).toBe(count);
      expect(json.numberTexts.get(`${prefix}/${count - 1}`)).toBe('0');
      expect(json.numberTexts.has(`${prefix}/${count}`)).toBe(false);
    }
  });

  it('random valid JSON within depth parses like JSON.parse (fast-check, 500 runs)', () => {
    // Números dentro de ±(2^53 − 1): fuera de ese rango JSON.stringify escribe enteros
    // largos que el parser rechaza a propósito. Strings con cualquier punto de código.
    const { value } = fc.letrec<{ value: JsonValue }>((tie) => ({
      value: fc.oneof(
        { depthSize: 'small', maxDepth: 12 },
        fc.constant(null),
        fc.boolean(),
        fc.double({ min: -(2 ** 53 - 1), max: 2 ** 53 - 1, noNaN: true }),
        fc.integer(),
        fc.string({ unit: 'binary' }),
        fc.array(tie('value')),
        fc.dictionary(fc.string({ unit: 'binary' }), tie('value')),
      ),
    }));
    fc.assert(
      fc.property(value, fc.boolean(), (v, pretty) => {
        const text = JSON.stringify(v, null, pretty ? 2 : undefined);
        const json = ok(text);
        expect(json.value).toEqual(JSON.parse(text));
      }),
      { numRuns: 500 },
    );
  });
});
