/**
 * Los resultados del reporte: cada hallazgo toma su nivel (el del hallazgo, el
 * que le da el perfil o el fijo del catálogo), su fuente (la capa de la regla,
 * o el perfil aplicado) y su mensaje en el idioma pedido, y salen en un orden
 * que no depende de cómo se juntaron.
 */
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { VERSION } from '../../../src/generated/version.js';
import { bundledProfiles, resolveProfile } from '../../../src/profile/resolve.js';
import { sortResults, toResult } from '../../../src/report/results.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { Finding, JsonValue, Profile, ResolvedProfile } from '../../../src/types.js';
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
