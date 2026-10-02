/**
 * Los archivos de la entrega sin su carpeta: el texto de cada path
 * (JDX-MED-001), la revisión en que viajó (JDX-MED-004) y el sha256 de los
 * anexos y del depósito (JDX-MED-009), sobre variantes del ejemplo y de punta a
 * punta, también con documentos que las inundan.
 */
import { describe, expect, it } from 'vitest';
import { foldCase, pathProblem } from '../../../../src/media/path.js';
import { MAX_RESULTS_PER_RULE } from '../../../../src/report/results.js';
import { MAX_DOCUMENT_BYTES } from '../../../../src/validate/jsonStage.js';
import { MED_001, MED_004, MED_009 } from '../../../../src/rules/core/media.js';
import { RULES } from '../../../../src/rules/registry.js';
import type { Finding, JsonValue } from '../../../../src/types.js';
import { type DocBuilder, docBuilder } from '../../../helpers/docBuilder.js';
import { type Doc, flood, measured, omittedOf, resultsOf } from '../../../helpers/flood.js';
import { findingProblems, makeRuleContext, testDeps, validateExample } from '../../../helpers/ruleContext.js';

const OTHER_SHA = 'ee53610fc89012e5b1eea19cc3ae8a81932981146afa63920a027d2a42222787';
const MEDIA_CODES = ['JDX-MED-001', 'JDX-MED-004', 'JDX-MED-009'] as const;

/** Los hallazgos de las tres reglas sobre una variante, controlados contra el catálogo. */
async function media(document: DocBuilder = docBuilder()): Promise<Finding[]> {
  const ctx = await makeRuleContext({ document });
  const found = [...(await MED_001.evaluate(ctx, {})), ...(await MED_004.evaluate(ctx, {})), ...(await MED_009.evaluate(ctx, {}))];
  expect(findingProblems(found)).toEqual([]);
  return found;
}
const brief = (found: readonly Finding[]) => found.map((f) => [f.ruleId, f.instanceLocation, f.params, f.context]);
/** MED-001 de un path en el segundo archivo del ejemplo (m2). */
const pathOf = async (path: string) => brief(await media(docBuilder().set('/media/1/path', path)));
const reportErrors = (report: unknown) => testDeps().validators.validateAux('report', report as JsonValue);

