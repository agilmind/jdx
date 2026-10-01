/**
 * docs/campos.md y docs/en/campos.md (src/schema/fieldReference.ts): la
 * referencia de campos sale del modelo de tipos, con una tabla por tipo, cada
 * campo con su tipo, si es requerido (o la condición del overlay), sus valores
 * y su descripción; en inglés, con las traducciones del overlay.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PATTERNS } from '../../../src/conventions/patterns.js';
import { generateFieldReference } from '../../../src/schema/fieldReference.js';
import { loadModel } from '../../../src/schema/model.js';
import type { JsonValue, TypesOverlay } from '../../../src/types.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const MODEL = loadModel(JSON.parse(read('schema/src/types.json')), JSON.parse(read('schema/src/types.overlay.json')));
const DOC = read('docs/campos.md');
const DOC_EN = read('docs/en/campos.md');
const OVERLAY = JSON.parse(read('schema/src/types.overlay.json')) as TypesOverlay;

/** La fila de un campo en la tabla de su tipo. */
function row(typeName: string, prop: string, doc: string = DOC): string {
  const section = doc.slice(doc.indexOf(`\n### \`${typeName}\`\n`));
  const end = section.indexOf('\n### ', 1);
  const line = (end < 0 ? section : section.slice(0, end)).split('\n').find((l) => l.startsWith(`| \`${prop}\` |`));
  if (line === undefined) throw new Error(`no hay fila para ${typeName}.${prop}`);
  return line;
}

