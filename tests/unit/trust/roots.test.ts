/**
 * Las raíces fijadas: trust/roots.json trae las de cada entorno (vacías hasta
 * que se publiquen), gen las escribe en src/generated/roots.ts a través de
 * parseRootsFile, y la imagen de un entorno se queda solo con las suyas
 * (filterRoots). Cada raíz es una clave P-256 con su kid RFC 7638. gen no
 * depende de lo que genera: src/trust/keys.ts no importa datos generados.
 */
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { generateAll } from '../../../scripts/gen.js';
import { roots as generated } from '../../../src/generated/roots.js';
import { ecThumbprint, filterRoots, parseRootsFile } from '../../../src/trust/keys.js';
import { pinnedRoots } from '../../../src/trust/roots.js';
import type { JsonValue } from '../../../src/types.js';
import { TEST_ROOT_KEYS, TEST_ROOTS } from '../../helpers/trustFixtures.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

const copies: string[] = [];
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const asJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

/** Los archivos del repositorio que `rel` importa al correr, y los que importan ellos; un `import type` no cuenta. */
function runtimeImports(rel: string, seen = new Set<string>()): Set<string> {
  if (seen.has(rel)) return seen;
  seen.add(rel);
  for (const [, spec = ''] of read(rel).matchAll(/^(?:import|export)\s+(?!type\s)[^;()=]*?\sfrom\s+'(\.{1,2}\/[^']+)'/gmu)) {
    const target = posix.join(posix.dirname(rel), spec);
    runtimeImports(target.endsWith('.js') ? target.replace(/\.js$/u, '.ts') : target, seen);
  }
  return seen;
}

describe('raíces fijadas', () => {
  it('pinnedRoots() is the generated roots of trust/roots.json, empty until they are published', () => {
    expect(read('trust/roots.json')).toBe(`${JSON.stringify({ production: [], sandbox: [] }, null, 2)}\n`);
    expect(pinnedRoots()).toEqual(parseRootsFile(JSON.parse(read('trust/roots.json')) as JsonValue));
    expect(pinnedRoots()).toEqual(generated);
    expect(Object.isFrozen(pinnedRoots()) && Object.isFrozen(pinnedRoots().production)).toBe(true);
  });

  it('filterRoots keeps only the given envs', () => {
    expect(filterRoots(TEST_ROOTS, ['production'])).toEqual({ production: TEST_ROOTS.production, sandbox: [] });
    expect(filterRoots(TEST_ROOTS, ['sandbox'])).toEqual({ production: [], sandbox: TEST_ROOTS.sandbox });
    expect(filterRoots(TEST_ROOTS, ['sandbox', 'production'])).toEqual(TEST_ROOTS);
    expect(filterRoots(TEST_ROOTS, [])).toEqual({ production: [], sandbox: [] });
    expect(Object.isFrozen(filterRoots(TEST_ROOTS, ['production']))).toBe(true);
  });

  it('parseRootsFile rejects a kid that is not the RFC 7638 thumbprint', () => {
    // Las raíces de prueba pasan, cada una con su huella.
    expect(parseRootsFile(asJson(TEST_ROOTS))).toEqual(TEST_ROOTS);
    for (const root of [...TEST_ROOTS.production, ...TEST_ROOTS.sandbox]) expect(ecThumbprint(root)).toBe(root.kid);
    // La huella de the trust list example key.
    expect(ecThumbprint({ kty: 'EC', crv: 'P-256', x: 'tNoY2fMd0GIr3JfaozCgdYKK9v28CECvJHwhWan7KLs', y: 'CVhCPRKE4hebYSX-FDUqwp2-o7Y_YHoHSOBAYhLrPIw' })).toBe(
      '3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E',
    );
    const [first, second] = TEST_ROOTS.production;
    const withFirst = (change: object): JsonValue => asJson({ ...TEST_ROOTS, production: [{ ...first, ...change }, second] });
    expect(() => parseRootsFile(withFirst({ kid: second?.kid }))).toThrow(`raíces fijadas: production/0: el kid no es la huella RFC 7638 de la clave (${first?.kid})`);
    // Tampoco pasa una clave que no es un punto de P-256, otra forma, una raíz repetida o en los dos entornos.
    expect(() => parseRootsFile(withFirst({ y: second?.y }))).toThrow('raíces fijadas: production/0: no es una clave pública P-256');
    expect(() => parseRootsFile(withFirst({ d: TEST_ROOT_KEYS.production[0]?.d }))).toThrow('raíces fijadas: production/0: una raíz es { kty, crv, x, y, kid }');
    expect(() => parseRootsFile(withFirst({ crv: 'P-384' }))).toThrow('raíces fijadas: production/0: una raíz es { kty, crv, x, y, kid }');
    expect(() => parseRootsFile(asJson({ ...TEST_ROOTS, production: [first, first] }))).toThrow(`raíces fijadas: production/1: raíz repetida (${first?.kid})`);
    expect(() => parseRootsFile(asJson({ production: [first], sandbox: [first] }))).toThrow(`raíces fijadas: sandbox/0: raíz repetida (${first?.kid})`);
    expect(() => parseRootsFile(asJson({ production: [] }))).toThrow('raíces fijadas: tienen que ser { production: [], sandbox: [] }');
    expect(() => parseRootsFile(asJson({ production: [], sandbox: [], test: [] }))).toThrow('raíces fijadas: tienen que ser { production: [], sandbox: [] }');
    expect(() => parseRootsFile(asJson([]))).toThrow('raíces fijadas: tienen que ser { production: [], sandbox: [] }');
  });

  it('gen does not import the files it generates', () => {
    const imported = runtimeImports('scripts/gen.ts');
    expect(imported).toContain('src/trust/keys.ts');
    expect(imported).toContain('scripts/gen-values.mjs');
    expect([...imported].filter((rel) => rel.startsWith('src/generated/'))).toEqual([]);
    // El recorrido sí ve los datos generados de un módulo que los importa.
    expect([...runtimeImports('src/trust/roots.ts')]).toContain('src/generated/roots.ts');
  });

  it('gen writes src/generated/roots.ts from trust/roots.json through parseRootsFile', () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'jdx-roots-'));
    copies.push(root);
    const skip = new Set(['node_modules', '.git', 'dist', 'coverage']);
    cpSync(ROOT, root, { recursive: true, filter: (src) => !skip.has(basename(src)) });
    writeFileSync(join(root, 'trust/roots.json'), `${JSON.stringify(filterRoots(TEST_ROOTS, ['sandbox']), null, 2)}\n`);
    const text = generateAll(root).get('src/generated/roots.ts') ?? '';
    expect(text).toContain(`export const roots: PinnedRoots = ${JSON.stringify(filterRoots(TEST_ROOTS, ['sandbox']), null, 2)};`);
    // Un archivo de raíces que no pasa parseRootsFile no se genera.
    const bad = { production: [{ ...TEST_ROOTS.production[0], kid: TEST_ROOTS.sandbox[0]?.kid }], sandbox: [] };
    writeFileSync(join(root, 'trust/roots.json'), `${JSON.stringify(bad, null, 2)}\n`);
    expect(() => generateAll(root)).toThrow('raíces fijadas: production/0: el kid no es la huella RFC 7638 de la clave');
  });
});
