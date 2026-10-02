/**
 * El recorrido entero de validateWithDeps: el entorno, el JSON, la versión y
 * el schema, el índice del documento y las reglas del registro, y el reporte.
 * Con el registro vacío, el ejemplo pasa sin resultados; con reglas de
 * prueba, sus hallazgos llegan al reporte con su fuente, su nivel y su
 * mensaje. También los helpers de los tests de reglas: makeRuleContext,
 * findingProblems, validateExample y docBuilder.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseJson } from '../../../src/json/parse.js';
import { MAX_RESULTS_PER_RULE } from '../../../src/report/results.js';
import { RULES, ruleMap } from '../../../src/rules/registry.js';
import { emptyState } from '../../../src/state/fileStateStore.js';
import { defaultDeps } from '../../../src/validate/deps.js';
import { MAX_DOCUMENT_BYTES } from '../../../src/validate/jsonStage.js';
import type { Finding, JsonValue, MediaResolver, Report, Rule, RuleContext, State, StateStore, ValidatorDeps } from '../../../src/types.js';
import { type DocBuilder, docBuilder, EXAMPLE_NAME, exampleText } from '../../helpers/docBuilder.js';
import { type ExampleRun, findingProblems, makeRuleContext, RECEIVED_AT, testDeps, validateExample } from '../../helpers/ruleContext.js';
import { validateWithDeps } from '../../../src/validate/validate.js';
import { sadaicProfile } from '../../helpers/sadaicProfile.js';
import { signTestTrustList, TEST_NOW, TEST_ROOT_KEYS, trustListExample } from '../../helpers/trustFixtures.js';

const deps = testDeps();
const reportErrors = (report: Report) => deps.validators.validateAux('report', report as unknown as JsonValue);

/** Un estado fijo, en memoria. */
const memoryState = (state: State): StateStore => ({
  read: async (fn) => fn(state),
  update: async () => {
    throw new Error('validateWithDeps no escribe el estado');
  },
});
/** Una carpeta de la entrega vacía. */
const emptyDir: MediaResolver = {
  async *list() {},
  stat: async () => null,
  sha256: async () => {
    throw new Error('no hay archivos');
  },
};

interface FakeRule extends Rule { calls: unknown[] }
/** Una regla de prueba: un hallazgo por obra, con esos params, salvo las obras que `skip` deja afuera. */
function perWork(
  id: Rule['id'],
  more: { requires?: Rule['requires']; params?: { [k: string]: JsonValue }; none?: boolean; skip?: (ctx: RuleContext, pointer: string) => boolean } = {},
): FakeRule {
  const calls: unknown[] = [];
  return {
    id,
    ...(more.requires === undefined ? {} : { requires: more.requires }),
    calls,
    evaluate(ctx, params) {
      calls.push(params);
      if (more.none === true) return [];
      const works = (ctx.doc.works ?? []) as readonly { id: string }[];
      return works.flatMap((w, i): Finding[] => (more.skip?.(ctx, `/works/${i}`) === true ? [] : [{
        ruleId: id, instanceLocation: `/works/${i}`, context: { work: w.id }, ...(more.params === undefined ? {} : { params: more.params }),
      }]));
    },
  };
}

