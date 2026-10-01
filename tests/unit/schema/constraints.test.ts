/**
 * Las 18 restricciones condicionales del overlay en el schema abierto: por id,
 * al menos un caso que pasa y uno que no, aplicados como variantes del ejemplo
 * (tests/fixtures/constraints.json).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { segmentsOf } from '../../../src/json/pointer.js';
import { generateSchema } from '../../../src/schema/generate.js';
import { loadModel } from '../../../src/schema/model.js';
import { compileSchemas } from '../../../src/schema/validators.js';
import type { JsonValue } from '../../../src/types.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string): string => readFileSync(`${ROOT}${rel}`, 'utf8');
const MODEL = loadModel(JSON.parse(read('schema/src/types.json')), JSON.parse(read('schema/src/types.overlay.json')));
const OPEN = generateSchema(MODEL, '1.0', { strict: false }) as { $defs: Record<string, { allOf?: unknown[] }> };
const EXAMPLE = JSON.parse(read('docs/ejemplo/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json')) as JsonValue;
const validators = compileSchemas({ minors: ['1.0'], open: { '1.0': OPEN }, strict: {}, index: {}, aux: {} });

interface Positive { name: string; set: Record<string, JsonValue> }
interface Negative extends Positive { at: string; errors: string[] }
const CASES = JSON.parse(read('tests/fixtures/constraints.json')) as Record<string, { positive: Positive[]; negative: Negative[] }>;

/** El ejemplo con cada valor de `set` en su puntero (se agrega o se reemplaza). */
function variant(set: Record<string, JsonValue>): JsonValue {
  const doc = structuredClone(EXAMPLE);
  for (const [pointer, value] of Object.entries(set)) {
    const segments = segmentsOf(pointer);
    const last = segments.pop() as string;
    let node = doc as { [k: string]: JsonValue };
    for (const s of segments) node = node[s] as { [k: string]: JsonValue };
    node[last] = structuredClone(value);
  }
  return doc;
}

const validate = (set: Record<string, JsonValue>) => validators.validateDocument('1.0', false, variant(set));

describe('restricciones condicionales', () => {
  it('every constraint id has at least one positive and one negative case', () => {
    expect(Object.keys(CASES).sort()).toEqual(MODEL.overlay.constraints.map((c) => c.id).sort());
    for (const [id, { positive, negative }] of Object.entries(CASES)) {
      expect(positive.length, id).toBeGreaterThan(0);
      expect(negative.length, id).toBeGreaterThan(0);
    }
  });

  it('oneOfRequired ids have both and neither negatives', () => {
    const oneOf = MODEL.overlay.constraints.filter((c) => c.kind === 'oneOfRequired');
    expect(oneOf).toHaveLength(4);
    for (const { id } of oneOf) {
      const names = CASES[id]?.negative.map((n) => n.name) ?? [];
      expect(names.some((n) => n.endsWith(' with both')), id).toBe(true);
      expect(names.some((n) => n.endsWith(' with neither')), id).toBe(true);
    }
  });

  it('each positive case is valid and each negative invalid under open', () => {
    for (const [id, { positive, negative }] of Object.entries(CASES)) {
      for (const p of positive) expect(validate(p.set), `${id}: ${p.name}`).toEqual([]);
      for (const n of negative) expect(validate(n.set).length, `${id}: ${n.name}`).toBeGreaterThan(0);
    }
    // Los casos negativos, todos.
    const names = Object.values(CASES).flatMap((c) => c.negative.map((n) => n.name));
    for (const name of [
      'Term fixed without duration', 'Term protectionPeriod with duration', 'Agreement protectionPeriod with endDate',
      'PostTermCollection date without endDate', 'PostTermCollection openEnded with endDate',
      'InvestedAmount determined without currency', 'InvestedAmount undetermined with amount', 'Media delivered false with path',
      'organization name with given', 'WorkRef with both', 'WorkRef with neither', 'Component with both', 'Component with neither',
      'Sample with both', 'Sample with neither', 'AgreementParent with both', 'AgreementParent with neither',
      'External without titles and identifiers', 'ExternalRecording without title and identifiers', 'Identifier TAX_ID without type',
      'Identifier SOCIETY_WORK without society', 'CATALOG_NUMBER without issuer', 'Name without full and family',
    ]) {
      expect(names, name).toContain(name);
    }
  });

  it('constraint subschemas declare type', () => {
    const untyped: string[] = [];
    const walk = (node: unknown, pointer: string): void => {
      if (typeof node !== 'object' || node === null) return;
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${pointer}/${i}`));
        return;
      }
      const sub = node as Record<string, unknown>;
      const forbidden = JSON.stringify(sub) === '{"not":{}}' || (pointer.endsWith('/not') && JSON.stringify(sub) === '{}');
      if (!forbidden && !('type' in sub)) untyped.push(pointer);
      for (const key of ['anyOf', 'oneOf', 'if', 'then', 'else', 'items']) if (key in sub) walk(sub[key], `${pointer}/${key}`);
      for (const [name, child] of Object.entries((sub.properties ?? {}) as Record<string, unknown>)) walk(child, `${pointer}/properties/${name}`);
    };
    const withConstraints = [...new Set(MODEL.overlay.constraints.map((c) => c.type))];
    for (const typeName of withConstraints) {
      const allOf = OPEN.$defs[typeName]?.allOf ?? [];
      // Una entrada por restricción, en el orden del overlay, con su id en $comment.
      expect(allOf.map((entry) => (entry as { $comment: string }).$comment)).toEqual(
        MODEL.overlay.constraints.filter((c) => c.type === typeName).map((c) => c.id),
      );
      allOf.forEach((entry, i) => walk(entry, `/$defs/${typeName}/allOf/${i}`));
    }
    expect(withConstraints).toHaveLength(14);
    expect(untyped).toEqual([]);
  });

  it('negative case errors point at the constrained object', () => {
    for (const [id, { negative }] of Object.entries(CASES)) {
      const c = MODEL.overlay.constraints.find((x) => x.id === id);
      for (const n of negative) {
        const errors = validate(n.set);
        const where = `${id}: ${n.name}`;
        expect(errors.map((e) => e.instanceLocation).sort(), where).toEqual([...n.errors].sort());
        for (const e of errors) {
          expect(e.instanceLocation === n.at || e.instanceLocation.startsWith(`${n.at}/`), where).toBe(true);
          // Cada error sale de la restricción: su lugar está dentro de su entrada de allOf.
          expect(e.keywordLocation.startsWith(`/$defs/${c?.type}/allOf/`), `${where}: ${e.keywordLocation}`).toBe(true);
        }
      }
    }
  });
});
