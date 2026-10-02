/**
 * JDX-DEC-002 (el nombre del archivo) y JDX-DEC-003 a JDX-DEC-005 (la
 * declaración contra el estado del receptor), sobre el ejemplo, y de punta a
 * punta, también con un nombre y un estado que las inundan.
 */
import { describe, expect, it } from 'vitest';
import { DEC_002, DEC_003, DEC_004, DEC_005 } from '../../../../src/rules/core/declaration.js';
import { RULES } from '../../../../src/rules/registry.js';
import { emptyState } from '../../../../src/state/fileStateStore.js';
import type { DeclarationState, Finding, JsonValue, Receipt, State, StateStore } from '../../../../src/types.js';
import { docBuilder, EXAMPLE_NAME } from '../../../helpers/docBuilder.js';
import { measured, omittedOf, resultsOf } from '../../../helpers/flood.js';
import { findingProblems, makeRuleContext, type RuleContextOverrides, testDeps, validateExample } from '../../../helpers/ruleContext.js';

const ID = '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13';
const OTHER_SHA = 'ee53610fc89012e5b1eea19cc3ae8a81932981146afa63920a027d2a42222787';
const RULES_OF_STATE = [DEC_003, DEC_004, DEC_005];

/** Los hallazgos de las cuatro reglas, controlados contra el catálogo. */
async function declaration(overrides: RuleContextOverrides = {}): Promise<Finding[]> {
  const ctx = await makeRuleContext(overrides);
  const found: Finding[] = [];
  for (const rule of [DEC_002, ...RULES_OF_STATE]) found.push(...(await rule.evaluate(ctx, {})));
  expect(findingProblems(found)).toEqual([]);
  return found;
}
const brief = (found: readonly Finding[]) => found.map((f) => [f.ruleId, f.instanceLocation, f.params]);
const reportErrors = (report: unknown) => testDeps().validators.validateAux('report', report as JsonValue);

/** Un estado de sandbox con la entrada de la declaración del ejemplo. */
const withDeclaration = (entry: Partial<DeclarationState>): State => ({ ...emptyState('sandbox'), declarations: { [ID]: { receipts: [], media: [], ...entry } } });
const receipt = (revision: number, sha256: string, ackStatus: Receipt['ackStatus']): Receipt => ({ revision, sha256, receivedAt: '2026-09-29T10:00:00-03:00', ackStatus });
/** Un estado fijo, en memoria: se lee; escribirlo es un error de la prueba. */
const memoryState = (state: State): StateStore => ({
  read: async (fn) => fn(state),
  update: async () => {
    throw new Error('la validación no escribe este estado');
  },
});

