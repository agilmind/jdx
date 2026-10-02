/**
 * JDX-NUM-001 (el texto de cada porcentaje) y JDX-NUM-002 (fechas e instantes
 * que no existen en el calendario), sobre variantes del ejemplo, y las dos de
 * punta a punta, también con un documento que las inunda.
 */
import { describe, expect, it } from 'vitest';
import { MAX_RESULTS_PER_RULE } from '../../../../src/report/results.js';
import { NUM_001, NUM_002 } from '../../../../src/rules/core/numbers.js';
import { RULES } from '../../../../src/rules/registry.js';
import type { Finding, JsonValue } from '../../../../src/types.js';
import { type DocBuilder, docBuilder } from '../../../helpers/docBuilder.js';
import { type Doc, flood, measured, omittedOf, resultsOf } from '../../../helpers/flood.js';
import { findingProblems, makeRuleContext, testDeps, validateExample } from '../../../helpers/ruleContext.js';

/** Los hallazgos de las dos reglas sobre una variante, controlados contra el catálogo. */
async function numbers(document: DocBuilder = docBuilder()): Promise<Finding[]> {
  const ctx = await makeRuleContext({ document });
  const found = [...(await NUM_001.evaluate(ctx, {})), ...(await NUM_002.evaluate(ctx, {}))];
  expect(findingProblems(found)).toEqual([]);
  return found;
}
const brief = (found: readonly Finding[]) => found.map((f) => [f.ruleId, f.instanceLocation, f.params?.text, f.context]);
const reportErrors = (report: unknown) => testDeps().validators.validateAux('report', report as JsonValue);

describe('NUM-001', () => {
  it('the example has none, of either rule', async () => {
    expect(await numbers()).toEqual([]);
  });

  it('33.33333 → NUM-001', async () => {
    expect(brief(await numbers(docBuilder().setRaw('/works/0/authorship/0/percent', '33.33333')))).toEqual([
      ['JDX-NUM-001', '/works/0/authorship/0/percent', '33.33333', { work: 'w1' }],
    ]);
  });

  it('1e1 and 1E1 → NUM-001', async () => {
    const found = await numbers(docBuilder().setRaw('/works/0/shares/0/percent', '1e1').setRaw('/works/1/shares/1/percent', '1E1'));
    expect(brief(found)).toEqual([
      ['JDX-NUM-001', '/works/0/shares/0/percent', '1e1', { work: 'w1' }],
      ['JDX-NUM-001', '/works/1/shares/1/percent', '1E1', { work: 'w2' }],
    ]);
  });

  it('-0 → NUM-001', async () => {
    expect(brief(await numbers(docBuilder().setRaw('/agreements/0/publisherShare/percent', '-0')))).toEqual([
      ['JDX-NUM-001', '/agreements/0/publisherShare/percent', '-0', { agreement: 'a1' }],
    ]);
    expect(brief(await numbers(docBuilder().setRaw('/agreements/0/publisherShare/percent', '-0.0')))).toEqual([
      ['JDX-NUM-001', '/agreements/0/publisherShare/percent', '-0.0', { agreement: 'a1' }],
    ]);
  });

  it('100.0000 passes', async () => {
    for (const text of ['100.0000', '100', '0', '0.5', '99.9999', '12.50']) {
      expect(await numbers(docBuilder().setRaw('/works/0/authorship/0/percent', text)), text).toEqual([]);
    }
    expect(brief(await numbers(docBuilder().setRaw('/works/0/authorship/0/percent', '100.00000')))).toEqual([
      ['JDX-NUM-001', '/works/0/authorship/0/percent', '100.00000', { work: 'w1' }],
    ]);
  });

  it('retailPricePercent is covered', async () => {
    // Y los otros dos lugares que el ejemplo no usa en una variante: arrangementRetailPricePercent y los productores.
    const found = await numbers(
      docBuilder()
        .setRaw('/agreements/0/terms/values/retailPricePercent', '20.00000')
        .setRaw('/agreements/0/terms/values/arrangementRetailPricePercent', '1E1')
        .setRaw('/recordings/0/producers', '[{ "party": "p5", "percent": 5e0 }]'),
    );
    expect(brief(found)).toEqual([
      ['JDX-NUM-001', '/recordings/0/producers/0/percent', '5e0', { recording: 'r1' }],
      ['JDX-NUM-001', '/agreements/0/terms/values/retailPricePercent', '20.00000', { agreement: 'a1' }],
      ['JDX-NUM-001', '/agreements/0/terms/values/arrangementRetailPricePercent', '1E1', { agreement: 'a1' }],
    ]);
  });

  it('end to end: the example with a 5-decimal percent reports NUM-001', async () => {
    const report = await validateExample({ document: docBuilder().setRaw('/works/0/shares/0/percent', '12.50001') });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-NUM-001', 'JDX-NUM-002')).toEqual([{
      ruleId: 'JDX-NUM-001', level: 'error', source: 'core', instanceLocation: '/works/0/shares/0/percent', context: { work: 'w1' },
      message: 'El porcentaje 12.50001 no está bien escrito: hasta 4 decimales, sin exponente ni -0.', params: { text: '12.50001' },
    }]);
    expect(report).toMatchObject({ valid: false, disposition: 'reject', exitCode: 1, checks: { core: 'failed', schema: 'passed' } });
  });
});

