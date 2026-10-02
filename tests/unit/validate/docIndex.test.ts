/**
 * El índice del documento: los objetos de las cinco listas raíz por su id
 * local, que es único en todo el archivo (JDX-REF-001), y cada referencia de
 * los lugares que anota x-jdx-ref con el objeto al que apunta (JDX-REF-002 si
 * no es un id de su lista), con el context del objeto de la lista raíz que la
 * contiene.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { catalogRule } from '../../../src/report/results.js';
import { schemaBundle } from '../../../src/schema/bundle.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import { buildDocIndex, contextAt, valuesAt } from '../../../src/validate/docIndex.js';
import type { JdxDocument } from '../../../src/generated/jdx-types.js';
import type { Finding, JsonValue, SchemaIndex } from '../../../src/types.js';

const EXAMPLE = readFileSync(new URL('../../../docs/ejemplo/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json', import.meta.url), 'utf8');
const INDEX = schemaBundle(files).index['1.0'] as SchemaIndex;
const validators = defaultValidators();
const catalog = loadCatalog(JSON.parse(files['catalog/1.0/rules.json'] as string) as JsonValue, validators);

type Doc = { [k: string]: JsonValue };
const at = (doc: Doc, list: string, i: number): Doc => (doc[list] as Doc[])[i]!;
/** El ejemplo como valor, con un cambio. */
function example(change: (doc: Doc) => void = () => {}): Doc {
  const doc = JSON.parse(EXAMPLE) as Doc;
  change(doc);
  return doc;
}
const build = (doc: Doc) => buildDocIndex(doc as unknown as JdxDocument, INDEX);
const ref002 = (instanceLocation: string, value: string, list: string, context?: Finding['context']): Finding => ({
  ruleId: 'JDX-REF-002', instanceLocation, ...(context === undefined ? {} : { context }), params: { value, list },
});

