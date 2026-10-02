/**
 * JDX-VER-004: un valor de una lista abierta que no está en su archivo de
 * valores, o que el archivo da solo para otros esquemas que el `scheme` del
 * mismo objeto, sobre variantes del ejemplo y de punta a punta, también con un
 * documento que la inunda.
 */
import { describe, expect, it } from 'vitest';
import { MAX_RESULTS_PER_RULE } from '../../../../src/report/results.js';
import { VER_004 } from '../../../../src/rules/core/openLists.js';
import { RULES } from '../../../../src/rules/registry.js';
import type { Finding, JsonValue, OpenValueList, ValueLists } from '../../../../src/types.js';
import { type DocBuilder, docBuilder } from '../../../helpers/docBuilder.js';
import { type Doc, flood, measured, omittedOf, resultsOf } from '../../../helpers/flood.js';
import { findingProblems, findingsOf, makeRuleContext, type RuleContextOverrides, testDeps, validateExample } from '../../../helpers/ruleContext.js';

/** Los hallazgos de la regla sobre una variante, controlados contra el catálogo. */
async function openLists(document: DocBuilder = docBuilder(), more: RuleContextOverrides = {}): Promise<Finding[]> {
  const found = findingsOf(await VER_004.evaluate(await makeRuleContext({ document, ...more }), {}));
  expect(findingProblems(found)).toEqual([]);
  return found;
}
const brief = (found: readonly Finding[]) => found.map((f) => [f.instanceLocation, f.params, f.context]);
const reportErrors = (report: unknown) => testDeps().validators.validateAux('report', report as JsonValue);