describe('MED-001', () => {
  it('the example has none, of the three rules', async () => {
    expect(await media()).toEqual([]);
  });

  it('absolute path', async () => {
    expect(await pathOf('/etc/passwd')).toEqual([['JDX-MED-001', '/media/1/path', { path: '/etc/passwd', reason: 'absolute' }, { media: 'm2' }]]);
  });

  it('.. segment', async () => {
    expect(await pathOf('a/../b.mp3')).toEqual([['JDX-MED-001', '/media/1/path', { path: 'a/../b.mp3', reason: 'segment' }, { media: 'm2' }]]);
    expect(await pathOf('..')).toEqual([['JDX-MED-001', '/media/1/path', { path: '..', reason: 'segment' }, { media: 'm2' }]]);
  });

  it('. segment', async () => {
    expect(await pathOf('./b.mp3')).toEqual([['JDX-MED-001', '/media/1/path', { path: './b.mp3', reason: 'segment' }, { media: 'm2' }]]);
  });

  it('a//b', async () => {
    expect(await pathOf('a//b.mp3')).toEqual([['JDX-MED-001', '/media/1/path', { path: 'a//b.mp3', reason: 'segment' }, { media: 'm2' }]]);
    expect(await pathOf('')).toEqual([['JDX-MED-001', '/media/1/path', { path: '', reason: 'segment' }, { media: 'm2' }]]);
  });

  it('trailing slash', async () => {
    expect(await pathOf('audios/')).toEqual([['JDX-MED-001', '/media/1/path', { path: 'audios/', reason: 'segment' }, { media: 'm2' }]]);
  });

  it('backslash', async () => {
    for (const path of ['audios\\b.mp3', '..\\b.mp3', 'C:\\b.mp3']) {
      expect(await pathOf(path), path).toEqual([['JDX-MED-001', '/media/1/path', { path, reason: 'characters' }, { media: 'm2' }]]);
    }
  });

  it('Canción.pdf', async () => {
    // Una letra con tilde es otro carácter, compuesta (NFC) o descompuesta (NFD).
    for (const path of ['Canción.pdf', 'Cancio\u0301n.pdf']) {
      expect(await pathOf(path), path).toEqual([['JDX-MED-001', '/media/1/path', { path, reason: 'characters' }, { media: 'm2' }]]);
    }
  });

  it('space', async () => {
    expect(await pathOf('Chacarera del Rancho.mp3')).toEqual([['JDX-MED-001', '/media/1/path', { path: 'Chacarera del Rancho.mp3', reason: 'characters' }, { media: 'm2' }]]);
  });

  it('a path with several problems gives one result: absolute, then segment, then characters', async () => {
    expect(await pathOf('/a b/../c')).toEqual([['JDX-MED-001', '/media/1/path', { path: '/a b/../c', reason: 'absolute' }, { media: 'm2' }]]);
    expect(await pathOf('a b/../c')).toEqual([['JDX-MED-001', '/media/1/path', { path: 'a b/../c', reason: 'segment' }, { media: 'm2' }]]);
    // Los segmentos válidos son [A-Za-z0-9._-]: también `...` y `.x`.
    expect(await pathOf('sub/.oculto/.../b-1_2.MP3')).toEqual([]);
  });

  it('duplicate differing in case → MED-001 at the second', async () => {
    expect(await pathOf('00034-001-ctto_2-OBRAS.PDF')).toEqual([
      ['JDX-MED-001', '/media/1/path', { path: '00034-001-ctto_2-OBRAS.PDF', reason: 'duplicate' }, { media: 'm2' }],
    ]);
    // Igual, y una tercera: cada repetición después de la primera.
    const found = await media(docBuilder().set('/media/1/path', '00034-001-CTTO_2-obras.pdf').set('/media/2/path', '00034-001-CTTO_2-OBRAS.pdf'));
    expect(brief(found).map(([, at, params]) => [at, (params as { reason: string }).reason])).toEqual([['/media/1/path', 'duplicate'], ['/media/2/path', 'duplicate']]);
    // Un path inválido no cuenta como repetido de otro: ya tiene su resultado.
    expect(brief(await media(docBuilder().set('/media/1/path', 'a b').set('/media/2/path', 'A B'))).map(([, , params]) => (params as { reason: string }).reason)).toEqual([
      'characters', 'characters',
    ]);
  });

  it('pathProblem and foldCase, the text rules that the delivery folder also uses', () => {
    expect(['a.pdf', 'sub/a.pdf', 'A-1_b.2', '...'].map(pathProblem)).toEqual([null, null, null, null]);
    expect(['/a', '', 'a/', 'a//b', './a', 'a/..', 'a\\b', 'a:b', 'ñ', 'a\u0000b'].map(pathProblem)).toEqual([
      'absolute', 'segment', 'segment', 'segment', 'segment', 'segment', 'characters', 'characters', 'characters', 'characters',
    ]);
    // Solo de A a Z: otras letras no se pliegan (el signo de kelvin no es una k).
    expect([foldCase('Sub/A.PDF'), foldCase('\u212A.pdf'), foldCase('Ñ.pdf')]).toEqual(['sub/a.pdf', '\u212A.pdf', 'Ñ.pdf']);
  });

  it('end to end: MED-001 counts in core', async () => {
    const report = await validateExample({ document: docBuilder().set('/media/1/path', 'Chacarera del Rancho.mp3') });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, ...MEDIA_CODES).map((r) => [r.ruleId, r.level, r.source, r.instanceLocation, r.context, r.message])).toEqual([
      ['JDX-MED-001', 'error', 'core', '/media/1/path', { media: 'm2' }, 'La ruta Chacarera del Rancho.mp3 usa caracteres fuera de A-Z, a-z, 0-9, punto, guion y guion bajo.'],
    ]);
    expect(report).toMatchObject({ exitCode: 1, checks: { core: 'failed', media: 'notEvaluated' } });
  });
});