describe('validateWithDeps', () => {
  it('the example with an empty registry → exit 0, signature absent, media notEvaluated', async () => {
    const report = await validateExample({ deps: { rules: ruleMap([]) } });
    expect(reportErrors(report)).toEqual([]);
    expect(report).toMatchObject({
      jdxReport: '1.0', valid: true, disposition: 'ingest', exitCode: 0,
      validator: { name: 'jdx', version: deps.validatorVersion, catalog: '1.0' },
      options: { env: 'sandbox', profile: 'sadaic/0.1', signature: 'optional', failOn: 'error', receivedAt: RECEIVED_AT, dir: false, lang: 'es' },
      appliedProfiles: ['https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.0'],
      checks: { environment: 'passed', json: 'passed', schema: 'passed', core: 'passed', profile: 'passed', policy: 'passed', media: 'notEvaluated', signature: 'absent' },
      signature: { status: 'absent', kid: null, issuer: null, env: null, reason: null },
      trustList: null,
      summary: { error: 0, warning: 0, info: 0 },
      results: [],
    });
    const bytes = new TextEncoder().encode(exampleText());
    expect(report.document).toMatchObject({
      fileName: EXAMPLE_NAME, declarationId: '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13', revision: 1, jdx: '1.0',
      sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length,
      declaredProfiles: ['https://jdx.jupiter.ar/profiles/sadaic/0.1'], issuer: { id: 'jupiter', name: 'Jupiter' },
    });
    expect(report.document.media?.map((m) => m.path)).toEqual([
      '00034-001-CTTO_2-obras.pdf', 'Chacarera-del-Rancho.mp3', '00034-Ejemplar_Chacareras-del-Norte.pdf',
      '00034-DJCT_Chacareras-del-Norte.pdf', '00034-SADAIC_Chacareras-del-Norte.r1.xlsx',
    ]);
  });

  it('the trust list read in the environment step is reported, also when the JSON or the schema fails', async () => {
    const list = signTestTrustList({ ...trustListExample(), env: 'sandbox' }, TEST_ROOT_KEYS.sandbox.slice(0, 2));
    const signed = (document?: DocBuilder | string) => validateExample({ jws: 'eyJhbGciOiJFUzI1NiJ9..c2lnbmF0dXJh', options: { trustList: list }, ...(document === undefined ? {} : { document }) });
    const read = { seq: 1, expiresAt: '2026-12-29T00:00:00-03:00' };
    const [whole, json, schema] = await Promise.all([signed(), signed('{'), signed(docBuilder().remove('/works/0/titles'))]);
    expect([whole.trustList, whole.exitCode]).toEqual([read, 0]);
    expect([json.trustList, json.exitCode, json.checks.json]).toEqual([read, 1, 'failed']);
    expect([schema.trustList, schema.exitCode, schema.checks.schema]).toEqual([read, 1, 'failed']);
  });

  it('a newer minor reaches the report as a VER-003 warning, exit 0', async () => {
    const report = await validateExample({ document: docBuilder().set('/jdx', '1.1').set('/$schema', 'https://jdx.jupiter.ar/schema/1.1/jdx.schema.json') });
    expect(reportErrors(report)).toEqual([]);
    expect(report).toMatchObject({
      valid: true, disposition: 'ingest', exitCode: 0,
      checks: { environment: 'passed', json: 'passed', schema: 'warning', core: 'passed', profile: 'passed', policy: 'passed' },
      summary: { error: 0, warning: 1, info: 0 },
      results: [{
        ruleId: 'JDX-VER-003', level: 'warning', source: 'core', instanceLocation: '/jdx', params: { jdx: '1.1', validatedWith: '1.0' },
        message: 'La versión 1.1 es más nueva que las que conoce el validador: se validó con el schema abierto de la 1.0.',
      }],
    });
  });

  it('environment failure → exit 2, valid null, document best effort', async () => {
    const report = await validateExample({ options: { receivedAt: '' } });
    expect(reportErrors(report)).toEqual([]);
    expect(report).toMatchObject({
      valid: null, disposition: null, exitCode: 2,
      options: { env: 'sandbox', profile: 'sadaic/0.1', receivedAt: null },
      appliedProfiles: ['https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.0'],
      checks: { environment: 'failed', json: 'notEvaluated', schema: 'notEvaluated', core: 'notEvaluated', profile: 'notEvaluated', policy: 'notEvaluated', media: 'notEvaluated', signature: 'notEvaluated' },
      signature: { status: 'notEvaluated' },
      trustList: null,
      results: [{ ruleId: 'JDX-ENV-010', level: 'error', source: 'environment', instanceLocation: '', params: { option: '--received-at', reason: 'missing' } }],
    });
    // Lo que se puede leer del archivo; lo que pide el schema, null.
    expect(report.document).toMatchObject({ declarationId: '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13', revision: 1, jdx: '1.0', issuer: null, media: null });
    // Un perfil que no resuelve: sin perfil aplicado; un documento ilegible tampoco lanza.
    const unknown = await validateExample({ document: '{', options: { profile: 'sadaic/9.9' } });
    expect(reportErrors(unknown)).toEqual([]);
    expect(unknown).toMatchObject({ exitCode: 2, appliedProfiles: [], document: { declarationId: null, revision: null, jdx: null } });
    expect(unknown.results.map((r) => r.ruleId)).toEqual(['JDX-ENV-006']);
  });

  it('ENV-006 jdxNotAdmitted from the schema stage → exit 2', async () => {
    const report = await validateExample({
      document: docBuilder().set('/jdx', '1.1').set('/$schema', 'https://jdx.jupiter.ar/schema/1.1/jdx.schema.json'),
      options: { profile: { ...sadaicProfile(), jdx: '1.0' } },
    });
    expect(reportErrors(report)).toEqual([]);
    expect(report).toMatchObject({
      valid: null, disposition: null, exitCode: 2,
      appliedProfiles: ['https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.0+local'],
      checks: { environment: 'failed', json: 'passed', schema: 'notEvaluated', core: 'notEvaluated', signature: 'notEvaluated' },
      results: [{ ruleId: 'JDX-ENV-006', source: 'environment', instanceLocation: '', params: { reason: 'jdxNotAdmitted', jdx: '1.1' } }],
    });
    expect(report.document).toMatchObject({ jdx: '1.1', issuer: null, media: null });
    // Como una falla del entorno: sin la lista leída en el paso 1.
    const list = signTestTrustList({ ...trustListExample(), env: 'sandbox' }, TEST_ROOT_KEYS.sandbox.slice(0, 2));
    const signed = await validateExample({
      document: docBuilder().set('/jdx', '1.1').set('/$schema', 'https://jdx.jupiter.ar/schema/1.1/jdx.schema.json'), jws: 'eyJhbGciOiJFUzI1NiJ9..c2lnbmF0dXJh',
      options: { profile: { ...sadaicProfile(), jdx: '1.0' }, trustList: list },
    });
    expect([signed.exitCode, signed.trustList]).toEqual([2, null]);
  });

  it('json failure → later checks notEvaluated', async () => {
    const report = await validateExample({ document: docBuilder().setRaw('/works/0/shares/0/percent', '1e400') });
    expect(reportErrors(report)).toEqual([]);
    expect(report).toMatchObject({
      valid: false, disposition: 'reject', exitCode: 1,
      checks: { environment: 'passed', json: 'failed', schema: 'notEvaluated', core: 'notEvaluated', profile: 'notEvaluated', policy: 'notEvaluated', media: 'notEvaluated', signature: 'notEvaluated' },
      signature: { status: 'notEvaluated' },
      document: { declarationId: null, revision: null, jdx: null, declaredProfiles: null, issuer: null, media: null },
    });
    expect(report.results.map((r) => [r.ruleId, r.instanceLocation, r.params?.reason])).toEqual([['JDX-JSN-001', '/works/0/shares/0/percent', 'numberRange']]);
  });

  it('schema failure stops later stages', async () => {
    const rule = perWork('JDX-NUM-001');
    const report = await validateExample({ document: docBuilder().remove('/works/0/titles'), deps: { rules: ruleMap([rule]) } });
    expect(reportErrors(report)).toEqual([]);
    expect(report).toMatchObject({
      exitCode: 1, disposition: 'reject',
      checks: { json: 'passed', schema: 'failed', core: 'notEvaluated', profile: 'notEvaluated', policy: 'notEvaluated', signature: 'notEvaluated' },
      results: [{ ruleId: 'JDX-SCH-001', instanceLocation: '/works/0', keywordLocation: '/$defs/Work/required', params: { keyword: 'required', missingProperty: 'titles' } }],
    });
    // El documento sale con lo que se lee, sin lo que pide el schema.
    expect(report.document).toMatchObject({ revision: 1, issuer: null, media: null });
    expect(rule.calls).toEqual([]);
  });

  it("a registered fake rule's findings reach results with source, level and message", async () => {
    const core = perWork('JDX-NUM-001', { params: { text: '12.50001' } });
    const profile = perWork('JDX-CMP-001');
    const withParams = perWork('JDX-AGR-006', { none: true });
    const policy = perWork('JDX-POL-001', { params: { profile: 'https://jdx.jupiter.ar/profiles/sadaic/0.1' } });
    const report = await validateExample({ deps: { rules: ruleMap([core, profile, withParams, policy]) } });
    expect(reportErrors(report)).toEqual([]);
    expect(report.results.map((r) => [r.ruleId, r.level, r.source, r.instanceLocation, r.message])).toEqual([
      ['JDX-NUM-001', 'error', 'core', '/works/0', 'El porcentaje 12.50001 no está bien escrito: hasta 4 decimales, sin exponente ni -0.'],
      ['JDX-NUM-001', 'error', 'core', '/works/1', 'El porcentaje 12.50001 no está bien escrito: hasta 4 decimales, sin exponente ni -0.'],
      ['JDX-CMP-001', 'warning', 'profile:sadaic/0.1@0.1.0', '/works/0', 'La obra w1 no declara su duración.'],
      ['JDX-CMP-001', 'warning', 'profile:sadaic/0.1@0.1.0', '/works/1', 'La obra w2 no declara su duración.'],
      ['JDX-POL-001', 'warning', 'policy', '/works/0', 'El archivo no declara en profiles el perfil que se aplica (https://jdx.jupiter.ar/profiles/sadaic/0.1).'],
      ['JDX-POL-001', 'warning', 'policy', '/works/1', 'El archivo no declara en profiles el perfil que se aplica (https://jdx.jupiter.ar/profiles/sadaic/0.1).'],
    ]);
    expect(report).toMatchObject({ exitCode: 1, disposition: 'reject', checks: { core: 'failed', profile: 'warning', policy: 'warning' } });
    // Las del núcleo y la política reciben {}; las del perfil, sus params.
    expect([core.calls, profile.calls, withParams.calls, policy.calls]).toEqual([[{}], [{}], [{ retailMin: 20, arrangementRetailMin: 10 }], [{}]]);
    // Una regla del perfil que el perfil aplicado no trae no corre; el nivel es el que le da el perfil.
    const other = perWork('JDX-CMP-001');
    const rules = sadaicProfile().rules.filter((r) => r.ruleId !== 'JDX-CMP-001');
    const without = await validateExample({ options: { profile: { ...sadaicProfile(), rules } }, deps: { rules: ruleMap([other]) } });
    expect([without.results, other.calls]).toEqual([[], []]);
    const asError = await validateExample({ options: { profile: { ...sadaicProfile(), defaultLevel: 'error' } }, deps: { rules: ruleMap([perWork('JDX-CMP-001')]) } });
    expect(asError.results.map((r) => [r.level, r.source])).toEqual([['error', 'profile:sadaic/0.1@0.1.0+local'], ['error', 'profile:sadaic/0.1@0.1.0+local']]);
  });

  it('a rule that requires state is skipped without state', async () => {
    const needsState = perWork('JDX-DEC-005', { requires: ['state'], params: { revision: 1, lastIngestedRevision: 1 } });
    const needsMedia = perWork('JDX-MED-007', { requires: ['media'], params: { path: 'x.pdf' } });
    const needsAccount = perWork('JDX-POL-002', { requires: ['account'], params: { account: 'sur' } });
    const rules = ruleMap([needsState, needsMedia, needsAccount]);
    const without = await validateExample({ deps: { rules } });
    expect([without.results, without.checks.media]).toEqual([[], 'notEvaluated']);
    expect([needsState.calls, needsMedia.calls, needsAccount.calls]).toEqual([[], [], []]);
    const state = memoryState(emptyState('sandbox'));
    const all = await validateExample({
      deps: { rules },
      options: { state, media: emptyDir, account: { id: 'sur', identifiers: [{ scheme: 'IPI_NAME', value: '00098765432' }] } },
    });
    expect(reportErrors(all)).toEqual([]);
    expect(all.results.map((r) => `${r.ruleId} ${r.instanceLocation}`)).toEqual([
      'JDX-DEC-005 /works/0', 'JDX-DEC-005 /works/1', 'JDX-MED-007 /works/0', 'JDX-MED-007 /works/1', 'JDX-POL-002 /works/0', 'JDX-POL-002 /works/1',
    ]);
    // Con la carpeta, el bucket media corre.
    expect(all).toMatchObject({ options: { dir: true }, checks: { core: 'passed', media: 'failed', policy: 'warning' }, exitCode: 1, disposition: 'reject' });
    // Con estado y sin errores, DEC-005 da ignore.
    const ignored = await validateExample({ deps: { rules: ruleMap([needsState]) }, options: { state } });
    expect([ignored.exitCode, ignored.disposition, ignored.summary]).toEqual([0, 'ignore', { error: 0, warning: 0, info: 2 }]);
    // Cada requisito por separado: corre solo la regla que pide lo que hay.
    const account = { id: 'sur', identifiers: [{ scheme: 'IPI_NAME', value: '00098765432' }] };
    for (const [options, ran] of [[{ state }, 'JDX-DEC-005'], [{ media: emptyDir }, 'JDX-MED-007'], [{ account }, 'JDX-POL-002']] as const) {
      const one = await validateExample({ deps: { rules }, options });
      expect([...new Set(one.results.map((r) => r.ruleId))], ran).toEqual([ran]);
    }
  });

  it('unresolved(pointer) lets a rule skip the object with a reference that does not resolve', async () => {
    // La regla depende de las referencias de la obra: no evalúa la que tiene una que no resuelve.
    const rule = perWork('JDX-CMP-001', { skip: (ctx, pointer) => ctx.index.unresolved(pointer) });
    const report = await validateExample({ document: docBuilder().set('/works/1/shares/0/party', 'p9'), deps: { rules: ruleMap([rule]) } });
    expect(reportErrors(report)).toEqual([]);
    expect(report.results.map((r) => [r.ruleId, r.instanceLocation, r.context])).toEqual([
      ['JDX-REF-002', '/works/1/shares/0/party', { work: 'w2' }],
      ['JDX-CMP-001', '/works/0', { work: 'w1' }],
    ]);
    // REF-002 es del núcleo y no frena el paso de las reglas.
    expect(report).toMatchObject({ exitCode: 1, checks: { core: 'failed', profile: 'warning' } });
  });

  it('makeRuleContext builds the context that validateWithDeps gives the rules', async () => {
    // Una regla de prueba guarda el contexto que recibe; el helper tiene que dar el mismo, con las mismas opciones.
    const captured = async (run: ExampleRun): Promise<RuleContext> => {
      let seen: RuleContext | undefined;
      const spy: Rule = { id: 'JDX-NUM-001', evaluate: (ctx) => { seen = ctx; return []; } };
      await validateExample({ ...run, deps: { ...run.deps, rules: ruleMap([spy]) } });
      if (seen === undefined) throw new Error('la regla no corrió');
      return seen;
    };
    const comparable = (ctx: RuleContext) => ({
      doc: ctx.doc, numbers: [...ctx.json.numberTexts], byId: [...ctx.index.byId], refs: ctx.index.refs, schemaIndex: ctx.schemaIndex, input: ctx.input,
      options: ctx.options, now: ctx.now, profile: ctx.profile, values: ctx.values, world: ctx.territories.expand({ include: ['2136'] }).countries.size,
      state: ctx.state, media: ctx.media, account: ctx.account, signature: ctx.signature, trust: ctx.trust,
    });
    const production = memoryState(emptyState('production'));
    const runs: ExampleRun[] = [
      {},
      { options: { env: 'production', state: production } },
      { options: { signature: 'required' } },
      { options: { profile: { ...sadaicProfile(), signature: 'required' } } },
      { document: docBuilder().set('/declaration/revision', 2), fileName: 'x.jdx.json', options: { lang: 'en', failOn: 'warning', media: emptyDir } },
    ];
    for (const run of runs) expect(comparable(await makeRuleContext(run)), JSON.stringify(run.options ?? {})).toEqual(comparable(await captured(run)));
    // Lo que deriva la validación: la firma pedida por el entorno y el piso del perfil, y el reloj del validador.
    const [byEnv, explicit, byFloor] = await Promise.all([captured(runs[1]!), captured(runs[2]!), captured(runs[3]!)]);
    expect([byEnv.options.signature, byEnv.options.signatureExplicit, explicit.options.signatureExplicit, byFloor.options.signature]).toEqual(['required', false, true, 'required']);
    expect([byEnv.now.text, byEnv.options.receivedAt.text]).toEqual([TEST_NOW.toISOString(), RECEIVED_AT]);
  });

  it('makeRuleContext builds from the example and the bundled data', async () => {
    const ctx = await makeRuleContext();
    const bytes = new TextEncoder().encode(exampleText());
    expect(ctx.doc).toEqual(JSON.parse(exampleText()));
    expect(ctx.json.numberTexts.get('/works/0/shares/0/percent')).toBe('12.5');
    expect([ctx.index.byId.size, ctx.index.refs.length, ctx.schemaIndex.minor]).toEqual([13, 43, '1.0']);
    expect(ctx.input).toEqual({ fileName: EXAMPLE_NAME, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length });
    expect(ctx.options).toMatchObject({ env: 'sandbox', profileShortId: 'sadaic/0.1', signature: 'optional', signatureExplicit: false, failOn: 'error', lang: 'es', dir: false });
    expect([ctx.options.receivedAt.text, ctx.now.text]).toEqual([RECEIVED_AT, TEST_NOW.toISOString()]);
    expect([ctx.profile.source, ctx.profile.rules.length, ctx.values.version]).toEqual(['profile:sadaic/0.1@0.1.0', 35, '2026-10']);
    expect(ctx.territories.expand({ include: ['2136'] }).countries.size).toBe(249);
    expect([ctx.state, ctx.media, ctx.account, ctx.trust, ctx.signature.report.status]).toEqual([null, null, null, null, 'absent']);
    // Cada parte se puede cambiar; un documento que no cumple el schema no da un contexto.
    const other = await makeRuleContext({
      document: docBuilder().set('/declaration/revision', 2), fileName: 'x.jdx.json', state: emptyState('sandbox'), options: { media: emptyDir, lang: 'en' },
      now: '2026-12-01T00:00:00Z',
    });
    expect([other.doc.declaration.revision, other.input.fileName, other.state?.stateVersion, other.media, other.options.lang, other.options.dir, other.now.text])
      .toEqual([2, 'x.jdx.json', 1, emptyDir, 'en', true, '2026-12-01T00:00:00.000Z']);
    await expect(makeRuleContext({ document: docBuilder().remove('/declaration') })).rejects.toThrow(/JDX-SCH-001/);
    await expect(makeRuleContext({ document: '{' })).rejects.toThrow(/JDX-JSN-001/);
    await expect(makeRuleContext({ options: { env: 'production' } })).rejects.toThrow(/JDX-ENV-010/);
    // findingProblems controla los hallazgos contra el catálogo.
    expect(findingProblems([{ ruleId: 'JDX-REF-002', instanceLocation: '/works/0/shares/0/party', context: { work: 'w1' }, params: { value: 'p9', list: 'parties' } }])).toEqual([]);
    expect(findingProblems([
      { ruleId: 'JDX-REF-002', instanceLocation: 'works/0', params: { value: 'p9' } },
      { ruleId: 'JDX-CMP-001', instanceLocation: '/works/0', keywordLocation: '/x', context: { party: 'p1' } },
      { ruleId: 'JDX-ZZZ-001', instanceLocation: '' },
    ])).toEqual([
      'JDX-REF-002 works/0: el lugar no es un JSON Pointer',
      'JDX-REF-002 works/0: params no cumple resultParamsSchema (required en "")',
      'JDX-CMP-001 /works/0: keywordLocation es solo de JDX-SCH-001',
      'JDX-CMP-001 /works/0: context no cumple contextSchema (required en "")',
      'JDX-CMP-001 /works/0: context no cumple contextSchema (additionalProperties en "/party")',
      'JDX-ZZZ-001 : no está en el catálogo',
    ]);
  });

  it('docBuilder applies a pointer mutation and keeps the rest byte-stable', () => {
    const base = exampleText();
    const percent = '"percent": 12.5 }';
    const at = base.indexOf(percent) + '"percent": '.length;
    // Reemplazar: solo cambia el valor.
    const raw = docBuilder().setRaw('/works/0/shares/0/percent', '1E1');
    expect(raw.text).toBe(`${base.slice(0, at)}1E1${base.slice(at + '12.5'.length)}`);
    expect(new TextDecoder().decode(raw.bytes())).toBe(raw.text);
    // Sacar un miembro: desde la coma anterior hasta el final del valor.
    expect(docBuilder().remove('/declaration/language').text).toBe(base.replace(',\n    "language": "es"', ''));
    // Agregar un miembro y un elemento al final de su objeto o su arreglo.
    expect(docBuilder().set('/declaration/x', 1).text).toBe(base.replace('"language": "es"', '"language": "es", "x": 1'));
    expect(docBuilder().set('/works/0/lyricsLanguages/1', 'pt').text).toBe(base.replace('"lyricsLanguages": ["es"]', '"lyricsLanguages": ["es", "pt"]'));
    expect(docBuilder().set('/works/0/lyricsLanguages/-', 'pt').text).toBe(docBuilder().set('/works/0/lyricsLanguages/1', 'pt').text);
    const removed = docBuilder().remove('/works/1').remove('/media/4').remove('/media/0').value() as { works: unknown[]; media: { id: string }[] };
    expect([removed.works.length, removed.media.map((m) => m.id)]).toEqual([1, ['m2', 'm3', 'm4']]);
    // Cada cambio da un builder nuevo; el de antes no cambia.
    const one = docBuilder();
    const two = one.set('/jdx', '1.1');
    expect([one.text === base, two.text === base, (two.value() as { jdx: string }).jdx]).toEqual([true, false, '1.1']);
    expect(() => docBuilder().set('/works/9/titles', [])).toThrow('docBuilder: no existe /works/9');
    expect(() => docBuilder().set('/works/7', {})).toThrow('docBuilder: /works/7 no es el final de un arreglo de 2');
    expect(() => docBuilder().remove('/works/0/nada')).toThrow('docBuilder: no existe /works/0/nada');
    expect(() => docBuilder().set('', {})).toThrow('docBuilder: el documento entero no se cambia por puntero');
  });
});

