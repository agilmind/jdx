/**
 * Higiene del repositorio público: ningún texto lleva rutas de una máquina,
 * nombres de sistemas internos ni códigos de trabajo interno (tareas,
 * decisiones, marcas de corte). Los términos se arman en partes o con escapes
 * para que este archivo no los contenga; los datos codificados se blanquean
 * antes de buscar.
 */
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { lineHits, planter } from '../helpers/files.js';
import { blankEncodedData } from '../helpers/wording.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Lo que no puede aparecer: una carpeta de usuario, el servidor interno y los códigos internos. */
const INTERNAL: readonly RegExp[] = [
  /\/\x55sers\//u,
  /jupite\x72-server/iu,
  // Un código de tarea; no la hora de un instante ni un ISWC.
  /\bT\d{1,2}\b(?![:\d])/u,
  /\bTasks? \d+/u,
  /\bD\d{1,2}\b/u,
  /\bS\x54OP\b/u,
];

const internalHits = (root: string): string[] =>
  lineHits(root, (line) => {
    const text = blankEncodedData(line);
    return INTERNAL.some((re) => re.test(text));
  });

const trees = planter('jdx-hygiene-');
afterEach(() => trees.cleanup());

describe('hygiene', () => {
  it('no repository text has machine paths, internal systems or internal work codes', () => {
    expect(internalHits(ROOT)).toEqual([]);
  });

  it('the guard finds each kind and lets instants, ISWC, durations and encoded data pass', () => {
    const planted = trees.plant({
      'a.md': ['ver /U' + 'sers/alguien/x', 'en jupiter' + '-server', 'como dice T' + '12', 'la Tas' + 'k 12', 'por D' + '33', 'S' + 'TOP: revisar'].join('\n'),
      'b.json': JSON.stringify({
        createdAt: '2026-09-12T19:00:00-03:00',
        iswc: 'T0345246801',
        duration: 'PT3M25S',
        kid: '3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E',
        x: `q7XsT${12}K2-D${33}-Zr9xW4mN8bV1cY6dT3hJ0gL5pE2uR`,
      }),
    });
    expect(internalHits(planted)).toEqual(['a.md:1', 'a.md:2', 'a.md:3', 'a.md:4', 'a.md:5', 'a.md:6']);
  });
});
