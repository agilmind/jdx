/**
 * La documentación pública: el ejemplo del README es un documento válido, los
 * enlaces relativos llegan a archivos que existen y los textos de entrada
 * (README, SECURITY, CONTRIBUTING) son cortos.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkDocument } from '../../scripts/validate.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const lines = (rel: string): number => read(rel).trimEnd().split('\n').length;

describe('docs', () => {
  it('the README example is valid under the strict schema', () => {
    const block = /```json\n([\s\S]*?)\n```/u.exec(read('README.md'));
    expect(block).not.toBeNull();
    const outcome = checkDocument(new TextEncoder().encode(block?.[1] ?? ''));
    expect(outcome).toEqual({ exitCode: 0, lines: ['ok: JSON y schema estricto 1.0, sin errores'] });
  });

  it('relative links of README, the guide and the field references resolve', () => {
    for (const rel of ['README.md', 'docs/guia.md', 'docs/campos.md', 'docs/en/campos.md', 'SECURITY.md', 'CONTRIBUTING.md']) {
      // Sin el código en línea: un patrón como `[0-9](\.[0-9])` no es un enlace.
      for (const [, target] of read(rel).replace(/`[^`\n]*`/gu, '').matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/gu)) {
        if (/^[a-z]+:/u.test(target as string)) continue;
        expect(existsSync(join(ROOT, dirname(rel), target as string)), `${rel} → ${target}`).toBe(true);
      }
    }
  });

  it('README, SECURITY and CONTRIBUTING are short', () => {
    expect(lines('README.md')).toBeLessThanOrEqual(80);
    expect(lines('SECURITY.md')).toBeLessThanOrEqual(12);
    expect(lines('CONTRIBUTING.md')).toBeLessThanOrEqual(12);
  });
});