describe('DEC-002', () => {
  it('the example has none, with or without state', async () => {
    expect(await declaration()).toEqual([]);
    expect(await declaration({ state: withDeclaration({ owner: 'jupiter' }) })).toEqual([]);
  });

  it('revision 2 named .r7. → DEC-002', async () => {
    const ctx = await makeRuleContext({ fileName: `${ID}.r7.jdx.json` });
    const found = await DEC_002.evaluate(ctx, {});
    expect(findingProblems(found)).toEqual([]);
    expect(brief(found)).toEqual([['JDX-DEC-002', '', { fileName: `${ID}.r7.jdx.json`, expected: EXAMPLE_NAME }]]);
  });

  it('.r02. → DEC-002', async () => {
    const found = await declaration({ document: docBuilder().set('/declaration/revision', 2), fileName: `${ID}.r02.jdx.json` });
    expect(brief(found)).toEqual([['JDX-DEC-002', '', { fileName: `${ID}.r02.jdx.json`, expected: `${ID}.r2.jdx.json` }]]);
    expect(brief(await declaration({ fileName: `${ID}.r01.jdx.json` }))).toEqual([['JDX-DEC-002', '', { fileName: `${ID}.r01.jdx.json`, expected: EXAMPLE_NAME }]]);
  });

  it('uppercase UUID in name → DEC-002', async () => {
    const upper = `${ID.toUpperCase()}.r1.jdx.json`;
    expect(brief(await declaration({ fileName: upper }))).toEqual([['JDX-DEC-002', '', { fileName: upper, expected: EXAMPLE_NAME }]]);
    // La extensión también, en minúscula.
    expect(brief(await declaration({ fileName: `${ID}.r1.JDX.json` }))).toEqual([['JDX-DEC-002', '', { fileName: `${ID}.r1.JDX.json`, expected: EXAMPLE_NAME }]]);
  });

  it('directories in fileName are ignored', async () => {
    for (const fileName of [`entrega/sub/${EXAMPLE_NAME}`, `/data/in/${EXAMPLE_NAME}`, `C:\\entrega\\${EXAMPLE_NAME}`]) {
      expect(await declaration({ fileName }), fileName).toEqual([]);
    }
    // El nombre que se compara, y que se informa, es el nombre base.
    expect(brief(await declaration({ fileName: `entrega/${ID}.r7.jdx.json` }))).toEqual([['JDX-DEC-002', '', { fileName: `${ID}.r7.jdx.json`, expected: EXAMPLE_NAME }]]);
  });

  it('end to end: the example named .r7. reports DEC-002', async () => {
    const report = await validateExample({ fileName: `${ID}.r7.jdx.json` });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-DEC-002', 'JDX-DEC-003', 'JDX-DEC-004', 'JDX-DEC-005').map((r) => [r.ruleId, r.level, r.source, r.instanceLocation, r.message])).toEqual([
      ['JDX-DEC-002', 'error', 'core', '', `El archivo se llama ${ID}.r7.jdx.json; por su contenido debería llamarse ${EXAMPLE_NAME}.`],
    ]);
    expect(report).toMatchObject({ exitCode: 1, disposition: 'reject', checks: { core: 'failed' } });
  });
});

describe('DEC-003 to DEC-005', () => {
  it('same revision other sha → DEC-003 also when the receipt was rejected', async () => {
    for (const ackStatus of ['rejected', 'ignored', 'ingested'] as const) {
      const state = withDeclaration({ receipts: [receipt(2, OTHER_SHA, 'ingested'), receipt(1, OTHER_SHA, ackStatus)] });
      expect(brief(await declaration({ state })), ackStatus).toEqual([['JDX-DEC-003', '/declaration/revision', { revision: 1, sha256: OTHER_SHA }]]);
    }
  });

  it('same revision same sha → no DEC-003', async () => {
    const sha = (await makeRuleContext()).input.sha256;
    expect(await declaration({ state: withDeclaration({ receipts: [receipt(1, sha, 'rejected')] }) })).toEqual([]);
    // Con el mismo y con otro, el otro cuenta: la revisión ya llegó con otro contenido.
    const both = withDeclaration({ receipts: [receipt(1, sha, 'rejected'), receipt(1, OTHER_SHA, 'rejected')] });
    expect(brief(await declaration({ state: both }))).toEqual([['JDX-DEC-003', '/declaration/revision', { revision: 1, sha256: OTHER_SHA }]]);
  });

  it('other owner → DEC-004', async () => {
    expect(brief(await declaration({ state: withDeclaration({ owner: 'otro-emisor' }) }))).toEqual([
      ['JDX-DEC-004', '/declaration/issuer/id', { owner: 'otro-emisor', issuer: 'jupiter' }],
    ]);
  });

  it('revision ≤ lastIngestedRevision → DEC-005 info', async () => {
    for (const last of [1, 3]) {
      expect(brief(await declaration({ state: withDeclaration({ lastIngestedRevision: last }) }))).toEqual([
        ['JDX-DEC-005', '/declaration/revision', { revision: 1, lastIngestedRevision: last }],
      ]);
    }
    // Una revisión mayor que la última cargada se carga.
    const second = { document: docBuilder().set('/declaration/revision', 2), fileName: `${ID}.r2.jdx.json` };
    expect(await declaration({ ...second, state: withDeclaration({ lastIngestedRevision: 1 }) })).toEqual([]);
  });

  it('no state → none', async () => {
    // Sin estado, las tres piden el estado y validateWithDeps no las corre; si se llaman igual, no dan nada.
    for (const rule of RULES_OF_STATE) expect(rule.requires).toEqual(['state']);
    expect(DEC_002.requires).toBeUndefined();
    const ctx = await makeRuleContext();
    expect(ctx.state).toBeNull();
    for (const rule of RULES_OF_STATE) expect(await rule.evaluate(ctx, {})).toEqual([]);
    // Un estado sin la declaración tampoco.
    expect(await declaration({ state: { ...emptyState('sandbox'), declarations: { otra: { receipts: [receipt(1, OTHER_SHA, 'rejected')], media: [], owner: 'otro-emisor', lastIngestedRevision: 9 } } } })).toEqual([]);
  });

  it('end to end: with state, an old revision is ignored and other content is rejected', async () => {
    const ignored = await validateExample({ options: { state: memoryState(withDeclaration({ owner: 'jupiter', lastIngestedRevision: 1 })) } });
    expect(reportErrors(ignored)).toEqual([]);
    expect(resultsOf(ignored, 'JDX-DEC-002', 'JDX-DEC-003', 'JDX-DEC-004', 'JDX-DEC-005').map((r) => [r.ruleId, r.level, r.message])).toEqual([
      ['JDX-DEC-005', 'info', 'La revisión 1 no es posterior a la 1, ya cargada: se ignora.'],
    ]);
    expect(ignored).toMatchObject({ exitCode: 0, disposition: 'ignore', checks: { core: 'passed' } });
    const rejected = await validateExample({
      options: { state: memoryState(withDeclaration({ owner: 'otro-emisor', receipts: [receipt(1, OTHER_SHA, 'rejected')] })) },
    });
    expect(resultsOf(rejected, 'JDX-DEC-002', 'JDX-DEC-003', 'JDX-DEC-004', 'JDX-DEC-005').map((r) => [r.ruleId, r.instanceLocation])).toEqual([['JDX-DEC-003', '/declaration/revision'], ['JDX-DEC-004', '/declaration/issuer/id']]);
    expect(rejected).toMatchObject({ exitCode: 1, disposition: 'reject', checks: { core: 'failed' } });
  });
});