describe('registry and deps', () => {
  it('ruleMap keeps the order of its list and refuses a repeated code, and RULES is one', () => {
    // RULES crece con cada regla: cada una, con su código de clave.
    for (const [id, rule] of RULES) expect(rule.id).toBe(id);
    expect(ruleMap([]).size).toBe(0);
    const rule = perWork('JDX-NUM-001');
    expect([...ruleMap([rule, perWork('JDX-NUM-002')]).keys()]).toEqual(['JDX-NUM-001', 'JDX-NUM-002']);
    expect(() => ruleMap([rule, perWork('JDX-NUM-001')])).toThrow('regla repetida en el registro: JDX-NUM-001');
  });

  it('a registered rule of another layer, retired, not implemented or not in the catalog is a programming error', async () => {
    const refused = (id: Rule['id'], more: Partial<ValidatorDeps> = {}) => validateExample({ deps: { ...more, rules: ruleMap([perWork(id)]) } });
    await expect(refused('JDX-ENV-001')).rejects.toThrow('JDX-ENV-001: una regla de la capa environment no va en el registro');
    await expect(refused('JDX-SCH-001')).rejects.toThrow('JDX-SCH-001: una regla de la capa schema no va en el registro');
    await expect(refused('JDX-SHR-001')).rejects.toThrow('JDX-SHR-001: está registrada y el catálogo la da como retirada');
    await expect(refused('JDX-IDN-004')).rejects.toThrow('JDX-IDN-004: está registrada y el catálogo la da como no implementada');
    await expect(refused('JDX-ZZZ-999')).rejects.toThrow('JDX-ZZZ-999: no está en el catálogo');
    // Retirada e implementada: la retirada manda.
    const retired = { ...deps.catalog, rules: deps.catalog.rules.map((r) => (r.id === 'JDX-NUM-001' ? { ...r, status: 'retired' as const } : r)) };
    await expect(refused('JDX-NUM-001', { catalog: retired })).rejects.toThrow('JDX-NUM-001: está registrada y el catálogo la da como retirada');
  });

  it('a registered rule with a code that a validation step gives is a programming error, and SIG-001 and TRU-001 are rules', async () => {
    // El JSON, la versión, el índice, la firma y la falla interna dan sus códigos sin el registro: registrarlos los repetiría.
    const steps = ['JDX-INT-001', 'JDX-JSN-001', 'JDX-REF-001', 'JDX-REF-002', 'JDX-SIG-002', 'JDX-SIG-003', 'JDX-SIG-004', 'JDX-VER-001', 'JDX-VER-002', 'JDX-VER-003'] as const;
    for (const id of steps) {
      await expect(validateExample({ deps: { rules: ruleMap([perWork(id)]) } }), id).rejects.toThrow(`${id}: la da un paso de la validación y no va en el registro`);
    }
    // La política los da como reglas del paso 4.
    const policy = await validateExample({ deps: { rules: ruleMap([perWork('JDX-SIG-001', { none: true }), perWork('JDX-TRU-001', { none: true })]) } });
    expect(policy.exitCode).toBe(0);
  });

  it('defaultDeps carries the bundled data, the pinned roots, the registry and the version', () => {
    const one = defaultDeps();
    const two = defaultDeps();
    expect(Object.isFrozen(one)).toBe(true);
    expect([one.rules, one.schemas, one.validators, one.catalog, one.values, one.profiles]).toEqual([RULES, two.schemas, two.validators, two.catalog, two.values, two.profiles]);
    expect(one.validators).toBe(two.validators);
    expect([one.catalog.catalog, one.catalog.rules.length, one.profiles.map((p) => `${p.id}@${p.version}`), one.values.version, one.schemas.minors, one.validatorVersion])
      .toEqual(['1.0', 80, ['https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.0'], '2026-10', ['1.0'], '1.0.0']);
    expect([one.roots.production, one.roots.sandbox]).toEqual([[], []]);
    expect(Math.abs(one.clock().getTime() - Date.now())).toBeLessThan(5_000);
  });
});

