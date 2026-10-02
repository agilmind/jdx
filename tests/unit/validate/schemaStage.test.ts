/**
 * Los pasos de JSON y de versión y schema. El JSON: un documento de más de
 * MAX_DOCUMENT_BYTES no se lee (JDX-JSN-001 `size`) y cada falla del parser da
 * un JDX-JSN-001 con su razón. La versión: una mayor que el validador no lee
 * (JDX-VER-001), un $schema que no corresponde a jdx (JDX-VER-002), una menor
 * más nueva que se valida con el abierto de la última conocida (JDX-VER-003) y
 * un perfil que no admite la versión (JDX-ENV-006, código de salida 2). El
 * schema: un JDX-SCH-001 por error del estricto de su menor, a lo sumo 100.
 *
 * Los casos de entradas hostiles miden tiempo con margen: lo que importa es el
 * orden de magnitud y que el reporte se pueda escribir.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { MAX_DEPTH } from '../../../src/json/parse.js';
import { buildReport } from '../../../src/report/build.js';
import { documentFacts } from '../../../src/report/document.js';
import { catalogRule, toResult } from '../../../src/report/results.js';
import { MAX_SCHEMA_ERROR_CHARS, MAX_SCHEMA_ERRORS } from '../../../src/schema/ajv.js';
import { schemaBundle } from '../../../src/schema/bundle.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import { jsonStage, MAX_DOCUMENT_BYTES } from '../../../src/validate/jsonStage.js';
import { schemaStage } from '../../../src/validate/schemaStage.js';
import type { Finding, JsonValue, ParsedJson, Profile, Report, SchemaStageOutcome } from '../../../src/types.js';
import { sadaicProfile } from '../../helpers/sadaicProfile.js';

const NAME = '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json';
const EXAMPLE = readFileSync(new URL(`../../../docs/ejemplo/${NAME}`, import.meta.url), 'utf8');
const OPEN_URL = 'https://jdx.jupiter.ar/schema/1.0/jdx.schema.json';
const STRICT_URL = 'https://jdx.jupiter.ar/schema/1.0/jdx.strict.schema.json';
const validators = defaultValidators();
const bundle = schemaBundle(files);
const catalog = loadCatalog(JSON.parse(files['catalog/1.0/rules.json'] as string) as JsonValue, validators);
const encode = (text: string) => new TextEncoder().encode(text);

type Doc = { [k: string]: JsonValue };
/** El ejemplo como valor, con un cambio. */
function example(change: (doc: Doc) => void = () => {}): Doc {
  const doc = JSON.parse(EXAMPLE) as Doc;
  change(doc);
  return doc;
}
/** El JSON leído de un texto que se sabe legible. */
function parsed(text: string): ParsedJson {
  const out = jsonStage(encode(text));
  if (!out.ok) throw new Error(`no se leyó: ${JSON.stringify(out.findings)}`);
  return out.json;
}
const stage = (doc: Doc | string, profile: Profile = sadaicProfile()): SchemaStageOutcome =>
  schemaStage(parsed(typeof doc === 'string' ? doc : JSON.stringify(doc)), { bundle, validators, profile });

/** El reporte de un archivo que terminó en estos hallazgos de JSON, versión o schema. */
function reportOf(bytes: Uint8Array, findings: readonly Finding[]): Report {
  return buildReport({
    validator: { name: 'jdx', version: '1.0.0', catalog: '1.0' },
    options: { env: 'sandbox', profile: 'sadaic/0.1', signature: 'optional', failOn: 'error', receivedAt: '2026-09-30T09:12:00-03:00', dir: false, dirLookup: null, lang: 'es' },
    document: documentFacts({ bytes, fileName: NAME }, null, false),
    appliedProfiles: ['https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.0'],
    outcome: 'completed',
    evaluated: new Set(['environment', 'json', 'schema']),
    hasState: false,
    signature: { status: 'notEvaluated', kid: null, issuer: null, env: null, reason: null },
    trustList: null,
    results: findings.map((f) => toResult(f, { catalog, profile: null, lang: 'es' })),
    catalog,
  });
}

