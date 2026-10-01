/**
 * `npm run validate` (scripts/validate.ts): JSON (JDX-JSN-001) y schema
 * estricto de la menor del archivo (JDX-SCH-001); una menor más nueva, con el
 * abierto de la última (JDX-VER-003); otra mayor, JDX-VER-001.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkDocument } from '../../../scripts/validate.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const EXAMPLE_PATH = 'docs/ejemplo/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json';
const EXAMPLE = JSON.parse(readFileSync(`${ROOT}${EXAMPLE_PATH}`, 'utf8')) as { [k: string]: unknown };
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));

describe('npm run validate', () => {
  it('the example passes', () => {
    expect(checkDocument(bytes(EXAMPLE))).toEqual({ exitCode: 0, lines: ['ok: JSON y schema estricto 1.0, sin errores'] });
  });

  it('JSON failures are JDX-JSN-001', () => {
    expect(checkDocument(bytes('{"jdx":"1.0","a":1,"a":2}'))).toEqual({ exitCode: 1, lines: ['error JDX-JSN-001 /a duplicateKey (byte 19)'] });
    expect(checkDocument(bytes('')).lines).toEqual(['error JDX-JSN-001 / empty (byte 0)']);
  });

  it('schema failures are JDX-SCH-001, one per error, with the strict schema', () => {
    const outcome = checkDocument(bytes({ ...EXAMPLE, works: [{ id: 'w1' }], percnet: 25 }));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.lines).toEqual([
      'error JDX-SCH-001 /works/0 required {"missingProperty":"titles"}',
      'error JDX-SCH-001 /percnet unevaluatedProperties {"unevaluatedProperty":"percnet"}',
    ]);
  });

  it('a newer minor is checked with the open schema of the latest one, and another major is JDX-VER-001', () => {
    const newer = checkDocument(bytes({ ...EXAMPLE, jdx: '1.7', newField: { a: 1 } }));
    expect(newer).toEqual({
      exitCode: 0,
      lines: [
        'aviso JDX-VER-003 /jdx la versión 1.7 es más nueva que 1.0: se valida con el schema abierto de 1.0',
        'ok: JSON y schema abierto 1.0, sin errores',
      ],
    });
    expect(checkDocument(bytes({ ...EXAMPLE, jdx: '2.0' }))).toEqual({ exitCode: 1, lines: ['error JDX-VER-001 /jdx versión mayor no soportada: 2.0'] });
  });

  it('the command prints one block per file and exits with the worst outcome', () => {
    const run = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/validate.ts', ...args], { cwd: ROOT, encoding: 'utf8' });
    const ok = run([EXAMPLE_PATH]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toBe(`${EXAMPLE_PATH}\n  ok: JSON y schema estricto 1.0, sin errores\n`);
    expect(run([]).status).toBe(2);
    expect(run(['no-existe.jdx.json']).status).toBe(2);
    const bad = run([EXAMPLE_PATH, 'package.json']);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('package.json\n  error JDX-SCH-001 ');
    expect(bad.stdout).toContain('error JDX-SCH-001 / required {"missingProperty":"declaration"}');
  });
});