describe('MED-004 and MED-009', () => {
  it('delivery above revision → MED-004', async () => {
    expect(brief(await media(docBuilder().set('/media/0/delivery', 2)))).toEqual([
      ['JDX-MED-004', '/media/0/delivery', { delivery: 2, revision: 1 }, { media: 'm1' }],
    ]);
    // Igual a la revisión, o anterior, vale.
    expect(await media(docBuilder().set('/declaration/revision', 3).set('/media/0/delivery', 3).set('/media/1/delivery', 2))).toEqual([]);
  });

  it('annexed sha mismatch → MED-009', async () => {
    // El context es el archivo al que apunta el anexo, no el que lo contiene.
    expect(brief(await media(docBuilder().set('/media/0/evidence/annexed/0/sha256', OTHER_SHA)))).toEqual([
      ['JDX-MED-009', '/media/0/evidence/annexed/0/sha256', undefined, { media: 'm2' }],
    ]);
  });

  it('deposit sha mismatch → MED-009', async () => {
    expect(brief(await media(docBuilder().set('/edition/deposit/sha256', OTHER_SHA)))).toEqual([
      ['JDX-MED-009', '/edition/deposit/sha256', undefined, { media: 'm3' }],
    ]);
  });

  it('annexed without media not checked', async () => {
    expect(await media(docBuilder().remove('/media/0/evidence/annexed/0/media').set('/media/0/evidence/annexed/0/sha256', OTHER_SHA))).toEqual([]);
    // Tampoco el depósito sin copy, ni un archivo sin sha256.
    expect(await media(docBuilder().remove('/edition/deposit/copy').set('/edition/deposit/sha256', OTHER_SHA))).toEqual([]);
    expect(await media(docBuilder().remove('/media/1/sha256').set('/media/0/evidence/annexed/0/sha256', OTHER_SHA))).toEqual([]);
  });

  it('a reference that does not resolve is not evaluated: it has its JDX-REF-002', async () => {
    const report = await validateExample({ document: docBuilder().set('/media/0/evidence/annexed/0/media', 'm9').set('/media/0/evidence/annexed/0/sha256', OTHER_SHA) });
    expect(resultsOf(report, 'JDX-REF-002', ...MEDIA_CODES).map((r) => [r.ruleId, r.instanceLocation])).toEqual([['JDX-REF-002', '/media/0/evidence/annexed/0/media']]);
  });

  it('delivered false without path is fine', async () => {
    expect(await media(docBuilder().set('/media/4', { id: 'm5', kind: 'societyForm', delivered: false }))).toEqual([]);
  });

  it('end to end: MED-004 and MED-009 count in core', async () => {
    const report = await validateExample({ document: docBuilder().set('/media/2/delivery', 4).set('/edition/deposit/sha256', OTHER_SHA) });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, ...MEDIA_CODES).map((r) => [r.ruleId, r.source, r.instanceLocation, r.message])).toEqual([
      ['JDX-MED-004', 'core', '/media/2/delivery', 'El archivo m3 dice que viajó en la revisión 4, posterior a esta (1).'],
      ['JDX-MED-009', 'core', '/edition/deposit/sha256', 'El sha256 no coincide con el del archivo m3.'],
    ]);
    expect(report).toMatchObject({ exitCode: 1, checks: { core: 'failed', media: 'notEvaluated' } });
  });
});