describe('hostile input through validateWithDeps', () => {
  it('registers DEC-002 to DEC-005', () => {
    expect(['JDX-DEC-002', 'JDX-DEC-003', 'JDX-DEC-004', 'JDX-DEC-005'].map((id) => RULES.get(id as Finding['ruleId']))).toEqual([DEC_002, DEC_003, DEC_004, DEC_005]);
  });

  it('a file name of 2 MiB of folders gives one DEC-002, quickly', async () => {
    const fileName = `${'a\\'.repeat(1_048_576)}${ID}.r7.jdx.json`;
    const { report, readBack, ms } = await measured({ fileName });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-DEC-002', 'JDX-DEC-003', 'JDX-DEC-004', 'JDX-DEC-005').map((r) => [r.ruleId, r.params])).toEqual([['JDX-DEC-002', { fileName: `${ID}.r7.jdx.json`, expected: EXAMPLE_NAME }]]);
    expect(readBack).toBe(true);
    expect(ms).toBeLessThan(5_000);
  });

  it('a state with half a million receipts and declarations gives each result once, quickly', async () => {
    const receipts = Array.from({ length: 500_000 }, (_, i) => receipt(i + 2, OTHER_SHA, 'rejected'));
    receipts.push(receipt(1, OTHER_SHA, 'rejected'), receipt(1, OTHER_SHA, 'ingested'));
    const others = Object.fromEntries(Array.from({ length: 500_000 }, (_, i) => [`d${i}`, { receipts: [], media: [] }]));
    const state: State = { ...emptyState('sandbox'), declarations: { ...others, [ID]: { owner: 'otro-emisor', lastIngestedRevision: 7, receipts, media: [] } } };
    const { report, ms } = await measured({ options: { state: memoryState(state) } });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-DEC-002', 'JDX-DEC-003', 'JDX-DEC-004', 'JDX-DEC-005').map((r) => r.ruleId)).toEqual(['JDX-DEC-003', 'JDX-DEC-004', 'JDX-DEC-005']);
    expect(omittedOf(report, 'JDX-DEC-002', 'JDX-DEC-003', 'JDX-DEC-004', 'JDX-DEC-005')).toEqual([]);
    expect(ms).toBeLessThan(5_000);
  });
});