/** Corre una entrada hostil por los dos pasos y arma su reporte: cuánto tardó, cuántos resultados y cuánto mide. */
function hostile(text: string): { ms: number; results: number; reportChars: number; reasons: string[] } {
  const bytes = encode(text);
  const started = performance.now();
  const json = jsonStage(bytes);
  let findings: Finding[];
  if (!json.ok) findings = json.findings;
  else {
    const outcome = schemaStage(json.json, { bundle, validators, profile: sadaicProfile() });
    findings = outcome.findings;
  }
  const reportChars = JSON.stringify(reportOf(bytes, findings), null, 2).length;
  return {
    ms: performance.now() - started,
    results: findings.length,
    reportChars,
    reasons: [...new Set(findings.map((f) => `${f.ruleId} ${String(f.params?.reason ?? f.params?.keyword)}`))],
  };
}

describe('jsonStage', () => {
  it('one JSN-001 per parser failure with params.reason', () => {
    expect(jsonStage(encode('{"a":1,"a":2,"b":1e400}'))).toEqual({
      ok: false,
      findings: [
        { ruleId: 'JDX-JSN-001', instanceLocation: '/a', params: { reason: 'duplicateKey', offset: 7 } },
        { ruleId: 'JDX-JSN-001', instanceLocation: '/b', params: { reason: 'numberRange', offset: 17 } },
      ],
    });
    expect(jsonStage(encode('﻿[1,'))).toEqual({
      ok: false,
      findings: [
        { ruleId: 'JDX-JSN-001', instanceLocation: '', params: { reason: 'bom', offset: 0 } },
        { ruleId: 'JDX-JSN-001', instanceLocation: '/1', params: { reason: 'syntax', offset: 6 } },
      ],
    });
    const ok = jsonStage(encode(EXAMPLE));
    expect(ok.ok && ok.json.numberTexts.get('/works/0/shares/0/percent')).toBe('12.5');
  });

  it('a 1M-deep value in /works/0/extensions → JSN-001 depth, no exception', () => {
    const text = JSON.stringify(example((doc) => {
      (doc.works as Doc[])[0]!.extensions = { 'ar.example.x': 'DEEP' };
    })).replace('"DEEP"', `${'['.repeat(1_000_000)}${']'.repeat(1_000_000)}`);
    expect(text.length).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
    const out = jsonStage(encode(text));
    // Raíz, works, la obra y extensions son 4 contenedores: el 65 es el arreglo 61 de la extensión.
    // El offset es en bytes: el ejemplo tiene letras con tilde antes.
    const deeper = `/works/0/extensions/ar.example.x${'/0'.repeat(MAX_DEPTH - 4)}`;
    const offset = encode(text.slice(0, text.indexOf('[['))).length + MAX_DEPTH - 4;
    expect(out).toEqual({
      ok: false,
      findings: [{ ruleId: 'JDX-JSN-001', instanceLocation: deeper, params: { reason: 'depth', offset } }],
    });
  });

  it('a document over MAX_DOCUMENT_BYTES gives one JSN-001 size and is not parsed', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(2_097_152);
    // Leído, daría una falla de sintaxis en el primer byte: el tope corta antes.
    const over = new Uint8Array(MAX_DOCUMENT_BYTES + 1).fill(0x7d);
    const size: Finding = { ruleId: 'JDX-JSN-001', instanceLocation: '', params: { reason: 'size', offset: MAX_DOCUMENT_BYTES } };
    expect(jsonStage(over)).toEqual({ ok: false, findings: [size] });
    // La razón es del catálogo, con su término en los tres idiomas.
    expect(validators.validateWith(catalogRule(catalog, 'JDX-JSN-001').resultParamsSchema, size.params as JsonValue)).toEqual([]);
    expect((['es', 'pt', 'en'] as const).map((lang) => toResult(size, { catalog, profile: null, lang }).message)).toEqual([
      'El archivo no se puede leer como JSON: pesa más de 2 MiB.',
      'O arquivo não pode ser lido como JSON: tem mais de 2 MiB.',
      'The file cannot be read as JSON: it is larger than 2 MiB.',
    ]);
    expect(jsonStage(over.subarray(0, MAX_DOCUMENT_BYTES))).toEqual({
      ok: false,
      findings: [{ ruleId: 'JDX-JSN-001', instanceLocation: '', params: { reason: 'syntax', offset: 0 } }],
    });
    // Exactamente en el tope, el documento se lee.
    const padded = EXAMPLE.trimEnd() + ' '.repeat(MAX_DOCUMENT_BYTES - encode(EXAMPLE.trimEnd()).length);
    expect(encode(padded)).toHaveLength(MAX_DOCUMENT_BYTES);
    expect(jsonStage(encode(padded)).ok).toBe(true);
  });

  it('a key of slashes as long as the cap, with repeated keys inside, gives one JSN-001 and a report that can be written', () => {
    // Cada "/" se escribe "~1" en el puntero: el de la falla tiene el doble de caracteres que la clave.
    const inner = Array(150).fill('"a":1').join(',');
    const text = `{"${'/'.repeat(MAX_DOCUMENT_BYTES - inner.length - 7)}":{${inner}}}`;
    expect(encode(text)).toHaveLength(MAX_DOCUMENT_BYTES);
    const run = hostile(text);
    expect(run.reasons).toEqual(['JDX-JSN-001 duplicateKey']);
    expect(run.results).toBe(1);
    expect(run.reportChars).toBeGreaterThan(2 * (MAX_DOCUMENT_BYTES - inner.length));
    expect(run.reportChars).toBeLessThan(6_000_000);
    expect(run.ms).toBeLessThan(5_000);
  });

  it('the parser stopping at its cap marks the outcome as capped', () => {
    // La falla 100 o la que lleva los punteros a 1 000 000 de caracteres: puede haber más.
    const keys = (n: number) => encode(`{${Array.from({ length: n }, () => '"a":1').join(',')}}`);
    expect(jsonStage(keys(150))).toMatchObject({ ok: false, capped: true });
    expect(jsonStage(keys(101))).toMatchObject({ ok: false, capped: true });
    const few = jsonStage(keys(100));
    expect(few.ok === false && [few.findings.length, few.capped]).toEqual([99, undefined]);
    expect(jsonStage(encode(`{"${'/'.repeat(600_000)}":{"a":1,"a":2}}`))).toMatchObject({ ok: false, capped: true });
    expect(jsonStage(new Uint8Array(MAX_DOCUMENT_BYTES + 1))).toEqual({ ok: false, findings: [{ ruleId: 'JDX-JSN-001', instanceLocation: '', params: { reason: 'size', offset: MAX_DOCUMENT_BYTES } }] });
  });

  it('keys of 17 000 characters that differ only at the end, up to the cap, parse within seconds', () => {
    // V8 compara las claves largas del mismo largo de punta a punta: el costo crece con el cuadrado de su cantidad.
    const count = Math.floor((MAX_DOCUMENT_BYTES - 2) / 17_005);
    const text = `{${Array.from({ length: count }, (_, i) => `"${'k'.repeat(16_992)}${String(i).padStart(8, '0')}":0`).join(',')}}`;
    expect(encode(text).length).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
    const run = hostile(text);
    // Un objeto que no es un documento: el schema lo dice, a lo sumo 100 veces y sin pasar del tope de caracteres.
    expect(run.reasons).toContain('JDX-SCH-001 unevaluatedProperties');
    expect(run.results).toBeLessThanOrEqual(MAX_SCHEMA_ERRORS);
    expect(run.reportChars).toBeLessThan(4 * MAX_SCHEMA_ERROR_CHARS);
    expect(run.ms).toBeLessThan(5_000);
  });
});

