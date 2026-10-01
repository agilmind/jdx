/**
 * `npm run gen` y `gen:check` (scripts/gen.ts): el generador es determinista, lo
 * que está en el repositorio está al día, y gen:check falla con un archivo
 * viejo, con uno que falta o con un cambio del modelo que no se regeneró. Los
 * casos que rompen algo trabajan sobre una copia del repositorio.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkGenerated, generateAll } from '../../../scripts/gen.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SKIP: ReadonlySet<string> = new Set(['node_modules', '.git', 'dist', 'coverage']);

const copies: string[] = [];
/** Una copia del repositorio sin node_modules, .git, dist ni coverage. */
function copyRepo(): string {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'jdx-gen-'));
  copies.push(dir);
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
  return dir;
}
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** scripts/gen.ts con tsx, como lo corre npm. */
function runGen(args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/gen.ts', ...args], { cwd: ROOT, encoding: 'utf8' });
}

describe('gen y gen:check', () => {
  it('gen is deterministic (two runs, same bytes)', () => {
    const first = generateAll(ROOT);
    const second = generateAll(ROOT);
    expect([...second]).toEqual([...first]);
    expect([...first.keys()]).toEqual(
      expect.arrayContaining(['docs/campos.md', 'schema/1.0/jdx.schema.json', 'schema/1.0/jdx.strict.schema.json', 'src/generated/jdx-types.ts']),
    );
    // Lo que está en el repositorio es la salida del generador.
    expect(checkGenerated(ROOT, first)).toEqual([]);
  });

  it('gen:check fails on stale schemas', () => {
    const root = copyRepo();
    expect(checkGenerated(root)).toEqual([]);

    // Un archivo generado con otro texto y otro que falta.
    writeFileSync(join(root, 'schema/1.0/jdx.strict.schema.json'), `${readFileSync(join(root, 'schema/1.0/jdx.strict.schema.json'), 'utf8')} `);
    unlinkSync(join(root, 'schema/1.0/jdx.schema.json'));
    expect(checkGenerated(root)).toEqual(['schema/1.0/jdx.schema.json', 'schema/1.0/jdx.strict.schema.json']);
    const check = runGen(['--check', '--root', root]);
    expect(check.status).toBe(1);
    expect(check.stderr).toContain('gen:check: archivos generados viejos o faltantes (correr npm run gen):');
    expect(check.stderr).toContain('  schema/1.0/jdx.schema.json\n  schema/1.0/jdx.strict.schema.json');

    // gen los vuelve a escribir y gen:check pasa.
    const gen = runGen(['--root', root]);
    expect(gen.status).toBe(0);
    expect(gen.stdout).toContain('2 escritos');
    expect(runGen(['--check', '--root', root]).status).toBe(0);

    // Un cambio del modelo sin regenerar también deja viejos los dos schemas, el bundle que los lleva y la referencia de campos.
    const overlayPath = join(root, 'schema/src/types.overlay.json');
    const overlay = JSON.parse(readFileSync(overlayPath, 'utf8')) as { constraints: unknown[] };
    writeFileSync(overlayPath, `${JSON.stringify({ ...overlay, constraints: overlay.constraints.slice(1) }, null, 2)}\n`);
    expect(checkGenerated(root)).toEqual(['docs/campos.md', 'schema/1.0/jdx.schema.json', 'schema/1.0/jdx.strict.schema.json', 'src/generated/data.ts']);
  });

  it('gen:check fails when a description changes and campos.md is not regenerated', () => {
    const root = copyRepo();
    const typesPath = join(root, 'schema/src/types.json');
    const types = JSON.parse(readFileSync(typesPath, 'utf8')) as { types: { Work: { props: { duration: { description: string } } } } };
    types.types.Work.props.duration.description = 'Duración de la obra.';
    writeFileSync(typesPath, `${JSON.stringify(types, null, 2)}\n`);
    // Una descripción no cambia los schemas: solo la referencia de campos y los comentarios de los tipos TS.
    expect(checkGenerated(root)).toEqual(['docs/campos.md', 'src/generated/jdx-types.ts']);
  });
});
