/**
 * El reporte: el resumen por nivel, `valid`, la salida, la disposición y el
 * estado de cada bucket de `checks`, armados desde los resultados y lo que
 * corrió. La salida 3 pisa a todas; con salida 2 o 3 no hay `valid` ni
 * disposición. Sin estado no hay `ignore`. Todo reporte armado cumple
 * jdx-report.schema.json.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { VERSION } from '../../../src/generated/version.js';
import { bundledProfiles, resolveProfile } from '../../../src/profile/resolve.js';
import { buildReport, exitCode, reportFileName } from '../../../src/report/build.js';
import { capFindings, toResult } from '../../../src/report/results.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { CheckName, Finding, JsonValue, Report, ReportDocument, ReportParts, ReportSignature } from '../../../src/types.js';

const validators = defaultValidators();
const catalog = loadCatalog(JSON.parse(files['catalog/1.0/rules.json'] as string) as JsonValue, validators);
const outcome = resolveProfile('sadaic/0.1', { catalog, bundled: bundledProfiles(files), validatorVersion: VERSION, validators });
if (!outcome.ok) throw new Error('sadaic/0.1 no resolvió');
const profile = outcome.profile;

const ALL: ReadonlySet<CheckName> = new Set(['environment', 'json', 'schema', 'core', 'profile', 'policy', 'media', 'signature']);
const BEFORE_JSON: ReadonlySet<CheckName> = new Set(['environment', 'json']);

const DOCUMENT: ReportDocument = {
  fileName: '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json',
  declarationId: '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13', revision: 1, jdx: '1.0',
  sha256: 'ebe77bbafaa7d8a95de2419ad78150792f412050751f6a3d8e7821c2eac9954a', size: 10329,
  declaredProfiles: ['https://jdx.jupiter.ar/profiles/sadaic/0.1'],
  issuer: { id: 'jupiter', name: 'Jupiter' },
  media: [{ path: 'Chacarera-del-Rancho.mp3', delivery: 1, size: 5234011, sha256: 'ac7dad09e27c23710ca72670f4bef247670177689b6c330b95381724a7e9a69b' }],
};
const VERIFIED: ReportSignature = {
  status: 'verified', kid: '3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E', issuer: { id: 'jupiter', name: 'Jupiter' }, env: 'production', reason: null,
};
const ABSENT: ReportSignature = { status: 'absent', kid: null, issuer: null, env: null, reason: null };

const AGR003: Finding = { ruleId: 'JDX-AGR-003', instanceLocation: '/agreements/0/publisherShare/percent', context: { agreement: 'a1' }, params: { percent: 30, cap: 25 } };
const REF002: Finding = { ruleId: 'JDX-REF-002', instanceLocation: '/works/0/shares/0/party', context: { work: 'w1' }, params: { value: 'p9', list: 'parties' } };
const DEC005: Finding = { ruleId: 'JDX-DEC-005', instanceLocation: '/declaration/revision', params: { revision: 1, lastIngestedRevision: 1 } };
const SIG004: Finding = { ruleId: 'JDX-SIG-004', instanceLocation: '', params: { issuedAt: '2026-09-12T19:05:00-03:00', reason: 'createdAt' } };
const SIG002: Finding = { ruleId: 'JDX-SIG-002', instanceLocation: '', params: { reason: 'signature' } };
const VER001: Finding = { ruleId: 'JDX-VER-001', instanceLocation: '/jdx', params: { jdx: '2.0' } };
const JSN001: Finding = { ruleId: 'JDX-JSN-001', instanceLocation: '/works/0', params: { reason: 'duplicateKey', offset: 812 } };
const ENV005: Finding = { ruleId: 'JDX-ENV-005', instanceLocation: '', params: { reason: 'locked', lockedSince: '2026-09-30T12:11:00.250Z' } };
const INT001: Finding = { ruleId: 'JDX-INT-001', instanceLocation: '', params: { ruleId: 'JDX-CMP-003' } };
const MED007: Finding = { ruleId: 'JDX-MED-007', instanceLocation: '/media/1/path', context: { media: 'm2' }, params: { path: 'Chacarera-del-Rancho.mp3' } };

function parts(findings: Finding[], more: Partial<ReportParts> = {}): ReportParts {
  return {
    validator: { name: 'jdx', version: VERSION, catalog: '1.0' },
    options: { env: 'production', profile: 'sadaic/0.1', signature: 'optional', failOn: 'error', receivedAt: '2026-09-30T09:12:00-03:00', dir: true, dirLookup: 'anchored', lang: 'es' },
    document: DOCUMENT,
    appliedProfiles: [profile.applied],
    outcome: 'completed',
    evaluated: ALL,
    hasState: true,
    signature: VERIFIED,
    trustList: { seq: 1, expiresAt: '2026-12-29T00:00:00-03:00' },
    results: findings.map((f) => toResult(f, { catalog, profile, lang: 'es' })),
    catalog,
    ...more,
  };
}

/** El reporte armado, que siempre cumple su schema. */
function build(p: ReportParts): Report {
  const report = buildReport(p);
  expect(validators.validateAux('report', report as unknown as JsonValue)).toEqual([]);
  return report;
}
const head = (r: Report) => ({ valid: r.valid, disposition: r.disposition, exitCode: r.exitCode });