describe('NUM-002', () => {
  it('2026-02-30 → NUM-002', async () => {
    const found = await numbers(
      docBuilder().set('/agreements/0/signatureDate', '2026-02-30').set('/parties/0/birthDate', '2025-02-29').set('/parties/1/birthDate', '2024-02-29'),
    );
    expect(brief(found)).toEqual([
      ['JDX-NUM-002', '/parties/0/birthDate', '2025-02-29', { party: 'p1' }],
      ['JDX-NUM-002', '/agreements/0/signatureDate', '2026-02-30', { agreement: 'a1' }],
    ]);
  });

  it('instant hour 25 → NUM-002', async () => {
    const found = await numbers(
      docBuilder()
        .set('/declaration/createdAt', '2026-09-12T25:00:00-03:00')
        // El segundo 60 vale solo en el último minuto del día UTC.
        .set('/media/0/evidence/signers/0/signedAt', '2026-09-11T10:02:60-03:00')
        .set('/media/0/evidence/signers/1/signedAt', '2026-06-30T20:59:60-03:00'),
    );
    expect(brief(found)).toEqual([
      ['JDX-NUM-002', '/declaration/createdAt', '2026-09-12T25:00:00-03:00', undefined],
      ['JDX-NUM-002', '/media/0/evidence/signers/0/signedAt', '2026-09-11T10:02:60-03:00', { media: 'm1' }],
    ]);
  });

  it('a date of the edition or the declaration carries no context', async () => {
    expect(brief(await numbers(docBuilder().set('/edition/publicationDate', '2026-13-01')))).toEqual([
      ['JDX-NUM-002', '/edition/publicationDate', '2026-13-01', undefined],
    ]);
  });

  it('dates inside extensions are ignored', async () => {
    // También los porcentajes: en una extensión, ni el nombre ni el lugar dicen qué es un dato.
    const found = await numbers(
      docBuilder()
        .setRaw('/works/0/extensions', '{ "ar.example.x": { "creationDate": "2026-02-30", "percent": 1e1 } }')
        .setRaw('/extensions', '{ "ar.example.x": [{ "birthDate": "2026-02-30", "signedAt": "2026-09-12T25:00:00Z" }] }'),
    );
    expect(found).toEqual([]);
  });

  it('end to end: an impossible date is an error in core', async () => {
    const report = await validateExample({ document: docBuilder().set('/works/1/creationDate', '2026-02-30') });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-NUM-001', 'JDX-NUM-002').map((r) => [r.ruleId, r.level, r.source, r.instanceLocation, r.context, r.message])).toEqual([
      ['JDX-NUM-002', 'error', 'core', '/works/1/creationDate', { work: 'w2' }, 'La fecha 2026-02-30 no existe en el calendario.'],
    ]);
    expect(report).toMatchObject({ exitCode: 1, checks: { core: 'failed' } });
  });
});

describe('hostile input through validateWithDeps', () => {
  it('registers NUM-001 and NUM-002', () => {
    expect([RULES.get('JDX-NUM-001'), RULES.get('JDX-NUM-002')]).toEqual([NUM_001, NUM_002]);
  });

  it('a NUM-001 flood, about 2 MiB, lists 100 and counts the rest, quickly', async () => {
    const { text, count } = flood((d, marker) => {
      (d.works as Doc[])[0]!.authorship = marker;
    }, '{"party":"p1","part":"music","percent":-0}');
    const { report, chars, readBack, ms } = await measured({ document: text });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-NUM-001').map((r) => [r.ruleId, r.instanceLocation])).toEqual(
      Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => ['JDX-NUM-001', `/works/0/authorship/${i}/percent`]),
    );
    expect(omittedOf(report, 'JDX-NUM-001')).toEqual([{ ruleId: 'JDX-NUM-001', count: count - MAX_RESULTS_PER_RULE }]);
    expect(report).toMatchObject({ exitCode: 1, summary: { error: count }, checks: { core: 'failed' } });
    expect(count).toBeGreaterThan(45_000);
    expect([chars < 100_000, readBack]).toEqual([true, true]);
    expect(ms).toBeLessThan(5_000);
  });

  it('a NUM-002 flood, about 2 MiB, lists 100 and counts the rest, quickly', async () => {
    const { text, count } = flood((d, marker) => {
      (d.parties as Doc[])[0]!.affiliations = marker;
    }, '{"society":"061","startDate":"2026-02-30"}');
    const { report, chars, readBack, ms } = await measured({ document: text });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-NUM-002').map((r) => [r.ruleId, r.instanceLocation, r.context])).toEqual(
      Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => ['JDX-NUM-002', `/parties/0/affiliations/${i}/startDate`, { party: 'p1' }]),
    );
    expect(omittedOf(report, 'JDX-NUM-002')).toEqual([{ ruleId: 'JDX-NUM-002', count: count - MAX_RESULTS_PER_RULE }]);
    expect(report).toMatchObject({ exitCode: 1, summary: { error: count } });
    expect(count).toBeGreaterThan(45_000);
    expect([chars < 100_000, readBack]).toEqual([true, true]);
    expect(ms).toBeLessThan(5_000);
  });

  it('numbers under a key as long as the input are never read, and cost nothing', async () => {
    // Un millón de números debajo de una clave de 1 MB de una extensión: los porcentajes se buscan por sus lugares.
    const key = 'k'.repeat(1_000_000);
    const { text } = flood((d, marker) => {
      d.extensions = { 'ar.example.x': { [key]: marker } };
    }, '1');
    const { report, ms } = await measured({ document: text });
    expect(reportErrors(report)).toEqual([]);
    expect([report.exitCode, resultsOf(report, 'JDX-NUM-001', 'JDX-NUM-002')]).toEqual([0, []]);
    expect(ms).toBeLessThan(5_000);
  });
});
