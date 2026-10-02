/**
 * Los resultados del reporte: cada hallazgo toma su nivel (el del hallazgo, el
 * que le da el perfil o el fijo del catálogo), su fuente (la capa de la regla,
 * o el perfil aplicado) y su mensaje en el idioma pedido, y salen en un orden
 * que no depende de cómo se juntaron.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { VERSION } from '../../../src/generated/version.js';
import { MAX_FAILURE_POINTER_CHARS, MAX_FAILURES } from '../../../src/json/parse.js';
import { bundledProfiles, resolveProfile } from '../../../src/profile/resolve.js';
import { capFindings, MAX_RESULT_CHARS, MAX_RESULTS_PER_RULE, sortResults, toResult } from '../../../src/report/results.js';
import { MAX_SCHEMA_ERROR_CHARS, MAX_SCHEMA_ERRORS } from '../../../src/schema/ajv.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { Finding, JsonValue, Profile, ResolvedProfile, Result } from '../../../src/types.js';
import { sadaicProfile } from '../../helpers/sadaicProfile.js';

const validators = defaultValidators();
const catalog = loadCatalog(JSON.parse(files['catalog/1.0/rules.json'] as string) as JsonValue, validators);
const deps = { catalog, bundled: bundledProfiles(files), validatorVersion: VERSION, validators };

function resolved(ref: string | Profile): ResolvedProfile {
  const outcome = resolveProfile(ref, deps);
  if (!outcome.ok) throw new Error(`no resolvió: ${JSON.stringify(outcome.findings)}`);
  return outcome.profile;
}
const sadaic = resolved('sadaic/0.1');

const AGR003: Finding = {
  ruleId: 'JDX-AGR-003', instanceLocation: '/agreements/0/publisherShare/percent',
  context: { agreement: 'a1' }, params: { percent: 30, cap: 25 },
};

describe('resultados', () => {
  it('results order is deterministic', () => {
    const findings: Finding[] = [
      { ruleId: 'JDX-POL-001', instanceLocation: '', params: { profile: 'https://jdx.jupiter.ar/profiles/sadaic/0.1' } },
      { ruleId: 'JDX-CMP-001', instanceLocation: '/works/10', context: { work: 'w11' } },
      { ruleId: 'JDX-CMP-001', instanceLocation: '/works/2', context: { work: 'w3' } },
      { ruleId: 'JDX-MED-007', instanceLocation: '/media/0/path', context: { media: 'm1' }, params: { path: 'a.pdf' } },
      { ruleId: 'JDX-SIG-002', instanceLocation: '', params: { reason: 'signature' } },
      { ruleId: 'JDX-REF-002', instanceLocation: '/works/0/shares/1/party', context: { work: 'w1' }, params: { value: 'p9', list: 'parties' } },
      { ruleId: 'JDX-REF-002', instanceLocation: '/works/0/shares/0/party', context: { work: 'w1' }, params: { value: 'p8', list: 'parties' } },
      { ruleId: 'JDX-SCH-001', instanceLocation: '/works/0', keywordLocation: '/$defs/Work/required', params: { keyword: 'required', missingProperty: 'titles' } },
      { ruleId: 'JDX-SCH-001', instanceLocation: '/works/0', keywordLocation: '/$defs/Work/properties/iswc/pattern', params: { keyword: 'pattern' } },
      { ruleId: 'JDX-JSN-001', instanceLocation: '/a', params: { reason: 'syntax', offset: 4 } },
      { ruleId: 'JDX-ENV-010', instanceLocation: '', params: { option: '--received-at', reason: 'missing' } },
      AGR003,
    ];
    const results = findings.map((f) => toResult(f, { catalog, profile: sadaic, lang: 'es' }));
    const expected = [
      // Entorno, JSON, versión y schema, y después las reglas: núcleo, firma, archivos de la entrega, perfil y política.
      ['JDX-ENV-010', ''],
      ['JDX-JSN-001', '/a'],
      ['JDX-SCH-001', '/works/0'],
      ['JDX-SCH-001', '/works/0'],
      ['JDX-REF-002', '/works/0/shares/0/party'],
      ['JDX-REF-002', '/works/0/shares/1/party'],
      ['JDX-SIG-002', ''],
      ['JDX-MED-007', '/media/0/path'],
      ['JDX-AGR-003', '/agreements/0/publisherShare/percent'],
      // Los índices de las listas se comparan como números: /works/2 antes que /works/10.
      ['JDX-CMP-001', '/works/2'],
      ['JDX-CMP-001', '/works/10'],
      ['JDX-POL-001', ''],
    ];
    const sorted = sortResults(results, catalog);
    expect(sorted.map((r) => [r.ruleId, r.instanceLocation])).toEqual(expected);
    // Dos SCH-001 en el mismo lugar se ordenan por el lugar en el schema.
    expect(sorted.filter((r) => r.ruleId === 'JDX-SCH-001').map((r) => r.keywordLocation)).toEqual([
      '/$defs/Work/properties/iswc/pattern',
      '/$defs/Work/required',
    ]);
    // El mismo orden desde cualquier orden de entrada, sin tocar la entrada.
    const reversed = [...results].reverse();
    const before = structuredClone(reversed);
    expect(sortResults(reversed, catalog)).toEqual(sorted);
    expect(reversed).toEqual(before);
    for (let shift = 1; shift < results.length; shift++) {
      expect(sortResults([...results.slice(shift), ...results.slice(0, shift)], catalog)).toEqual(sorted);
    }
  });

  it('toResult level: Finding.level, then profile level, then catalog level', () => {
    const ctx = { catalog, profile: sadaic, lang: 'es' as const };
    // El fijo del catálogo para una regla del núcleo.
    expect(toResult({ ruleId: 'JDX-REF-002', instanceLocation: '/works/0/shares/0/party', params: { value: 'p9', list: 'parties' } }, ctx).level).toBe('error');
    expect(toResult({ ruleId: 'JDX-DEC-005', instanceLocation: '/declaration/revision', params: { revision: 2, lastIngestedRevision: 2 } }, ctx).level).toBe('info');
    // El del perfil para una regla de perfil: sadaic/0.1 da warning a todas.
    expect(toResult(AGR003, ctx).level).toBe('warning');
    const strict = resolved({ ...sadaicProfile(), defaultLevel: 'error' });
    expect(toResult(AGR003, { ...ctx, profile: strict }).level).toBe('error');
    const oneInfo = resolved({ ...sadaicProfile(), rules: sadaicProfile().rules.map((r) => (r.ruleId === 'JDX-AGR-003' ? { ...r, level: 'info' as const } : r)) });
    expect(toResult(AGR003, { ...ctx, profile: oneInfo }).level).toBe('info');
    // El del hallazgo, cuando lo trae, gana a los dos: JDX-SIG-001 lleva error en el catálogo.
    expect(toResult({ ruleId: 'JDX-SIG-001', instanceLocation: '', level: 'warning' }, ctx).level).toBe('warning');
    expect(toResult({ ruleId: 'JDX-SIG-001', instanceLocation: '' }, ctx).level).toBe('error');
    expect(toResult({ ...AGR003, level: 'error' }, ctx).level).toBe('error');
    // Una regla que no está en el catálogo, o de perfil sin perfil, es un error de programación.
    expect(() => toResult({ ruleId: 'JDX-XYZ-999', instanceLocation: '' }, ctx)).toThrow('JDX-XYZ-999: no está en el catálogo');
    expect(() => toResult(AGR003, { ...ctx, profile: null })).toThrow('JDX-AGR-003: regla de perfil sin perfil aplicado');
  });

  it('toResult source follows the catalog layer', () => {
    const ctx = { catalog, profile: sadaic, lang: 'es' as const };
    const sourceOf = (f: Finding, profile: ResolvedProfile | null = sadaic) => toResult(f, { ...ctx, profile }).source;
    expect(sourceOf({ ruleId: 'JDX-ENV-010', instanceLocation: '', params: { option: '--env', reason: 'missing' } }, null)).toBe('environment');
    expect(sourceOf({ ruleId: 'JDX-JSN-001', instanceLocation: '', params: { reason: 'empty' } })).toBe('core');
    expect(sourceOf({ ruleId: 'JDX-SCH-001', instanceLocation: '/jdx', keywordLocation: '/properties/jdx/pattern', params: { keyword: 'pattern' } })).toBe('schema');
    expect(sourceOf({ ruleId: 'JDX-SIG-001', instanceLocation: '', level: 'warning' })).toBe('policy');
    expect(sourceOf(AGR003)).toBe('profile:sadaic/0.1@0.1.0');
    // El source del perfil tal cual, también con la marca de un perfil leído de un archivo.
    const local = resolved({ ...sadaicProfile(), defaultLevel: 'error' });
    expect(local.source).toBe('profile:sadaic/0.1@0.1.0+local');
    expect(sourceOf(AGR003, local)).toBe('profile:sadaic/0.1@0.1.0+local');
  });

  it('toResult message uses lang', () => {
    const result = (lang: 'es' | 'pt' | 'en') => toResult(AGR003, { catalog, profile: sadaic, lang });
    // El resultado del ejemplo del reporte, con sus campos en ese orden.
    expect(result('es')).toEqual({
      ruleId: 'JDX-AGR-003', level: 'warning', source: 'profile:sadaic/0.1@0.1.0',
      instanceLocation: '/agreements/0/publisherShare/percent', context: { agreement: 'a1' },
      message: 'El contrato da a la editora el 30 %; el tope es 25 %.',
      params: { percent: 30, cap: 25 },
    });
    expect(Object.keys(result('es'))).toEqual(['ruleId', 'level', 'source', 'instanceLocation', 'context', 'message', 'params']);
    expect(result('pt').message).toBe('O contrato dá à editora 30 %; o teto é 25 %.');
    expect(result('en').message).toBe('The agreement gives the publisher 30%; the cap is 25%.');
    // keywordLocation solo si el hallazgo lo trae; ni context ni params si no los trae.
    const sch = toResult({ ruleId: 'JDX-SCH-001', instanceLocation: '/jdx', keywordLocation: '/properties/jdx/pattern', params: { keyword: 'pattern' } }, { catalog, profile: sadaic, lang: 'en' });
    expect(sch).toEqual({
      ruleId: 'JDX-SCH-001', level: 'error', source: 'schema', instanceLocation: '/jdx', keywordLocation: '/properties/jdx/pattern',
      message: 'The data does not conform to the JDX schema (pattern).', params: { keyword: 'pattern' },
    });
    const bare = toResult({ ruleId: 'JDX-ENV-003', instanceLocation: '' }, { catalog, profile: null, lang: 'es' });
    expect(Object.keys(bare)).toEqual(['ruleId', 'level', 'source', 'instanceLocation', 'message']);
    // El resultado no comparte objetos con el hallazgo.
    const finding = structuredClone(AGR003);
    const copy = toResult(finding, { catalog, profile: sadaic, lang: 'es' });
    (finding.params as { percent: number }).percent = 40;
    (finding.context as { agreement: string }).agreement = 'a2';
    expect([copy.params, copy.context]).toEqual([{ percent: 30, cap: 25 }, { agreement: 'a1' }]);
  });
});

describe('el orden de los lugares', () => {
  it('pointers compare by segments, with indexes as numbers before names and a prefix first', () => {
    // La definición, partiendo los punteros: el orden de sortResults tiene que ser el mismo.
    const isIndex = (s: string) => /^(?:0|[1-9]\d*)$/u.test(s);
    const reference = (a: string, b: string): number => {
      const as = a.split('/');
      const bs = b.split('/');
      for (let i = 0; i < Math.min(as.length, bs.length); i++) {
        const x = as[i] as string;
        const y = bs[i] as string;
        if (x === y) continue;
        if (isIndex(x) && isIndex(y)) return x.length - y.length || (x < y ? -1 : 1);
        if (isIndex(x) !== isIndex(y)) return isIndex(x) ? -1 : 1;
        return x < y ? -1 : 1;
      }
      return as.length - bs.length;
    };
    const segment = fc.oneof(fc.nat(30).map(String), fc.constantFrom('', '0', '00', '01', '1a', 'a', 'ab', 'b', '~1', 'ñ', '\u{1F600}'));
    const pointer = fc.array(segment, { maxLength: 5 }).map((segments) => segments.map((s) => `/${s}`).join(''));
    fc.assert(
      fc.property(fc.array(pointer, { maxLength: 40 }), (pointers) => {
        const results = pointers.map((p) => toResult({ ruleId: 'JDX-REF-002', instanceLocation: p, params: { value: 'p9', list: 'parties' } }, { catalog, profile: sadaic, lang: 'es' }));
        expect(sortResults(results, catalog).map((r) => r.instanceLocation)).toEqual([...pointers].sort(reference));
      }),
      { numRuns: 500 },
    );
  });
});

describe('el tope de resultados', () => {
  const ctx = { catalog, profile: sadaic, lang: 'es' as const };
  const ref = (instanceLocation: string, value = 'p9'): Finding => ({
    ruleId: 'JDX-REF-002', instanceLocation, context: { work: 'w1' }, params: { value, list: 'parties' },
  });

  it('capFindings lists at most MAX_RESULTS_PER_RULE of each code, the first in the report order', () => {
    // El mismo tope para todo código, igual al de las fallas del parser y al de los errores de schema.
    expect([MAX_RESULTS_PER_RULE, MAX_RESULT_CHARS]).toEqual([100, 1_000_000]);
    expect([MAX_FAILURES, MAX_SCHEMA_ERRORS, MAX_FAILURE_POINTER_CHARS, MAX_SCHEMA_ERROR_CHARS]).toEqual([
      MAX_RESULTS_PER_RULE, MAX_RESULTS_PER_RULE, MAX_RESULT_CHARS, MAX_RESULT_CHARS,
    ]);
    // 250 referencias desordenadas: quedan las 100 primeras en el orden del reporte (/works/2 antes que /works/10).
    const refs = Array.from({ length: 250 }, (_, i) => ref(`/works/${(i * 37) % 250}/shares/0/party`));
    const cmp: Finding[] = [{ ruleId: 'JDX-CMP-001', instanceLocation: '/works/3', context: { work: 'w4' } }, { ruleId: 'JDX-CMP-001', instanceLocation: '/works/1', context: { work: 'w2' } }];
    const { listed, omitted } = capFindings([...refs, ...cmp], ctx);
    expect(listed.filter((f) => f.ruleId === 'JDX-REF-002').map((f) => f.instanceLocation)).toEqual(
      Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => `/works/${i}/shares/0/party`),
    );
    expect(listed.filter((f) => f.ruleId === 'JDX-CMP-001').map((f) => f.instanceLocation)).toEqual(['/works/1', '/works/3']);
    expect(omitted).toEqual([{ ruleId: 'JDX-REF-002', level: 'error', count: 150 }]);
    // Lo que se lista es el hallazgo mismo; lo que no, se cuenta por nivel.
    expect(listed.every((f) => refs.includes(f) || cmp.includes(f))).toBe(true);
    const warnings = Array.from({ length: 120 }, (_, i): Finding => ({ ...cmp[0]!, instanceLocation: `/works/${i}` }));
    expect(capFindings(warnings, ctx).omitted).toEqual([{ ruleId: 'JDX-CMP-001', level: 'warning', count: 20 }]);
    expect(capFindings([], ctx)).toEqual({ listed: [], omitted: [] });
  });

  it('the character budget of a code stops its list at the result that reaches MAX_RESULT_CHARS', () => {
    // Cuentan el lugar y los textos de los params, también los de adentro de una lista.
    const long = (i: number): Finding => ref(`/works/${i}/shares/0/party`, 'v'.repeat(300_000));
    const { listed, omitted } = capFindings([5, 4, 3, 2, 1, 0].map(long), ctx);
    // 300 022, 600 044, 900 066 y 1 200 088 caracteres: el cuarto llega al tope y es el último.
    expect(listed.map((f) => f.instanceLocation)).toEqual([0, 1, 2, 3].map((i) => `/works/${i}/shares/0/party`));
    expect(omitted).toEqual([{ ruleId: 'JDX-REF-002', level: 'error', count: 2 }]);
    const nested = (i: number): Finding => ({ ruleId: 'JDX-SCH-001', instanceLocation: `/a${i}`, keywordLocation: '/enum', params: { keyword: 'enum', allowedValues: ['x'.repeat(600_000)] } });
    expect(capFindings([nested(0), nested(1), nested(2)], ctx).omitted).toEqual([{ ruleId: 'JDX-SCH-001', level: 'error', count: 1 }]);
    // Uno solo que pasa el tope se lista igual: cada código lista al menos uno.
    expect(capFindings([ref(`/${'k'.repeat(2_000_000)}`)], ctx).listed).toHaveLength(1);
  });

  it('capFindings keeps, of each code, a prefix of the report order', () => {
    // Contra sortResults de todos los resultados: el mismo prefijo de cada código, y los demás contados por nivel.
    const segment = fc.oneof(fc.nat(150).map(String), fc.constantFrom('a', 'b', '0x', '01', ''));
    const finding = fc.record({
      code: fc.constantFrom('JDX-REF-002', 'JDX-CMP-001', 'JDX-SIG-001'),
      at: fc.array(segment, { minLength: 0, maxLength: 3 }),
      value: fc.constantFrom('p1', 'p2', 'x'.repeat(30_000)),
      level: fc.constantFrom(undefined, 'warning', 'error'),
    }).map(({ code, at, value, level }): Finding => ({
      ruleId: code as Finding['ruleId'], instanceLocation: at.map((s) => `/${s}`).join(''),
      ...(code === 'JDX-SIG-001' && level !== undefined ? { level: level as 'warning' | 'error' } : {}),
      ...(code === 'JDX-CMP-001' ? { context: { work: value.slice(0, 2) } } : { params: { value, list: 'parties' } }),
    }));
    fc.assert(
      fc.property(fc.array(finding, { maxLength: 400 }), (findings) => {
        const all = sortResults(findings.map((f) => toResult(f, ctx)), catalog);
        const expected: Result[] = [];
        const counts = new Map<string, number>();
        const chars = new Map<string, number>();
        const dropped = new Map<string, number>();
        for (const r of all) {
          const n = counts.get(r.ruleId) ?? 0;
          const used = chars.get(r.ruleId) ?? 0;
          if (n < MAX_RESULTS_PER_RULE && used < MAX_RESULT_CHARS) {
            expected.push(r);
            counts.set(r.ruleId, n + 1);
            chars.set(r.ruleId, used + r.instanceLocation.length + (typeof r.params?.value === 'string' ? r.params.value.length : 0) + (typeof r.params?.list === 'string' ? r.params.list.length : 0));
          } else {
            dropped.set(`${r.ruleId} ${r.level}`, (dropped.get(`${r.ruleId} ${r.level}`) ?? 0) + 1);
          }
        }
        const capped = capFindings(findings, ctx);
        expect(sortResults(capped.listed.map((f) => toResult(f, ctx)), catalog)).toEqual(expected);
        expect(Object.fromEntries(capped.omitted.map((o) => [`${o.ruleId} ${o.level}`, o.count]))).toEqual(Object.fromEntries(dropped));
      }),
      { numRuns: 200 },
    );
  });
});