describe('docs/campos.md', () => {
  it('is the output of the generator', () => {
    expect(DOC).toBe(generateFieldReference(MODEL));
  });

  it('has one section per type and one row per field, in the order of types.json', () => {
    const headings = [...DOC.matchAll(/^### `([A-Za-z]+)`$/gmu)].map((m) => m[1]);
    expect(headings).toEqual(Object.keys(MODEL.source.types));
    for (const [typeName, type] of Object.entries(MODEL.source.types)) {
      for (const [prop, spec] of Object.entries(type.props)) expect(row(typeName, prop), `${typeName}.${prop}`).toContain(spec.description);
      if (type.extensions) expect(row(typeName, 'extensions')).toContain('objeto');
    }
    const groups = [...DOC.matchAll(/^## (.+)$/gmu)].map((m) => m[1]);
    expect(groups).toEqual(['Índice', 'Formatos', ...new Set(Object.values(MODEL.source.types).map((t) => t.group))]);
  });

  it('shows types, references and closed and open lists', () => {
    expect(row('Document', 'parties')).toContain('| lista de [`Party`](#party) | no |');
    expect(row('Work', 'titles')).toContain('| lista de [`Title`](#title), al menos uno | sí |');
    expect(row('Declaration', 'declarant')).toContain('| id de `parties` | no |');
    expect(row('Registration', 'filing')).toContain('| id de `media` (`registrationFiling`) | no |');
    expect(row('Share', 'role')).toContain('cerrada: `writer`, `originalPublisher`');
    expect(row('Share', 'rights')).toContain('lista, cerrada: `performing`, `mechanical`, `synchronization`, `print`');
    expect(row('Title', 'type')).toContain('[abierta](../values/titleTypes.json): `original`, `alternative`');
    expect(row('Instrument', 'scheme')).toContain('[abierta](../values/instrumentSchemes.json), sin valores todavía');
    expect(row('Work', 'lyricsLanguages')).toContain('| lista de idiomas | no |');
  });

  it('shows the conditions of the overlay in the required column', () => {
    expect(row('Name', 'full')).toContain('| al menos uno de `full` y `family` |');
    expect(row('WorkRef', 'work')).toContain('| exactamente uno de `work` y `external` |');
    expect(row('Identifier', 'country')).toContain('| si `scheme` es `TAX_ID` o `NATIONAL_ID` |');
    expect(row('Term', 'duration')).toContain('| si `basis` es `fixed`; prohibido si `basis` es `protectionPeriod` |');
    expect(row('Media', 'path')).toContain('| no; prohibido si `delivered` es `false` |');
    expect(row('PostTermCollection', 'endDate')).toContain('| si `status` es `date`; si no, prohibido |');
    expect(row('Party', 'names')).toContain('Si `kind` es `organization`, cada elemento lleva `full` y no lleva `given` ni `family`.');
  });

  it('marks personal data, with its condition when it has one', () => {
    expect(row('Party', 'birthDate')).toContain('Dato personal.');
    expect(row('Name', 'type')).toContain('El objeto es dato personal si `type` es `legal`.');
    expect(row('Identifier', 'scheme')).toContain('El objeto es dato personal si `scheme` es `TAX_ID` o `NATIONAL_ID`.');
    expect(row('Party', 'kind')).not.toContain('dato personal');
  });

  it('lists every format with its exact pattern, and every link resolves', () => {
    for (const re of Object.values(PATTERNS)) expect(DOC).toContain(`\`${re.source.replaceAll('\\/', '/').replaceAll('|', '\\|')}\``);
    const anchors = new Set([...DOC.matchAll(/^### `([A-Za-z]+)`$/gmu)].map((m) => `#${(m[1] as string).toLowerCase()}`));
    for (const [, target] of DOC.replace(/`[^`\n]*`/gu, '').matchAll(/\]\(([^)]+)\)/gu)) {
      if ((target as string).startsWith('#')) expect(anchors.has(target as string), target).toBe(true);
      else expect(existsSync(join(ROOT, 'docs', target as string)), target).toBe(true);
    }
  });
});

describe('docs/en/campos.md', () => {
  const rowEn = (typeName: string, prop: string): string => row(typeName, prop, DOC_EN);
  const en = (key: string): string => OVERLAY.translations[key]?.en ?? '';

  it('is the output of the generator in English', () => {
    expect(DOC_EN).toBe(generateFieldReference(MODEL, 'en'));
  });

  it('the overlay translates every type and every field into English', () => {
    for (const [typeName, type] of Object.entries(MODEL.source.types)) {
      expect(en(typeName), typeName).not.toBe('');
      for (const prop of Object.keys(type.props)) expect(en(`${typeName}.${prop}`), `${typeName}.${prop}`).not.toBe('');
    }
  });

  it('has the sections and rows of the Spanish reference, with the English descriptions', () => {
    const headings = [...DOC_EN.matchAll(/^### `([A-Za-z]+)`$/gmu)].map((m) => m[1]);
    expect(headings).toEqual(Object.keys(MODEL.source.types));
    for (const [typeName, type] of Object.entries(MODEL.source.types)) {
      expect(DOC_EN).toContain(`\n### \`${typeName}\`\n\n${en(typeName)}`);
      for (const prop of Object.keys(type.props)) expect(rowEn(typeName, prop), `${typeName}.${prop}`).toContain(en(`${typeName}.${prop}`));
      if (type.extensions) expect(rowEn(typeName, 'extensions')).toContain('| object | no |');
    }
    const groups = [...DOC_EN.matchAll(/^## (.+)$/gmu)].map((m) => m[1]);
    expect(groups).toEqual([
      'Index', 'Formats', 'Root and declaration', 'Common types', 'Parties', 'Works', 'Rights', 'Recordings', 'Agreements',
      'Edition', 'Media and evidence',
    ]);
  });

  it('shows types, lists, conditions and personal data in English', () => {
    expect(rowEn('Document', 'parties')).toContain('| list of [`Party`](#party) | no |');
    expect(rowEn('Work', 'titles')).toContain('| list of [`Title`](#title), at least one | yes |');
    expect(rowEn('Registration', 'filing')).toContain('| id of `media` (`registrationFiling`) | no |');
    expect(rowEn('Share', 'rights')).toContain('list, closed: `performing`, `mechanical`, `synchronization`, `print`');
    expect(rowEn('Title', 'type')).toContain('[open](../../values/titleTypes.json): `original`, `alternative`');
    expect(rowEn('Instrument', 'scheme')).toContain('[open](../../values/instrumentSchemes.json), no values yet');
    expect(rowEn('Name', 'full')).toContain('| at least one of `full` and `family` |');
    expect(rowEn('WorkRef', 'work')).toContain('| exactly one of `work` and `external` |');
    expect(rowEn('Term', 'duration')).toContain('| if `basis` is `fixed`; not allowed if `basis` is `protectionPeriod` |');
    expect(rowEn('PostTermCollection', 'endDate')).toContain('| if `status` is `date`; otherwise not allowed |');
    expect(rowEn('Party', 'names')).toContain('If `kind` is `organization`, each item has `full` and has no `given` or `family`.');
    expect(rowEn('Party', 'birthDate')).toContain('Personal data.');
    expect(rowEn('Identifier', 'scheme')).toContain('The object is personal data if `scheme` is `TAX_ID` or `NATIONAL_ID`.');
  });

  it('lists every format with its exact pattern, and every link resolves', () => {
    for (const re of Object.values(PATTERNS)) expect(DOC_EN).toContain(`\`${re.source.replaceAll('\\/', '/').replaceAll('|', '\\|')}\``);
    const anchors = new Set([...DOC_EN.matchAll(/^### `([A-Za-z]+)`$/gmu)].map((m) => `#${(m[1] as string).toLowerCase()}`));
    for (const [, target] of DOC_EN.replace(/`[^`\n]*`/gu, '').matchAll(/\]\(([^)]+)\)/gu)) {
      if ((target as string).startsWith('#')) expect(anchors.has(target as string), target).toBe(true);
      else expect(existsSync(join(ROOT, 'docs/en', target as string)), target).toBe(true);
    }
  });

  it('a type or a field without an English translation stops the generator', () => {
    const { 'Share.percent': _dropped, ...rest } = OVERLAY.translations;
    const model = loadModel(JSON.parse(read('schema/src/types.json')) as JsonValue, { ...OVERLAY, translations: rest } as unknown as JsonValue);
    expect(() => generateFieldReference(model, 'en')).toThrow('falta la traducción de Share.percent');
    expect(generateFieldReference(model, 'es')).toBe(DOC);
  });
});
