/**
 * Cada schema publicado lleva en la raíz el `$comment` "JDX 1.0. Creado por
 * Agilmind SRL. Condiciones de uso: ver x-jdx-license." y la anotación
 * `x-jdx-license` con el identificador SPDX y la URL de la licencia
 * (src/schema/notice.ts). El test recorre schema/ entero, así cubre cada
 * schema nuevo.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCHEMA_COMMENT, SCHEMA_LICENSE } from '../../src/schema/notice.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Los *.schema.json bajo `dir` (relativo a la raíz), a cualquier profundidad, en orden. */
function schemaFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(`${ROOT}${dir}`, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...schemaFiles(rel));
    else if (entry.isFile() && entry.name.endsWith('.schema.json')) out.push(rel);
  }
  return out.sort();
}

describe('schemas', () => {
  it('the notice of a published schema', () => {
    expect(SCHEMA_COMMENT).toBe('JDX 1.0. Creado por Agilmind SRL. Condiciones de uso: ver x-jdx-license.');
    expect(SCHEMA_LICENSE).toEqual({ spdx: 'LicenseRef-Agilmind-JDX', url: 'https://github.com/agilmind/jdx/blob/HEAD/LICENSE' });
  });

  it('every *.schema.json under schema/ carries the $comment and the x-jdx-license annotation', () => {
    const files = schemaFiles('schema');
    expect(files).toContain('schema/src/types.schema.json');
    expect(files).toContain('schema/src/types.overlay.schema.json');
    expect(files).toContain('schema/1.0/jdx.schema.json');
    const wrong = files.filter((rel) => {
      const schema = JSON.parse(readFileSync(`${ROOT}${rel}`, 'utf8'));
      return schema.$comment !== SCHEMA_COMMENT || JSON.stringify(schema['x-jdx-license']) !== JSON.stringify(SCHEMA_LICENSE);
    });
    expect(wrong).toEqual([]);
  });
});
