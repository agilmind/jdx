/**
 * Base64url sin relleno (RFC 7515), como lo usan los JWS de JDX: un texto da
 * unos bytes y nada más. Un texto con relleno, con caracteres de otro alfabeto
 * o con los bits que sobran del último carácter en 1 no se lee.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fromBase64url, toBase64url } from '../../../src/conventions/base64url.js';

describe('base64url', () => {
  it('reads unpadded base64url and writes it back', () => {
    expect(fromBase64url('')).toEqual(new Uint8Array());
    expect(fromBase64url('eyJhIjoxfQ')).toEqual(new TextEncoder().encode('{"a":1}'));
    expect(fromBase64url('-_8')).toEqual(new Uint8Array([0xfb, 0xff]));
    expect(toBase64url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(toBase64url('{"a":1}')).toBe('eyJhIjoxfQ');
  });

  it('refuses padding, another alphabet, a lone last character and spare bits in 1', () => {
    for (const text of ['eyJhIjoxfQ==', 'eyJhIjoxfQ=', '+/8', 'ab cd', 'abcd\n', 'a', 'abcde', 'eyJhIjoxfR', '-_9', 'ñ']) {
      expect(fromBase64url(text), text).toBeNull();
    }
  });

  it('every byte string goes and comes back, and is the only text for its bytes (fast-check, 300 runs)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        const text = toBase64url(bytes);
        expect(fromBase64url(text)).toEqual(bytes);
        // Cambiar el último carácter por otro del alfabeto da otros bytes o ninguno, nunca los mismos.
        if (text.length > 0) {
          const other = `${text.slice(0, -1)}${text.endsWith('A') ? 'B' : 'A'}`;
          const back = fromBase64url(other);
          if (back !== null) expect(Buffer.from(back).equals(Buffer.from(bytes))).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });
});