describe('a file over the size cap, given without its bytes', () => {
  const OVER = MAX_DOCUMENT_BYTES + 1;
  const bytes = new Uint8Array(OVER).fill(0x20);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const opts = { profile: 'sadaic/0.1', env: 'sandbox' as const, receivedAt: RECEIVED_AT };

  it('gives JDX-JSN-001 size after the environment step, as with its bytes', async () => {
    const withoutBytes = await validateWithDeps({ fileName: EXAMPLE_NAME, size: OVER, sha256 }, opts, deps);
    expect(reportErrors(withoutBytes)).toEqual([]);
    expect(withoutBytes).toMatchObject({
      valid: false, disposition: 'reject', exitCode: 1,
      checks: { environment: 'passed', json: 'failed', schema: 'notEvaluated', core: 'notEvaluated', signature: 'notEvaluated' },
      document: { fileName: EXAMPLE_NAME, declarationId: null, revision: null, jdx: null, sha256, size: OVER, declaredProfiles: null, issuer: null, media: null },
      results: [{ ruleId: 'JDX-JSN-001', instanceLocation: '', params: { reason: 'size', offset: MAX_DOCUMENT_BYTES } }],
      omitted: [],
    });
    // El mismo reporte que con los bytes.
    expect(withoutBytes).toEqual(await validateWithDeps({ fileName: EXAMPLE_NAME, bytes }, opts, deps));
    // El entorno va primero: con una opción que falta, salida 2 y ningún JDX-JSN-001.
    const environment = await validateWithDeps({ fileName: EXAMPLE_NAME, size: OVER, sha256 }, { ...opts, receivedAt: '' }, deps);
    expect(reportErrors(environment)).toEqual([]);
    expect(environment).toMatchObject({ exitCode: 2, document: { sha256, size: OVER }, results: [{ ruleId: 'JDX-ENV-010' }] });
    expect(environment.results).toHaveLength(1);
    // Con .jws, la lista del paso 1 sale en el reporte.
    const list = signTestTrustList({ ...trustListExample(), env: 'sandbox' }, TEST_ROOT_KEYS.sandbox.slice(0, 2));
    const signed = await validateWithDeps({ fileName: EXAMPLE_NAME, size: OVER, sha256, jws: 'eyJhbGciOiJFUzI1NiJ9..c2lnbmF0dXJh' }, { ...opts, trustList: list }, deps);
    expect([signed.exitCode, signed.trustList, signed.signature.status]).toEqual([1, { seq: 1, expiresAt: '2026-12-29T00:00:00-03:00' }, 'notEvaluated']);
  });

  it('is only for a file over the cap, with a size and a sha256 that can be', async () => {
    const run = (input: object) => validateWithDeps(input as Parameters<typeof validateWithDeps>[0], opts, deps);
    await expect(run({ fileName: EXAMPLE_NAME, size: MAX_DOCUMENT_BYTES, sha256 })).rejects.toThrow(
      `sin bytes, solo un archivo de más de ${MAX_DOCUMENT_BYTES} bytes, con un size entero y un sha256 en hexadecimal: size ${MAX_DOCUMENT_BYTES}`,
    );
    await expect(run({ fileName: EXAMPLE_NAME, size: OVER + 0.5, sha256 })).rejects.toThrow('sin bytes, solo un archivo');
    await expect(run({ fileName: EXAMPLE_NAME, size: OVER, sha256: sha256.toUpperCase() })).rejects.toThrow('sin bytes, solo un archivo');
    await expect(run({ fileName: EXAMPLE_NAME, size: OVER, sha256, bytes })).rejects.toThrow('la entrada trae bytes y también size o sha256');
    await expect(run({ fileName: EXAMPLE_NAME })).rejects.toThrow('la entrada no trae bytes ni size y sha256');
  });
});

