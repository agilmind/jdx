/**
 * JSON Pointer (RFC 6901) y patrones con `*` (src/json/pointer.ts).
 */
import { describe, expect, it } from 'vitest';
import { getAt, matchPattern, pointerOf, segmentsOf } from '../../../src/json/pointer.js';
import type { JsonValue } from '../../../src/types.js';

describe('JSON Pointer', () => {
  it('pointer round-trip with ~0 and ~1', () => {
    const segments = ['a/b', 'c~d', 0, '', '~1'];
    const pointer = pointerOf(segments);
    expect(pointer).toBe('/a~1b/c~0d/0//~01');
    expect(segmentsOf(pointer)).toEqual(['a/b', 'c~d', '0', '', '~1']);
    expect(pointerOf([])).toBe('');
    expect(segmentsOf('')).toEqual([]);
    expect(segmentsOf('/')).toEqual(['']);
    // RFC 6901 §4: primero ~1 y después ~0, así "~01" es "~1" y no "/".
    expect(segmentsOf('/~01')).toEqual(['~1']);
    for (const bad of ['a', '/~', '/~2', '/a~']) expect(() => segmentsOf(bad), bad).toThrow();

    const value: JsonValue = { 'a/b': { 'c~d': [{ '': { '~1': 42 } }] }, list: [1, 2] };
    expect(getAt(value, pointer)).toBe(42);
    expect(getAt(value, '')).toBe(value);
    expect(getAt(value, '/list/1')).toBe(2);
    // Índices canónicos y dentro del arreglo; solo propiedades propias.
    for (const miss of ['/list/2', '/list/01', '/list/-', '/list/1/x', '/nope', '/constructor', '/__proto__', '/list/length']) {
      expect(getAt(value, miss), miss).toBeUndefined();
    }
  });

  it('matchPattern matches * as exactly one segment', () => {
    expect(matchPattern('/works/*/shares/*/percent', '/works/0/shares/2/percent')).toBe(true);
    expect(matchPattern('/works/*/shares/*/percent', '/works/0/percent')).toBe(false);
    expect(matchPattern('/works/*/shares/*/percent', '/works/0/shares/2/percent/x')).toBe(false);
    expect(matchPattern('/works/*', '/works/0')).toBe(true);
    expect(matchPattern('/works/*', '/works')).toBe(false);
    expect(matchPattern('/works/*', '/works/0/1')).toBe(false);
    expect(matchPattern('/parties/*/address', '/parties/12/address')).toBe(true);
    expect(matchPattern('/parties/*/address', '/parties/12/addresses')).toBe(false);
    expect(matchPattern('/declaration/issuer', '/declaration/issuer')).toBe(true);
    expect(matchPattern('/*', '')).toBe(false);
    expect(matchPattern('', '')).toBe(true);
    // Un segmento vacío también es un segmento.
    expect(matchPattern('/a/*', '/a/')).toBe(true);
  });
});