describe('VER-004', () => {
  it('the example has none', async () => {
    expect(await openLists()).toEqual([]);
  });

  it('unknown title type → VER-004 warning', async () => {
    expect(brief(await openLists(docBuilder().set('/works/0/titles/0/type', 'workingTitle')))).toEqual([
      ['/works/0/titles/0/type', { list: 'titleTypes', value: 'workingTitle' }, { work: 'w1' }],
    ]);
  });

  it('X_ values skipped', async () => {
    const found = await openLists(
      docBuilder()
        .set('/works/0/titles/0/type', 'X_JUPITER_WORKING')
        .set('/media/1/kind', 'X_JUPITER_STEM')
        .set('/works/0/identifiers/0/scheme', 'X_SADAIC_LEGACY_ID')
        .set('/works/0/contributors/0/roles/1', 'X_JUPITER_PRODUCER'),
    );
    expect(found).toEqual([]);
  });

  it('SADAIC_ART8 as classification scheme → VER-004', async () => {
    const found = await openLists(docBuilder().set('/works/0/classifications', [{ scheme: 'SADAIC_ART8', code: '311', name: 'CHACARERA' }]));
    expect(brief(found)).toEqual([['/works/0/classifications/0/scheme', { list: 'classificationSchemes', value: 'SADAIC_ART8' }, { work: 'w1' }]]);
  });

  it('non-X_ instrument scheme → VER-004', async () => {
    // instrumentSchemes está vacía: solo valen los esquemas propios.
    const found = await openLists(
      docBuilder()
        .set('/works/1/instrumentation', { instruments: [{ scheme: 'MIMO', code: 'guitar' }, { scheme: 'X_JUPITER_INSTRUMENT', code: 'guitar' }] })
        .set('/recordings/0/performers', [{ party: 'p1', instruments: [{ scheme: 'MIMO', code: 'bombo' }] }]),
    );
    expect(brief(found)).toEqual([
      ['/works/1/instrumentation/instruments/0/scheme', { list: 'instrumentSchemes', value: 'MIMO' }, { work: 'w2' }],
      ['/recordings/0/performers/0/instruments/0/scheme', { list: 'instrumentSchemes', value: 'MIMO' }, { recording: 'r1' }],
    ]);
  });

  it('CUIT under NATIONAL_ID → VER-004', async () => {
    // El tipo está en identifierTypes, pero su archivo lo da para TAX_ID: params.scheme dice para cuál no está.
    const found = await openLists(docBuilder().set('/parties/0/identifiers/1/scheme', 'NATIONAL_ID'));
    expect(brief(found)).toEqual([['/parties/0/identifiers/1/type', { list: 'identifierTypes', value: 'CUIT', scheme: 'NATIONAL_ID' }, { party: 'p1' }]]);
    // DNI bajo NATIONAL_ID y CUIT bajo TAX_ID (el ejemplo) pasan.
    expect(await openLists(docBuilder().set('/parties/0/identifiers/1', { scheme: 'NATIONAL_ID', country: 'AR', type: 'DNI', value: '27123456' }))).toEqual([]);
  });

  it('with an X_ scheme the type is not checked against its schemes; with an unknown scheme, both values are', async () => {
    expect(await openLists(docBuilder().set('/parties/0/identifiers/1/scheme', 'X_JUPITER_TAX'))).toEqual([]);
    expect(brief(await openLists(docBuilder().set('/parties/0/identifiers/1/scheme', 'FISCAL')))).toEqual([
      ['/parties/0/identifiers/1/scheme', { list: 'identifierSchemes', value: 'FISCAL' }, { party: 'p1' }],
      ['/parties/0/identifiers/1/type', { list: 'identifierTypes', value: 'CUIT', scheme: 'FISCAL' }, { party: 'p1' }],
    ]);
    // Un tipo que no está en la lista no lleva scheme: no está para ninguno.
    expect(brief(await openLists(docBuilder().set('/parties/0/identifiers/1/type', 'NIF')))).toEqual([
      ['/parties/0/identifiers/1/type', { list: 'identifierTypes', value: 'NIF' }, { party: 'p1' }],
    ]);
  });

  it('every kind of place is read, with the context of its root object or none', async () => {
    const found = await openLists(
      docBuilder()
        .set('/edition/type', 'zine')
        .set('/media/2/kind', 'ebook')
        .set('/recordings/0/purposes/0', 'teaser')
        .set('/works/1/contributors/1/roles/0', 'beatmaker')
        .set('/agreements/0/terms/basedOn/scheme', 'OTHER_CONTRACT'),
    );
    expect(brief(found)).toEqual([
      ['/works/1/contributors/1/roles/0', { list: 'contributorRoles', value: 'beatmaker' }, { work: 'w2' }],
      ['/recordings/0/purposes/0', { list: 'recordingPurposes', value: 'teaser' }, { recording: 'r1' }],
      ['/agreements/0/terms/basedOn/scheme', { list: 'contractTemplateSchemes', value: 'OTHER_CONTRACT' }, { agreement: 'a1' }],
      ['/media/2/kind', { list: 'mediaKinds', value: 'ebook' }, { media: 'm3' }],
      ['/edition/type', { list: 'editionTypes', value: 'zine' }, undefined],
    ]);
  });

  it('the lists are those of the validation: a value list that adds the code accepts it', async () => {
    const values = testDeps().values;
    const titleTypes = values.open.get('titleTypes') as OpenValueList;
    const open = new Map(values.open);
    open.set('titleTypes', { ...titleTypes, values: [...titleTypes.values, { code: 'workingTitle' }] });
    const more: ValueLists = { ...values, open };
    expect(await openLists(docBuilder().set('/works/0/titles/0/type', 'workingTitle'), { values: more })).toEqual([]);
    // Una lista que falta es un error del empaquetado, no un aviso por cada valor.
    const without = new Map(values.open);
    without.delete('titleTypes');
    const ctx = await makeRuleContext({ values: { ...values, open: without } });
    expect(() => VER_004.evaluate(ctx, {})).toThrow('titleTypes: no está en las listas de valores');
  });

  it('end to end: an unknown title type is a core warning in the schema bucket', async () => {
    const report = await validateExample({ document: docBuilder().set('/works/0/titles/0/type', 'workingTitle') });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-VER-004').map((r) => [r.level, r.source, r.instanceLocation, r.context, r.message])).toEqual([
      ['warning', 'core', '/works/0/titles/0/type', { work: 'w1' }, 'El valor workingTitle no está en la lista titleTypes.'],
    ]);
    expect(report).toMatchObject({ valid: true, exitCode: 0, checks: { schema: 'warning', core: 'passed' } });
    // Con failOn warning, el aviso rechaza.
    expect(await validateExample({ document: docBuilder().set('/works/0/titles/0/type', 'workingTitle'), options: { failOn: 'warning' } })).toMatchObject({
      exitCode: 1, disposition: 'reject',
    });
  });

  it('end to end: a type of another scheme names the scheme in the message', async () => {
    // El valor está en la lista: lo que no está es para ese esquema.
    const document = docBuilder().set('/parties/0/identifiers/1/scheme', 'NATIONAL_ID');
    const messages = await Promise.all((['es', 'pt', 'en'] as const).map(async (lang) => resultsOf(await validateExample({ document, options: { lang } }), 'JDX-VER-004').map((r) => r.message)));
    expect(messages).toEqual([
      ['El valor CUIT no está en la lista identifierTypes para el esquema NATIONAL_ID.'],
      ['O valor CUIT não está na lista identifierTypes para o esquema NATIONAL_ID.'],
      ['Value CUIT is not in list identifierTypes for scheme NATIONAL_ID.'],
    ]);
  });
});