describe('hostile input through validateWithDeps', () => {
  const encode = (text: string) => new TextEncoder().encode(text);
  type Doc = { [k: string]: JsonValue };
  /** El ejemplo con una lista de "x" en un lugar, tan larga como entra en MAX_DOCUMENT_BYTES: cada "x" es una referencia que no resuelve. */
  function flood(change: (doc: Doc, marker: string) => void): { text: string; count: number } {
    const doc = JSON.parse(exampleText()) as Doc;
    change(doc, '@@');
    const template = JSON.stringify(doc);
    // Cada "x" con su coma suma 4 bytes; el marcador "@@" (4 bytes) deja lugar a los corchetes.
    const count = Math.floor((MAX_DOCUMENT_BYTES - (encode(template).length - 4) - 2 + 1) / 4);
    return { text: template.replace('"@@"', `[${Array<string>(count).fill('"x"').join(',')}]`), count };
  }
  /** Valida, escribe el reporte y lo vuelve a leer, como lo hará ack, con lo que tarda todo. */
  async function run(document: string, deps?: Partial<ValidatorDeps>) {
    const started = performance.now();
    const report = await validateExample({ document, ...(deps === undefined ? {} : { deps }) });
    const text = JSON.stringify(report, null, 2);
    const back = parseJson(encode(text));
    return { report, chars: text.length, readBack: back.ok, ms: performance.now() - started };
  }
  const FLOOD_CHECKS = { environment: 'passed', json: 'passed', schema: 'passed', core: 'failed', profile: 'passed', policy: 'passed', media: 'notEvaluated', signature: 'absent' };

  it('a REF-002 flood in recordings[0].performers[0].members, about 2 MiB, lists 100 and counts the rest, quickly', async () => {
    const { text, count } = flood((d, marker) => {
      (d.recordings as Doc[])[0]!.performers = [{ party: 'p1', members: marker }];
    });
    expect(encode(text).length).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
    expect(encode(text).length).toBeGreaterThan(MAX_DOCUMENT_BYTES - 8);
    const { report, chars, readBack, ms } = await run(text);
    expect(reportErrors(report)).toEqual([]);
    // Las 100 primeras en el orden del reporte, cada una con el context de su grabación.
    expect(report.results.map((r) => [r.ruleId, r.instanceLocation, r.context])).toEqual(
      Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => ['JDX-REF-002', `/recordings/0/performers/0/members/${i}`, { recording: 'r1' }]),
    );
    expect(report.omitted).toEqual([{ ruleId: 'JDX-REF-002', count: count - MAX_RESULTS_PER_RULE }]);
    // Lo mismo que sin el tope: el resumen cuenta todas, y la salida, la disposición y los checks no cambian.
    expect(report).toMatchObject({ valid: false, disposition: 'reject', exitCode: 1, summary: { error: count, warning: 0, info: 0 }, checks: FLOOD_CHECKS });
    expect(count).toBeGreaterThan(500_000);
    expect(chars).toBeLessThan(100_000);
    expect(readBack).toBe(true);
    expect(ms).toBeLessThan(5_000);
  });

  it('a REF-002 flood in edition.publishers, about 2 MiB, lists 100 and counts the rest, quickly', async () => {
    const { text, count } = flood((d, marker) => {
      (d.edition as Doc).publishers = marker;
    });
    const { report, chars, readBack, ms } = await run(text);
    expect(reportErrors(report)).toEqual([]);
    // Sin context: la edición no es una lista raíz.
    expect(report.results.map((r) => [r.ruleId, r.instanceLocation, r.context])).toEqual(
      Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => ['JDX-REF-002', `/edition/publishers/${i}`, undefined]),
    );
    expect(report.omitted).toEqual([{ ruleId: 'JDX-REF-002', count: count - MAX_RESULTS_PER_RULE }]);
    expect(report).toMatchObject({ valid: false, disposition: 'reject', exitCode: 1, summary: { error: count, warning: 0, info: 0 }, checks: FLOOD_CHECKS });
    expect(chars).toBeLessThan(100_000);
    expect(readBack).toBe(true);
    expect(ms).toBeLessThan(5_000);
  });

  it('a registered rule that floods is capped like any code', async () => {
    // Un millón de hallazgos de una regla del paso 4: el reporte lista 100 y no arma los demás.
    const rule: Rule = {
      id: 'JDX-NUM-001',
      evaluate: () => Array.from({ length: 1_000_000 }, (_, i): Finding => ({ ruleId: 'JDX-NUM-001', instanceLocation: `/works/0/shares/${i}/percent`, context: { work: 'w1' }, params: { text: '12.50001' } })),
    };
    const { report, chars, ms } = await run(exampleText(), { rules: ruleMap([rule]) });
    expect(reportErrors(report)).toEqual([]);
    expect(report.results.map((r) => r.instanceLocation)).toEqual(Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => `/works/0/shares/${i}/percent`));
    expect(report.omitted).toEqual([{ ruleId: 'JDX-NUM-001', count: 1_000_000 - MAX_RESULTS_PER_RULE }]);
    expect(report).toMatchObject({ exitCode: 1, summary: { error: 1_000_000, warning: 0, info: 0 }, checks: { core: 'failed' } });
    expect(chars).toBeLessThan(100_000);
    expect(ms).toBeLessThan(5_000);
  });

  it('a schema or parser flood says that its step stopped at the cap', async () => {
    // El schema se corta y da 100: no sabe cuántos más hay.
    const schema = await validateExample({ document: docBuilder().set('/parties', Array<number>(5000).fill(0)) });
    expect(reportErrors(schema)).toEqual([]);
    expect([schema.results.length, schema.omitted, schema.summary.error]).toEqual([MAX_RESULTS_PER_RULE, [{ ruleId: 'JDX-SCH-001', count: null }], MAX_RESULTS_PER_RULE]);
    // El parser deja de leer con la falla 100.
    const keys = `{${Array.from({ length: 150 }, () => '"a":1').join(',')}}`;
    const parser = await validateExample({ document: keys });
    expect(reportErrors(parser)).toEqual([]);
    expect([parser.results.length, parser.omitted]).toEqual([MAX_RESULTS_PER_RULE, [{ ruleId: 'JDX-JSN-001', count: null }]]);
    // Sin llegar al tope, no falta nada.
    expect((await validateExample({ document: '{"a":1,"a":2,"a":3}' })).omitted).toEqual([]);
    expect((await validateExample({ document: docBuilder().remove('/works/0/titles') })).omitted).toEqual([]);
  });
});