describe('buildDocIndex', () => {
  it('the example resolves 43 references', () => {
    const doc = example();
    const { index, findings } = build(doc);
    expect(findings).toEqual([]);
    expect(index.refs).toHaveLength(43);
    expect(index.refs.filter((r) => r.target === null)).toEqual([]);
    expect([...index.byId.keys()]).toEqual(['p1', 'p2', 'p5', 'p6', 'w1', 'w2', 'r1', 'a1', 'm1', 'm2', 'm3', 'm4', 'm5']);
    expect(index.refs.find((r) => r.pointer === '/works/0/shares/1/agreement')).toEqual({
      pointer: '/works/0/shares/1/agreement',
      value: 'a1',
      site: { pattern: '/works/*/shares/*/agreement', list: 'agreements', refTypes: ['publishing', 'subPublishing', 'administration', 'assignment', 'writerSplit'] },
      target: { list: 'agreements', index: 0, pointer: '/agreements/0', id: 'a1', obj: at(doc, 'agreements', 0) },
    });
    // Las referencias van en el orden de los lugares del índice y, en cada lugar, en el del documento.
    expect(index.refs.slice(0, 4).map((r) => r.pointer)).toEqual([
      '/declaration/declarant', '/parties/2/representatives/0/party', '/works/0/contributors/0/party', '/works/0/contributors/1/party',
    ]);
    expect(index.get('parties', 'p5')?.pointer).toBe('/parties/2');
    expect(index.get('works', 'p5')).toBeUndefined();
    expect(index.get('media', 'm9')).toBeUndefined();
    expect(index.unresolved('')).toBe(false);
  });

  it('duplicate id across lists → REF-001 at the second /id', () => {
    // m5 pasa a llamarse a1: el contrato va antes que los archivos, y las referencias a m5 ya no resuelven.
    const doc = example((d) => {
      at(d, 'media', 4).id = 'a1';
      at(d, 'media', 3).id = 'a1';
    });
    const { index, findings } = build(doc);
    expect(findings.filter((f) => f.ruleId === 'JDX-REF-001')).toEqual([
      { ruleId: 'JDX-REF-001', instanceLocation: '/media/3/id', params: { id: 'a1' } },
      { ruleId: 'JDX-REF-001', instanceLocation: '/media/4/id', params: { id: 'a1' } },
    ]);
    // byId guarda la primera; en cada lista, get busca entre los de esa lista.
    expect(index.byId.get('a1')?.pointer).toBe('/agreements/0');
    expect(index.get('agreements', 'a1')?.pointer).toBe('/agreements/0');
    expect(index.get('media', 'a1')?.pointer).toBe('/media/3');
    expect(findings.filter((f) => f.ruleId === 'JDX-REF-002')).toEqual([
      ref002('/edition/media/1', 'm4', 'media'),
      ref002('/edition/media/2', 'm5', 'media'),
    ]);
  });

  it('unknown id → REF-002', () => {
    expect(build(example((d) => {
      ((at(d, 'works', 0).shares as Doc[])[0]!).party = 'p9';
    })).findings).toEqual([ref002('/works/0/shares/0/party', 'p9', 'parties', { work: 'w1' })]);
  });

  it('party id in an agreement slot → REF-002', () => {
    const { index, findings } = build(example((d) => {
      ((at(d, 'works', 1).shares as Doc[])[1]!).agreement = 'p1';
    }));
    expect(findings).toEqual([ref002('/works/1/shares/1/agreement', 'p1', 'agreements', { work: 'w2' })]);
    expect(index.refs.find((r) => r.pointer === '/works/1/shares/1/agreement')?.target).toBeNull();
  });

  it('refs inside External and Component are resolved', () => {
    const writer = (filing: string) => ({ names: [{ type: 'legal', full: 'Autora Desconocida', registrations: [{ registry: 'DNDA_AR', filing }] }] });
    const doc = example((d) => {
      at(d, 'works', 1).composite = { components: [{ work: 'w1' }, { external: { titles: [{ text: 'Otra' }], writers: [writer('m9')] } }] };
      at(d, 'works', 1).excerptOf = { external: { titles: [{ text: 'Una más' }], writers: [writer('m1')] } };
      at(d, 'works', 0).version = { type: 'arrangement', original: { external: { titles: [{ text: 'La original' }], writers: [writer('m2')] } } };
    });
    const { index, findings } = build(doc);
    const found = (pointer: string) => index.refs.find((r) => r.pointer === pointer)?.target?.pointer ?? null;
    expect(found('/works/1/composite/components/0/work')).toBe('/works/0');
    expect(found('/works/1/excerptOf/external/writers/0/names/0/registrations/0/filing')).toBe('/media/0');
    expect(found('/works/0/version/original/external/writers/0/names/0/registrations/0/filing')).toBe('/media/1');
    expect(findings).toEqual([ref002('/works/1/composite/components/1/external/writers/0/names/0/registrations/0/filing', 'm9', 'media', { work: 'w2' })]);
  });

  it('unresolved(pointer) marks dependent objects', () => {
    const { index } = build(example((d) => {
      ((at(d, 'works', 1).shares as Doc[])[0]!).party = 'p9';
    }));
    expect(['', '/works', '/works/1', '/works/1/shares', '/works/1/shares/0', '/works/1/shares/0/party'].map((p) => index.unresolved(p))).toEqual(Array(6).fill(true));
    expect(['/works/0', '/works/1/shares/1', '/works/1/authorship', '/parties', '/agreements/0'].map((p) => index.unresolved(p))).toEqual(Array(5).fill(false));
  });

  it('REF-002 carries the context of the root object that holds it, and none in declaration or edition', () => {
    const { findings } = build(example((d) => {
      (d.declaration as Doc).declarant = 'p9';
      ((at(d, 'parties', 2).representatives as Doc[])[0]!).party = 'p8';
      (at(d, 'recordings', 0).works as JsonValue[])[0] = 'w9';
      ((at(d, 'agreements', 0).parties as Doc[])[0]!).party = 'p7';
      ((((at(d, 'media', 0).evidence as Doc).signers as Doc[])[0]!)).party = 'p4';
      ((d.edition as Doc).works as JsonValue[])[0] = 'w8';
    }));
    expect(findings).toEqual([
      ref002('/declaration/declarant', 'p9', 'parties'),
      ref002('/parties/2/representatives/0/party', 'p8', 'parties', { party: 'p5' }),
      ref002('/recordings/0/works/0', 'w9', 'works', { recording: 'r1' }),
      ref002('/agreements/0/parties/0/party', 'p7', 'parties', { agreement: 'a1' }),
      ref002('/media/0/evidence/signers/0/party', 'p4', 'parties', { media: 'm1' }),
      ref002('/edition/works/0', 'w8', 'works'),
    ]);
    // Los hallazgos cumplen los schemas de su regla en el catálogo.
    const problems = [...findings, { ruleId: 'JDX-REF-001', instanceLocation: '/works/1/id', params: { id: 'w1' } } as Finding].flatMap((f) => [
      ...validators.validateWith(catalogRule(catalog, f.ruleId).resultParamsSchema, (f.params ?? {}) as JsonValue),
      ...validators.validateWith(catalogRule(catalog, f.ruleId).contextSchema, (f.context ?? {}) as JsonValue),
    ]);
    expect(problems).toEqual([]);
  });

  it('contextAt names the root object of a pointer from its first two segments', () => {
    const doc = example();
    expect(contextAt(doc, '/works/1/shares/0/percent')).toEqual({ work: 'w2' });
    expect(contextAt(doc, '/works/1')).toEqual({ work: 'w2' });
    expect(contextAt(doc, '/media/4/sha256')).toEqual({ media: 'm5' });
    expect(contextAt(doc, `/parties/0/extensions/${'k'.repeat(100_000)}`)).toEqual({ party: 'p1' });
    for (const none of ['', '/works', '/works/7', '/works/01/titles', '/declaration/createdAt', '/edition/works/0', '/extensions/ar.example.x']) {
      expect(contextAt(doc, none), none).toBeUndefined();
    }
  });

  it('valuesAt visits in the order of the pattern tree, not in the order of the document', () => {
    // En cada lugar, los patrones que terminan ahí; en una lista, los elementos por * y después los índices fijos;
    // cada grupo en el orden en que aparece por primera vez en los patrones.
    const doc = { a: [{ x: 1, y: 2 }, { x: 3, y: 4 }], b: 5 } as unknown as JsonValue;
    const seen: string[] = [];
    valuesAt(doc, ['/a/1/x', '/a/*/y', '/b', '/a/*/x'], (pointer, _value, _context, _container, pattern) => seen.push(`${pointer} ${pattern}`));
    expect(seen).toEqual(['/a/0/y /a/*/y', '/a/0/x /a/*/x', '/a/1/y /a/*/y', '/a/1/x /a/*/x', '/a/1/x /a/1/x', '/b /b']);
  });
});