describe('hostile input through validateWithDeps', () => {
  it('registers VER-004', () => {
    expect(RULES.get('JDX-VER-004')).toBe(VER_004);
  });

  it('a VER-004 flood of roles, about 2 MiB, lists 100 and counts the rest, quickly', async () => {
    const { text, count } = flood((d, marker) => {
      ((d.works as Doc[])[0]!.contributors as Doc[])[0]!.roles = marker;
    }, '"zz"');
    const { report, chars, readBack, ms } = await measured({ document: text });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-VER-004').map((r) => r.instanceLocation)).toEqual(
      Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => `/works/0/contributors/0/roles/${i}`),
    );
    expect(omittedOf(report, 'JDX-VER-004')).toEqual([{ ruleId: 'JDX-VER-004', count: count - MAX_RESULTS_PER_RULE }]);
    expect(report).toMatchObject({ exitCode: 0, checks: { schema: 'warning' }, summary: { error: 0 } });
    expect(count).toBeGreaterThan(400_000);
    expect([chars < 100_000, readBack]).toEqual([true, true]);
    expect(ms).toBeLessThan(5_000);
  });

  it('a flood of identifiers of another scheme, about 2 MiB, lists 100 and counts the rest, quickly', async () => {
    const { text, count } = flood((d, marker) => {
      (d.parties as Doc[])[0]!.identifiers = marker;
    }, '{"scheme":"NATIONAL_ID","country":"AR","type":"CUIT","value":"1"}');
    const { report, ms } = await measured({ document: text });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-VER-004')[0]).toMatchObject({ instanceLocation: '/parties/0/identifiers/0/type', params: { list: 'identifierTypes', value: 'CUIT', scheme: 'NATIONAL_ID' } });
    expect(omittedOf(report, 'JDX-VER-004')).toEqual([{ ruleId: 'JDX-VER-004', count: count - MAX_RESULTS_PER_RULE }]);
    expect(ms).toBeLessThan(5_000);
  });

  it('forty thousand minimal works walk the 74 places of the open lists in time', async () => {
    // Cada lugar baja por su camino: el costo crece con los lugares que comparten un prefijo, no con el cuadrado.
    const { text, count } = flood((d, marker) => {
      d.works = marker;
      delete (d.edition as Doc).works;
      delete (d.recordings as Doc[])[0]!.works;
      for (const agreement of d.agreements as Doc[]) delete agreement.works;
    }, (i) => `{"id":"w${i.toString(36).padStart(5, '0')}","titles":[{"type":"zz","text":""}]}`);
    const { report, ms } = await measured({ document: text });
    expect(reportErrors(report)).toEqual([]);
    expect(omittedOf(report, 'JDX-VER-004')).toEqual([{ ruleId: 'JDX-VER-004', count: count - MAX_RESULTS_PER_RULE }]);
    expect(count).toBeGreaterThan(30_000);
    expect(ms).toBeLessThan(5_000);
  });
});
