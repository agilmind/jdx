/**
 * Cómo se guardan y se usan las claves raíz es operativo: no está en el
 * repositorio. Ningún texto (código, comentarios, nombres de tests, datos,
 * documentación) ni nombre de archivo o carpeta habla de los actos de firma de
 * las raíces, de quienes guardan las claves, de un servicio de claves en la
 * nube, de dispositivos de una marca, de cuentas y permisos de un proveedor,
 * de un segundo factor, de una caja de seguridad ni de quien da fe de un acto.
 * El código habla de un token PKCS#11, de PIV y de SoftHSM, y eso sí vale.
 *
 * Los términos que se buscan llevan una letra escrita como escape (\x53 = S,
 * \x4d = M, \x41 = A, \x69 = i, \x72 = r, \x6f = o, \x61 = a, \x73 = s) o una
 * clase de caracteres para que este archivo no los nombre. Los datos codificados (claves,
 * huellas, firmas) se blanquean antes de buscar: sus letras al azar pueden
 * formar un término.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { lineHits, planter } from '../helpers/files.js';
import { blankEncodedData } from '../helpers/wording.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Lo operativo de las claves raíz, en español, portugués e inglés. */
const OPERATIONAL: readonly RegExp[] = [
  /cer[ei]m[o\u00f4]n/iu,
  /cust[o\u00f3]d/iu,
  /\bKM\x53\b/iu,
  /yub\x69/iu,
  /\bAW\x53\b/iu,
  /\bIA\x4d\b/iu,
  /\bMF\x41\b/iu,
  /caja\s+fue\x72te/iu,
  /esc\x72iban/iu,
  /\bnot[a\u00e1]\x72/iu,
  /ha\x72dwa\x72e[\s_-]*token/iu,
];

const operational = (text: string): boolean => OPERATIONAL.some((term) => term.test(text));

/** `archivo:línea` de cada línea que nombra algo operativo. */
const contentHits = (root: string): string[] => lineHits(root, (line) => operational(blankEncodedData(line)));

/** Carpetas que el recorrido de nombres no abre, como el de los textos. */
const SKIP_DIRS: ReadonlySet<string> = new Set(['node_modules', '.git', 'dist', 'coverage']);

/** Cada archivo o carpeta cuyo nombre nombra algo operativo, con su ruta. */
function nameHits(root: string, dir = ''): string[] {
  const hits: string[] = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = dir === '' ? entry.name : `${dir}/${entry.name}`;
    if (operational(entry.name)) hits.push(rel);
    if (entry.isDirectory()) hits.push(...nameHits(root, rel));
  }
  return hits.sort();
}

const trees = planter('jdx-keys-');
afterEach(() => trees.cleanup());

describe('key handling', () => {
  it('no repository text or file name says how the root keys are kept', () => {
    expect(contentHits(ROOT)).toEqual([]);
    expect(nameHits(ROOT)).toEqual([]);
  });

  it('the guard finds each term in Spanish, Portuguese and English, in texts and names, and lets PKCS#11, PIV and SoftHSM pass', () => {
    const planted = trees.plant({
      'docs/a.md': [
        'la ce\x72emonia de las raíces',
        'a ce\x72imônia anual',
        'the root ce\x72emony',
        'cada cust\x6fdio',
        'a cust\u00f3dia das chaves',
        'key cust\x6fdy',
        'con KM\x53',
        'una Yub\x69Key por raíz',
        'en AW\x53',
        'roles de IA\x4d',
        'con MF\x41',
        'en una caja fue\x72te',
        'ante esc\x72ibano',
        'ante not\x61rio, not\u00e1\x72io o not\x61ry',
        'un ha\x72dware token',
      ].join('\n'),
      'src/b.ts': [
        "// Un token PKCS#11, PIV 9c y SoftHSM; pkcs11js como peer opcional.",
        "const slot = 'PIV';",
        // Una clave es un dato codificado: las letras al azar de sus coordenadas no cuentan.
        '{ "x": "q7Xs-AW\x53-pK2-KM\x53-Zr9xW4mN8bV1cY6dT3hJ0gL5pE2uRtY7aB3" }',
        // Las palabras que solo contienen las letras no cuentan.
        '// hardware, token, laws, IAMB, AWSOME, notas',
      ].join('\n'),
      'docs/ce\x72emonia.md': 'texto',
      'ops/cust\x6fdios/README.md': 'texto',
      'node_modules/c/ce\x72emony.md': 'una ce\x72emonia',
      '.git/config': 'KM\x53',
      'dist/index.js': 'AW\x53',
      'coverage/index.html': 'MF\x41',
      'package-lock.json': '{ "name": "aw\x73-sdk" }',
    });
    expect(contentHits(planted)).toEqual(Array.from({ length: 15 }, (_, i) => `docs/a.md:${i + 1}`));
    expect(nameHits(planted)).toEqual(['docs/ce\x72emonia.md', 'ops/cust\x6fdios']);
  });
});