describe('hostile input through validateWithDeps', () => {
  /** Un archivo mínimo con un id de 6 caracteres que no se repite: todos los ítems tienen el mismo largo. */
  const mediaItem = (more: string) => (i: number) => `{"id":"m${i.toString(36).padStart(5, '0')}","kind":"audio",${more}}`;
  /** El ejemplo sin sus archivos ni las referencias a ellos, para poner otros. */
  const withoutMedia = (d: Doc): void => {
    delete (d.edition as Doc).deposit;
    delete (d.edition as Doc).media;
    delete (d.recordings as Doc[])[0]!.media;
    delete (d.agreements as Doc[])[0]!.media;
  };
  const mediaFlood = (more: string) => flood((d, marker) => {
    withoutMedia(d);
    d.media = marker;
  }, mediaItem(more));

  it('registers MED-001, MED-004 and MED-009', () => {
    expect([RULES.get('JDX-MED-001'), RULES.get('JDX-MED-004'), RULES.get('JDX-MED-009')]).toEqual([MED_001, MED_004, MED_009]);
  });

  it('a MED-001 flood of invalid paths, about 2 MiB, lists 100 and counts the rest, quickly', async () => {
    const { text, count } = mediaFlood('"path":"a b"');
    const { report, chars, readBack, ms } = await measured({ document: text });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, ...MEDIA_CODES).map((r) => [r.ruleId, r.instanceLocation])).toEqual(Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => ['JDX-MED-001', `/media/${i}/path`]));
    expect(omittedOf(report, ...MEDIA_CODES)).toEqual([{ ruleId: 'JDX-MED-001', count: count - MAX_RESULTS_PER_RULE }]);
    expect(report.summary.error).toBe(count);
    expect(count).toBeGreaterThan(40_000);
    expect([chars < 100_000, readBack]).toEqual([true, true]);
    expect(ms).toBeLessThan(5_000);
  });

  it('a MED-001 flood of case variants of one path, about 2 MiB, gives one duplicate for each after the first', async () => {
    const { text, count } = mediaFlood('"path":"A.pdf"');
    const { report, ms } = await measured({ document: text });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, ...MEDIA_CODES)[0]).toMatchObject({ ruleId: 'JDX-MED-001', instanceLocation: '/media/1/path', params: { path: 'A.pdf', reason: 'duplicate' } });
    expect(omittedOf(report, ...MEDIA_CODES)).toEqual([{ ruleId: 'JDX-MED-001', count: count - 1 - MAX_RESULTS_PER_RULE }]);
    expect(report.summary.error).toBe(count - 1);
    expect(ms).toBeLessThan(5_000);
  });

  it('paths longer than V8 hashes, of the same length, are compared in time', async () => {
    // Con más de 16 383 caracteres V8 hashea un texto por su largo: cada uno se compara con los del mismo largo.
    // 120 paths de 16 406 caracteres que difieren al final (casi 2 MiB); el último repite el primero.
    const n = 120;
    const long = (i: number) => `${'a'.repeat(16_400)}${String(i).padStart(6, '0')}`;
    const doc = JSON.parse(docBuilder().text) as Doc;
    withoutMedia(doc);
    doc.media = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, kind: 'audio', path: long(i % (n - 1)) }));
    const { report, ms } = await measured({ document: JSON.stringify(doc) });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, ...MEDIA_CODES).map((r) => [r.ruleId, r.instanceLocation, (r.params as { reason: string }).reason])).toEqual([
      ['JDX-MED-001', `/media/${n - 1}/path`, 'duplicate'],
    ]);
    expect(ms).toBeLessThan(5_000);
  });

  it('one path as long as the input gives one result, quickly', async () => {
    // Un millón de segmentos válidos y el último con un espacio.
    const document = docBuilder().set('/media/1/path', `${'a/'.repeat(1_000_000)}b c`);
    expect(document.bytes().length).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
    const { report, ms } = await measured({ document });
    expect(resultsOf(report, ...MEDIA_CODES).map((r) => [r.ruleId, (r.params as { reason: string }).reason])).toEqual([['JDX-MED-001', 'characters']]);
    expect(ms).toBeLessThan(5_000);
  });

  it('a MED-004 flood, about 2 MiB, lists 100 and counts the rest, quickly', async () => {
    const { text, count } = mediaFlood('"delivery":9');
    const { report, chars, ms } = await measured({ document: text });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, ...MEDIA_CODES).map((r) => r.instanceLocation)).toEqual(Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => `/media/${i}/delivery`));
    expect(omittedOf(report, ...MEDIA_CODES)).toEqual([{ ruleId: 'JDX-MED-004', count: count - MAX_RESULTS_PER_RULE }]);
    expect(chars).toBeLessThan(100_000);
    expect(ms).toBeLessThan(5_000);
  });

  it('a MED-009 flood of annexes, about 2 MiB, lists 100 and counts the rest, quickly', async () => {
    const { text, count } = flood((d, marker) => {
      ((d.media as Doc[])[0]!.evidence as Doc).annexed = marker;
    }, `{"media":"m2","sha256":"${OTHER_SHA}"}`);
    const { report, chars, ms } = await measured({ document: text });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, ...MEDIA_CODES).map((r) => [r.instanceLocation, r.context])).toEqual(
      Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => [`/media/0/evidence/annexed/${i}/sha256`, { media: 'm2' }]),
    );
    expect(omittedOf(report, ...MEDIA_CODES)).toEqual([{ ruleId: 'JDX-MED-009', count: count - MAX_RESULTS_PER_RULE }]);
    expect(chars).toBeLessThan(100_000);
    expect(ms).toBeLessThan(5_000);
  });
});