describe('schemaStage', () => {
  it('the example passes with the strict 1.0 schema', () => {
    const outcome = stage(EXAMPLE);
    expect(outcome.kind).toBe('passed');
    if (outcome.kind !== 'passed') return;
    expect(outcome.minor).toBe('1.0');
    expect(outcome.schemaIndex).toBe(bundle.index['1.0']);
    expect(outcome.findings).toEqual([]);
    expect(outcome.doc).toEqual(JSON.parse(EXAMPLE));
  });

  it('jdx 2.0 → only VER-001, exit 1', () => {
    const doc = example((d) => {
      d.jdx = '2.0';
      d.$schema = 'https://jdx.jupiter.ar/schema/2.0/jdx.schema.json';
      d.percnet = 1;
    });
    const outcome = stage(doc);
    expect(outcome).toEqual({ kind: 'failed', findings: [{ ruleId: 'JDX-VER-001', instanceLocation: '/jdx', params: { jdx: '2.0' } }] });
    expect(reportOf(encode(JSON.stringify(doc)), outcome.findings)).toMatchObject({ exitCode: 1, valid: false, disposition: 'reject' });
  });

  it('strict URL in $schema → VER-002 without SCH-001 on /$schema', () => {
    expect(stage(example((d) => {
      d.$schema = STRICT_URL;
    }))).toEqual({
      kind: 'failed',
      findings: [{ ruleId: 'JDX-VER-002', instanceLocation: '/$schema', params: { jdx: '1.0', schemaUrl: STRICT_URL } }],
    });
  });

  it('$schema minor 1.1 with jdx 1.0 → VER-002', () => {
    const url = 'https://jdx.jupiter.ar/schema/1.1/jdx.schema.json';
    expect(stage(example((d) => {
      d.$schema = url;
    }))).toEqual({
      kind: 'failed',
      findings: [{ ruleId: 'JDX-VER-002', instanceLocation: '/$schema', params: { jdx: '1.0', schemaUrl: url } }],
    });
  });

  it('foreign $schema → SCH-001', () => {
    expect(stage(example((d) => {
      d.$schema = 'https://example.com/jdx.schema.json';
    }))).toEqual({
      kind: 'failed',
      findings: [{
        ruleId: 'JDX-SCH-001', instanceLocation: '/$schema', keywordLocation: '/$defs/Document/properties/$schema/const',
        params: { keyword: 'const', allowedValue: OPEN_URL },
      }],
    });
  });

  it('jdx 1.1 → VER-003 and open 1.0 schema', () => {
    const newer = (more: (d: Doc) => void = () => {}) => example((d) => {
      d.jdx = '1.1';
      d.$schema = 'https://jdx.jupiter.ar/schema/1.1/jdx.schema.json';
      (d.works as Doc[])[0]!.lyricist2 = 'campo de la 1.1';
      more(d);
    });
    const ver003: Finding = { ruleId: 'JDX-VER-003', instanceLocation: '/jdx', params: { jdx: '1.1', validatedWith: '1.0' } };
    const outcome = stage(newer());
    expect(outcome).toMatchObject({ kind: 'passed', minor: '1.0', findings: [ver003] });
    if (outcome.kind === 'passed') expect(outcome.schemaIndex).toBe(bundle.index['1.0']);
    // El abierto sigue controlando lo que conoce.
    expect(stage(newer((d) => {
      (((d.works as Doc[])[0]!.shares as Doc[])[0]!).percent = 'doce';
    }))).toEqual({
      kind: 'failed',
      findings: [ver003, {
        ruleId: 'JDX-SCH-001', instanceLocation: '/works/0/shares/0/percent', keywordLocation: '/$defs/Share/properties/percent/type',
        params: { keyword: 'type', type: 'number' },
      }],
    });
  });

  it('profile with jdx 1.0 and a 1.1 document → environment ENV-006 jdxNotAdmitted', () => {
    const doc = example((d) => {
      d.jdx = '1.1';
      d.$schema = 'https://jdx.jupiter.ar/schema/1.1/jdx.schema.json';
    });
    expect(stage(doc, { ...sadaicProfile(), jdx: '1.0' })).toEqual({
      kind: 'environment',
      findings: [{ ruleId: 'JDX-ENV-006', instanceLocation: '', params: { reason: 'jdxNotAdmitted', jdx: '1.1' } }],
    });
    // Con 1.x la admite; con una mayor que el validador no lee, VER-001 va antes.
    expect(stage(doc).kind).toBe('passed');
    expect(stage(example((d) => {
      d.jdx = '2.0';
    }), { ...sadaicProfile(), jdx: '1.0' }).findings.map((f) => f.ruleId)).toEqual(['JDX-VER-001']);
  });

  it('percnet → SCH-001 at /works/0/shares/0/percnet with keywordLocation and params.keyword', () => {
    const outcome = stage(example((d) => {
      const share = ((d.works as Doc[])[0]!.shares as Doc[])[0]!;
      share.percnet = share.percent!;
      delete share.percent;
    }));
    expect(outcome).toEqual({
      kind: 'failed',
      findings: [
        {
          ruleId: 'JDX-SCH-001', instanceLocation: '/works/0/shares/0', keywordLocation: '/$defs/Share/required',
          params: { keyword: 'required', missingProperty: 'percent' },
        },
        {
          ruleId: 'JDX-SCH-001', instanceLocation: '/works/0/shares/0/percnet', keywordLocation: '/$defs/Share/unevaluatedProperties',
          params: { keyword: 'unevaluatedProperties', unevaluatedProperty: 'percnet' },
        },
      ],
    });
  });

  it('missing required → SCH-001 at the parent with params.missingProperty', () => {
    expect(stage(example((d) => {
      delete (d.declaration as Doc).createdAt;
    }))).toEqual({
      kind: 'failed',
      findings: [{
        ruleId: 'JDX-SCH-001', instanceLocation: '/declaration', keywordLocation: '/$defs/Declaration/required',
        params: { keyword: 'required', missingProperty: 'createdAt' },
      }],
    });
  });

  it('one SCH-001 per error after toSchemaErrors', () => {
    const doc = example((d) => {
      (d.declaration as Doc).revision = 0;
      ((d.parties as Doc[])[0]!).kind = 'robot';
      ((d.works as Doc[])[1]!).titles = [];
      (d.media as Doc[]).push({ id: 'm9' });
    });
    const errors = validators.validateDocument('1.0', true, doc);
    expect(errors.length).toBeGreaterThan(3);
    expect(stage(doc)).toEqual({
      kind: 'failed',
      findings: errors.map((e) => ({
        ruleId: 'JDX-SCH-001', instanceLocation: e.instanceLocation, keywordLocation: e.keywordLocation, params: { keyword: e.keyword, ...e.params },
      })),
    });
  });

  it('an unreadable jdx is validated with the strict schema of the newest minor', () => {
    expect(stage(example((d) => {
      d.jdx = '1.01';
    }))).toEqual({
      kind: 'failed',
      findings: [{
        ruleId: 'JDX-SCH-001', instanceLocation: '/jdx', keywordLocation: '/$defs/Document/properties/jdx/const', params: { keyword: 'const', allowedValue: '1.0' },
      }],
    });
    expect(stage('[]').findings.map((f) => `${f.ruleId} ${f.instanceLocation} ${String(f.params?.keyword)}`)).toEqual(['JDX-SCH-001  type']);
  });

  it('schema errors stop later stages', () => {
    const outcome = stage(example((d) => {
      delete d.declaration;
    }));
    expect(outcome.kind).toBe('failed');
    // Sin documento, sin menor y sin índice: lo que sigue no tiene con qué correr.
    expect(Object.keys(outcome)).toEqual(['kind', 'findings']);
  });

  it('a schema flood up to the cap gives at most 100 SCH-001, quickly', () => {
    const head = JSON.stringify(example((d) => {
      d.parties = [];
    }));
    // n ceros con sus comas agregan 2n - 1 bytes.
    const count = Math.floor((MAX_DOCUMENT_BYTES - encode(head).length + 1) / 2);
    const text = head.replace('"parties":[]', `"parties":[${Array(count).fill('0').join(',')}]`);
    expect(encode(text).length).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
    const run = hostile(text);
    expect(run.results).toBe(MAX_SCHEMA_ERRORS);
    expect(run.reasons).toEqual(['JDX-SCH-001 type']);
    expect(run.ms).toBeLessThan(5_000);
  });

  it('a schema validation that stops at its cap marks the outcome as capped', () => {
    const flood = stage(example((d) => {
      d.parties = Array<number>(5000).fill(0);
    }));
    expect(flood).toMatchObject({ kind: 'failed', capped: true });
    expect(flood.findings).toHaveLength(MAX_SCHEMA_ERRORS);
    // Con menos errores que el tope, la lista está entera.
    const few = stage(example((d) => {
      d.parties = Array<number>(30).fill(0);
    }));
    expect([few.kind, few.findings.length, 'capped' in few]).toEqual(['failed', 60, false]);
  });

  it('long instance locations stop the SCH-001 list at its character budget', () => {
    // Nulls debajo de una clave larga de una extensión, y una obra compuesta que no dice qué compone (oneOf).
    const key = 'k'.repeat(400_000);
    const head = JSON.stringify(example((d) => {
      ((d.works as Doc[])[0]!).composite = { components: [{}] };
      d.extensions = { 'ar.example.x': { KEY: [] } };
    })).replace('"KEY"', `"${key}"`);
    const text = head.replace(':[]}}', `:[${Array(250_000).fill('null').join(',')}]}}`);
    expect(encode(text).length).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
    const run = hostile(text);
    expect(run.results).toBeLessThan(MAX_SCHEMA_ERRORS);
    expect(run.reportChars).toBeLessThan(MAX_SCHEMA_ERROR_CHARS + 2 * key.length);
    expect(run.ms).toBeLessThan(5_000);
  });
});
