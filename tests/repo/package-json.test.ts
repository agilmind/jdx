/**
 * package.json: versión 1.0.0, ESM, librería desde Node 20.19, privado hasta
 * su publicación, sus scripts y los datos del repositorio público
 * agilmind/jdx.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

describe('package.json', () => {
  it('package.json has engines >=20.19, type module and version 1.0.0', () => {
    expect(pkg.name).toBe('@agilmind/jdx');
    expect(pkg.version).toBe('1.0.0');
    // Privado hasta su publicación en el registro.
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');
    expect(pkg.engines).toEqual({ node: '>=20.19' });
    for (const script of ['build', 'gen', 'gen:check', 'test', 'typecheck', 'validate']) {
      expect(pkg.scripts[script], script).toBeTypeOf('string');
    }
  });

  it('package.json points to the public repository agilmind/jdx', () => {
    expect(pkg.repository).toEqual({ type: 'git', url: 'https://github.com/agilmind/jdx.git' });
    expect(pkg.homepage).toBe('https://github.com/agilmind/jdx');
    expect(pkg.bugs).toEqual({ url: 'https://github.com/agilmind/jdx/issues', email: 'jdx@jupiter.ar' });
    expect(pkg.author).toBe('Agilmind SRL');
    expect(pkg.license).toBe('SEE LICENSE IN LICENSE');
    expect(pkg.description).toContain('Un estándar creado por Agilmind SRL para ser implementado por las Sociedades de Gestión.');
  });
});
