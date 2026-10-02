/**
 * Los patrones de ruta de la entrega (matchDeliveryGlob): los de --ignore y
 * las exclusiones de JDX-MED-003.
 */
import { describe, expect, it } from 'vitest';
import { globSteps, matchDeliveryGlob } from '../../../src/media/glob.js';

const matches = (pattern: string, paths: readonly string[]) => paths.filter((path) => matchDeliveryGlob(pattern, path));

describe('matchDeliveryGlob', () => {
  it('pattern without / matches the base name at any depth', () => {
    expect(matches('*.tmp', ['x.tmp', 'sub/x.tmp', 'a/b/c/x.tmp', 'x.tmp/y', 'x.tmpl'])).toEqual(['x.tmp', 'sub/x.tmp', 'a/b/c/x.tmp']);
    expect(matches('jdx-trust.json', ['jdx-trust.json', 'sub/jdx-trust.json', 'jdx-trust.json.bak', 'a-jdx-trust.json'])).toEqual(['jdx-trust.json', 'sub/jdx-trust.json']);
  });

  it('pattern with / matches the path from the delivery root', () => {
    expect(matches('tmp/*', ['tmp/a', 'sub/tmp/a', 'tmp/a/b', 'tmp'])).toEqual(['tmp/a']);
    expect(matches('sub/x.tmp', ['sub/x.tmp', 'a/sub/x.tmp', 'x.tmp'])).toEqual(['sub/x.tmp']);
  });

  it('* stays within a segment and ** spans zero or more', () => {
    expect(matches('a*b', ['ab', 'axxb', 'a/b', 'x/axb'])).toEqual(['ab', 'axxb', 'x/axb']);
    expect(matches('a/*/c', ['a/b/c', 'a/c', 'a/b/x/c'])).toEqual(['a/b/c']);
    expect(matches('a/**/c', ['a/c', 'a/b/c', 'a/b/x/c', 'a/b/x/d', 'b/a/c'])).toEqual(['a/c', 'a/b/c', 'a/b/x/c']);
    // tmp/** cubre todo lo de tmp, y también un archivo que se llama tmp: ** son cero o más segmentos.
    expect(matches('tmp/**', ['tmp/a', 'tmp/a/b', 'tmp', 'sub/tmp/a'])).toEqual(['tmp/a', 'tmp/a/b', 'tmp']);
    expect(matches('**/x.tmp', ['x.tmp', 'a/x.tmp', 'a/b/x.tmp', 'a/x.tmpl'])).toEqual(['x.tmp', 'a/x.tmp', 'a/b/x.tmp']);
    // Sin /, ** es un * del nombre base.
    expect(matches('**', ['a', 'b/c'])).toEqual(['a', 'b/c']);
  });

  it('patterns are case-sensitive', () => {
    expect(matches('*.tmp', ['x.tmp', 'X.TMP', 'x.Tmp'])).toEqual(['x.tmp']);
    expect(matches('Tmp/*', ['Tmp/a', 'tmp/a', 'TMP/a'])).toEqual(['Tmp/a']);
  });

  it('a pattern and a name compare in NFC: a name written as NFD matches a pattern typed as NFC, and the other way', () => {
    const nfc = 'Canci\u00f3n';
    const nfd = 'Cancio\u0301n';
    expect(matchDeliveryGlob(`${nfc}*.pdf`, `sub/${nfd}-1.pdf`)).toBe(true);
    expect(matchDeliveryGlob(`${nfd}*.pdf`, `${nfc}.pdf`)).toBe(true);
    expect(matchDeliveryGlob(`M\u00fasica/**`, `Mu\u0301sica/${nfd}.pdf`)).toBe(true);
    // Solo la forma: otra letra no.
    expect(matchDeliveryGlob(`${nfc}*.pdf`, 'Cancion.pdf')).toBe(false);
  });

  it('everything other than * is literal, and an empty segment matches nothing', () => {
    expect(matches('a?b', ['a?b', 'axb'])).toEqual(['a?b']);
    expect(matches('[ab].tmp', ['[ab].tmp', 'a.tmp'])).toEqual(['[ab].tmp']);
    expect(matches('a.b', ['a.b', 'axb'])).toEqual(['a.b']);
    // Una barra inicial, final o doble deja un segmento vacío, que no calza con ningún segmento de una ruta.
    for (const pattern of ['/tmp/*', 'tmp/', 'tmp//a', '', '/']) expect(matches(pattern, ['tmp/a', 'tmp', 'a']), pattern).toEqual([]);
  });

  it('NFC never joins an escaped byte with the mark that follows it', () => {
    // Los bytes 61 FA CC 81: "a", un byte que no es UTF-8 y U+0301. La A del escape no es una letra que se acentúa.
    const shown = 'a\\xFA\u0301';
    expect(matchDeliveryGlob('a\\xFA*', shown)).toBe(true);
    expect(matchDeliveryGlob('*\u00C1*', shown)).toBe(false);
    expect(matchDeliveryGlob('a\\xFA\u0301', shown)).toBe(true);
    // Lo demás de cada tramo sí se compara en NFC.
    expect(matchDeliveryGlob('Canci\u00F3n\\xFF*', 'Cancio\u0301n\\xFF.pdf')).toBe(true);
  });

  it('many stars against a long name are matched in at most the length of the pattern times that of the path, not by backtracking', () => {
    const name = `${'a'.repeat(100_000)}c`;
    const deep = Array<string>(2000).fill('d').join('/');
    for (const [pattern, path, matched] of [
      ['*a*a*a*a*a*a*a*a*b', name, false], [`**/${'*a'.repeat(8)}*c`, `x/y/${name}`, true], ['**/**/**/**/e', `${deep}/f`, false],
    ] as const) {
      const run = globSteps(pattern, path);
      expect(run.matched, pattern).toBe(matched);
      expect(matchDeliveryGlob(pattern, path), pattern).toBe(matched);
      expect(run.steps, pattern).toBeLessThanOrEqual((pattern.length + 1) * (path.length + 1));
    }
  });
});