describe('reporte', () => {
  it('summary by level', () => {
    const report = build(parts([AGR003, REF002, DEC005, SIG004, { ...AGR003, instanceLocation: '/agreements/1/publisherShare/percent', context: { agreement: 'a2' } }]));
    expect(report.summary).toEqual({ error: 1, warning: 3, info: 1 });
    expect(build(parts([])).summary).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it('valid is error count zero', () => {
    expect(build(parts([AGR003, DEC005])).valid).toBe(true);
    expect(build(parts([AGR003, REF002])).valid).toBe(false);
    // Con failOn warning un aviso rechaza, pero el archivo sigue siendo válido: valid mira solo los errores.
    expect(head(build(parts([AGR003], { options: { ...parts([]).options, failOn: 'warning' } })))).toEqual({ valid: true, disposition: 'reject', exitCode: 1 });
  });

  it('exit 3 overrides', () => {
    const internal = build(parts([REF002, AGR003, INT001], { outcome: 'internal' }));
    expect(head(internal)).toEqual({ valid: null, disposition: null, exitCode: 3 });
    expect(internal.summary).toEqual({ error: 2, warning: 1, info: 0 });
    expect(exitCode(internal, 'warning')).toBe(3);
  });

  it('exit 2 has valid and disposition null', () => {
    const env = build(parts([ENV005], { outcome: 'environment', evaluated: new Set(['environment']), signature: { ...ABSENT, status: 'notEvaluated' }, trustList: null }));
    expect(head(env)).toEqual({ valid: null, disposition: null, exitCode: 2 });
    expect(env.checks).toEqual({
      environment: 'failed', json: 'notEvaluated', schema: 'notEvaluated', core: 'notEvaluated',
      profile: 'notEvaluated', policy: 'notEvaluated', media: 'notEvaluated', signature: 'notEvaluated',
    });
    expect(exitCode(env)).toBe(2);
  });

  it('errors → 1 and reject', () => {
    expect(head(build(parts([REF002])))).toEqual({ valid: false, disposition: 'reject', exitCode: 1 });
    // Un error rechaza aunque además la revisión ya esté cargada.
    expect(head(build(parts([REF002, DEC005])))).toEqual({ valid: false, disposition: 'reject', exitCode: 1 });
  });

  it('warnings with failOn warning → 1 and reject', () => {
    const options = { ...parts([]).options, failOn: 'warning' as const };
    expect(head(build(parts([AGR003], { options })))).toEqual({ valid: true, disposition: 'reject', exitCode: 1 });
    expect(head(build(parts([AGR003])))).toEqual({ valid: true, disposition: 'ingest', exitCode: 0 });
    // Un informativo no cuenta como aviso.
    expect(head(build(parts([DEC005], { options, hasState: false })))).toEqual({ valid: true, disposition: 'ingest', exitCode: 0 });
  });

  it('VER-001 → 1', () => {
    // Una versión mayor que el validador no lee es un defecto del archivo: salida 1, no de entorno.
    const report = build(parts([VER001], { evaluated: new Set(['environment', 'json', 'schema']), signature: { ...ABSENT, status: 'notEvaluated' } }));
    expect(head(report)).toEqual({ valid: false, disposition: 'reject', exitCode: 1 });
    expect(report.checks.schema).toBe('failed');
  });

  it('DEC-005 alone → ignore', () => {
    expect(head(build(parts([DEC005])))).toEqual({ valid: true, disposition: 'ignore', exitCode: 0 });
    expect(head(build(parts([DEC005, AGR003])))).toEqual({ valid: true, disposition: 'ignore', exitCode: 0 });
    // Con failOn warning y un aviso, la salida 1 manda: reject antes que ignore.
    expect(head(build(parts([DEC005, AGR003], { options: { ...parts([]).options, failOn: 'warning' } })))).toEqual({ valid: true, disposition: 'reject', exitCode: 1 });
  });

  it('no state never ignores', () => {
    expect(head(build(parts([DEC005], { hasState: false })))).toEqual({ valid: true, disposition: 'ingest', exitCode: 0 });
    expect(head(build(parts([], { hasState: false })))).toEqual({ valid: true, disposition: 'ingest', exitCode: 0 });
  });

  it('exitCode() recomputes only the exit', () => {
    const report = build(parts([AGR003]));
    expect([report.exitCode, report.disposition]).toEqual([0, 'ingest']);
    expect(exitCode(report)).toBe(0);
    expect(exitCode(report, 'warning')).toBe(1);
    expect(exitCode(report, 'error')).toBe(0);
    // El reporte no cambia: la disposición sigue siendo la del failOn con que se validó.
    expect([report.exitCode, report.disposition, report.options.failOn]).toEqual([0, 'ingest', 'error']);
    const strict = build(parts([AGR003], { options: { ...parts([]).options, failOn: 'warning' } }));
    expect([exitCode(strict), exitCode(strict, 'error')]).toEqual([1, 0]);
    expect(exitCode(build(parts([REF002])), 'error')).toBe(1);
    expect(exitCode(build(parts([DEC005])), 'warning')).toBe(0);
  });

  it('checks buckets and statuses (signature verified/absent/failed, SIG-004 makes signature warning, notEvaluated after json failure)', () => {
    expect(build(parts([AGR003])).checks).toEqual({
      environment: 'passed', json: 'passed', schema: 'passed', core: 'passed',
      profile: 'warning', policy: 'passed', media: 'passed', signature: 'verified',
    });
    // Un error del núcleo falla el núcleo; un informativo no cambia nada.
    expect(build(parts([REF002, DEC005])).checks).toMatchObject({ core: 'failed', profile: 'passed', signature: 'verified' });
    expect(build(parts([DEC005])).checks.core).toBe('passed');
    // La firma: absent sin .jws, failed con un error de su bucket, warning con SIG-004.
    expect(build(parts([], { signature: ABSENT })).checks.signature).toBe('absent');
    const invalid = { ...ABSENT, status: 'invalid' as const, kid: '3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E', env: 'production' as const, reason: 'signature' as const };
    expect(build(parts([SIG002], { signature: invalid })).checks).toMatchObject({ core: 'passed', signature: 'failed' });
    expect(build(parts([SIG004])).checks).toMatchObject({ core: 'passed', signature: 'warning' });
    // Un error de perfil (un perfil con nivel error) falla el perfil; MED-007 cuenta en media.
    expect(build(parts([{ ...AGR003, level: 'error' }])).checks.profile).toBe('failed');
    expect(build(parts([MED007])).checks).toMatchObject({ core: 'passed', media: 'failed' });
    // Después de JSN-001 solo corrieron el entorno y el JSON.
    const json = build(parts([JSN001], { evaluated: BEFORE_JSON, signature: { ...ABSENT, status: 'notEvaluated' }, document: { ...DOCUMENT, declarationId: null, revision: null, jdx: null, declaredProfiles: null, issuer: null, media: null } }));
    expect(json.checks).toEqual({
      environment: 'passed', json: 'failed', schema: 'notEvaluated', core: 'notEvaluated',
      profile: 'notEvaluated', policy: 'notEvaluated', media: 'notEvaluated', signature: 'notEvaluated',
    });
    expect(head(json)).toEqual({ valid: false, disposition: 'reject', exitCode: 1 });
  });

  it('media is notEvaluated when not in evaluated (no --dir)', () => {
    const noDir = new Set<CheckName>([...ALL].filter((name) => name !== 'media'));
    const report = build(parts([AGR003], { evaluated: noDir, options: { ...parts([]).options, dir: false, dirLookup: null } }));
    expect(report.checks).toMatchObject({ media: 'notEvaluated', profile: 'warning', signature: 'verified' });
  });

  it('reportFileName', () => {
    expect(reportFileName('3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r2.jdx.json')).toBe('3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r2.report.json');
    // Las carpetas no van; un nombre sin .jdx.json suma el sufijo, también con mayúsculas.
    expect(reportFileName('entrega/sub/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r2.jdx.json')).toBe('3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r2.report.json');
    expect(reportFileName('C:\\entrega\\x.r1.jdx.json')).toBe('x.r1.report.json');
    expect(reportFileName('declaracion.json')).toBe('declaracion.json.report.json');
    expect(reportFileName('X.JDX.JSON')).toBe('X.JDX.JSON.report.json');
  });

  it('builder always emits signature.reason, document.media, document.issuer and omitted', () => {
    // Sin reason en la firma ni issuer y media en el documento, el reporte los trae en null.
    const { issuer: _issuer, media: _media, ...bare } = DOCUMENT;
    const { reason: _reason, ...signature } = VERIFIED;
    const report = build(parts([AGR003], { document: bare, signature }));
    expect(report.signature).toEqual({ ...VERIFIED, reason: null });
    expect(report.document).toEqual({ ...bare, issuer: null, media: null });
    expect(Object.keys(report.document)).toEqual(['fileName', 'declarationId', 'revision', 'jdx', 'sha256', 'size', 'declaredProfiles', 'issuer', 'media']);
    expect(build(parts([])).document).toEqual(DOCUMENT);
    // Los campos del reporte, en el orden del schema, y nada compartido con las partes.
    const p = parts([AGR003], { document: structuredClone(DOCUMENT) });
    const full = build(p);
    expect(Object.keys(full)).toEqual([
      'jdxReport', 'valid', 'disposition', 'exitCode', 'validator', 'options', 'document', 'appliedProfiles', 'checks',
      'signature', 'trustList', 'summary', 'results', 'omitted',
    ]);
    expect(full.omitted).toEqual([]);
    expect(full).toMatchObject({ jdxReport: '1.0', appliedProfiles: ['https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.0'], trustList: { seq: 1, expiresAt: '2026-12-29T00:00:00-03:00' } });
    (p.document.media as { size: number }[])[0]!.size = 1;
    (p.results[0]!.params as { percent: number }).percent = 99;
    expect([full.document.media?.[0]?.size, full.results[0]?.params]).toEqual([5234011, { percent: 30, cap: 25 }]);
  });
});

describe('resultados que el reporte no lista', () => {
  it('omitted results count in summary and checks, and the report lists them by code', () => {
    const report = build(parts([REF002, AGR003], {
      omitted: [
        { ruleId: 'JDX-AGR-003', level: 'warning', count: 4 },
        { ruleId: 'JDX-REF-002', level: 'error', count: 250 },
        { ruleId: 'JDX-MED-007', level: 'error', count: 3 },
      ],
    }));
    expect(report.summary).toEqual({ error: 254, warning: 5, info: 0 });
    // Un bucket sin resultados listados también lo dicen los que no se listan.
    expect(report.checks).toMatchObject({ core: 'failed', media: 'failed', profile: 'warning' });
    // Por código, en el orden del reporte: el paso y el código.
    expect(report.omitted).toEqual([
      { ruleId: 'JDX-REF-002', count: 250 }, { ruleId: 'JDX-MED-007', count: 3 }, { ruleId: 'JDX-AGR-003', count: 4 },
    ]);
    expect(head(report)).toEqual({ valid: false, disposition: 'reject', exitCode: 1 });
    // Los de un código, de varios niveles, se suman; un paso que dejó de buscar no sabe cuántos más hay.
    const sch: Finding = { ruleId: 'JDX-SCH-001', instanceLocation: '/works/0', keywordLocation: '/$defs/Work/required', params: { keyword: 'required', missingProperty: 'titles' } };
    const stopped = build(parts([JSN001, sch], {
      evaluated: new Set(['environment', 'json', 'schema']),
      omitted: [{ ruleId: 'JDX-SIG-001', level: 'warning', count: 1 }, { ruleId: 'JDX-SIG-001', level: 'error', count: 2 }, { ruleId: 'JDX-SCH-001', level: 'error', count: 1 }],
      stopped: ['JDX-SCH-001', 'JDX-JSN-001'],
    }));
    expect(stopped.omitted).toEqual([{ ruleId: 'JDX-JSN-001', count: null }, { ruleId: 'JDX-SCH-001', count: null }, { ruleId: 'JDX-SIG-001', count: 3 }]);
    expect(stopped.summary).toEqual({ error: 5, warning: 1, info: 0 });
    // Un DEC-005 que no se lista también da ignore.
    expect(head(build(parts([], { omitted: [{ ruleId: 'JDX-DEC-005', level: 'info', count: 1 }] })))).toEqual({ valid: true, disposition: 'ignore', exitCode: 0 });
  });

  it('the cap never changes summary, valid, exitCode, disposition or checks', () => {
    // El reporte con todos los resultados y el reporte con el tope son iguales salvo results y omitted.
    const codes: Finding[] = [REF002, AGR003, DEC005, SIG004, MED007, { ruleId: 'JDX-SIG-001', instanceLocation: '' }, { ruleId: 'JDX-CMP-001', instanceLocation: '/works/0', context: { work: 'w1' } }];
    const finding = fc.record({ base: fc.constantFrom(...codes), at: fc.nat(400), level: fc.constantFrom(undefined, 'warning', 'error', 'info') })
      .map(({ base, at, level }): Finding => ({
        ...base, instanceLocation: `${base.instanceLocation}/${at}`,
        ...(base.ruleId === 'JDX-SIG-001' && level !== undefined ? { level: level as 'warning' | 'error' | 'info' } : {}),
      }));
    fc.assert(
      fc.property(fc.array(finding, { maxLength: 900 }), fc.boolean(), fc.constantFrom('error', 'warning'), (findings, hasState, failOn) => {
        const options = { ...parts([]).options, failOn: failOn as 'error' | 'warning' };
        const ctx = { catalog, profile, lang: 'es' as const };
        const full = buildReport(parts(findings, { hasState, options }));
        const capped = capFindings(findings, ctx);
        const cut = buildReport(parts([], { hasState, options, results: capped.listed.map((f) => toResult(f, ctx)), omitted: capped.omitted }));
        const { results: fullResults, omitted: fullOmitted, ...fullRest } = full;
        const { results: cutResults, omitted: cutOmitted, ...cutRest } = cut;
        expect(cutRest).toEqual(fullRest);
        expect(exitCode(cut, 'warning')).toBe(exitCode(full, 'warning'));
        expect(fullOmitted).toEqual([]);
        // Lo listado es parte de todo; lo que falta, lo cuenta omitted.
        expect(cutResults.length + (cutOmitted ?? []).reduce((n, o) => n + (o.count ?? 0), 0)).toBe(fullResults.length);
        const left = new Map<string, number>();
        for (const r of fullResults) left.set(JSON.stringify(r), (left.get(JSON.stringify(r)) ?? 0) + 1);
        for (const r of cutResults) left.set(JSON.stringify(r), (left.get(JSON.stringify(r)) ?? 0) - 1);
        expect([...left.values()].every((n) => n >= 0)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
