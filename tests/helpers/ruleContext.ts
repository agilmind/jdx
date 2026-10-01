/**
 * Lo que necesitan los tests de reglas, sobre el ejemplo y los datos
 * empaquetados.
 *
 * - makeRuleContext(overrides) arma el RuleContext de una validación en
 *   sandbox con sadaic/0.1: el documento (el ejemplo, o el que se pase) leído y
 *   validado con los mismos pasos que validateWithDeps (lanza si no se lee o
 *   no cumple el schema, con sus hallazgos), su índice, las listas de valores
 *   empaquetadas, el reloj TEST_NOW y la recepción RECEIVED_AT, sin estado,
 *   carpeta, cuenta, firma ni lista de confianza. Cada parte se puede cambiar.
 * - findingProblems(findings) dice qué tiene cada hallazgo fuera de su regla
 *   en el catálogo: el código, el lugar (un JSON Pointer), keywordLocation
 *   (solo JDX-SCH-001) y sus params y su context contra los schemas de la regla.
 * - testDeps() son las dependencias de las validaciones de los tests: las de
 *   defaultDeps, con las raíces de prueba y el reloj TEST_NOW.
 * - validateExample(run) corre validateWithDeps sobre el ejemplo (o el
 *   documento que se pase) en sandbox, con sadaic/0.1 y RECEIVED_AT, con las
 *   opciones y las dependencias que se pasen encima.
 */
import { createHash } from 'node:crypto';
import { parseInstant } from '../../src/conventions/time.js';
import { segmentsOf } from '../../src/json/pointer.js';
import { resolveProfile } from '../../src/profile/resolve.js';
import { catalogRule } from '../../src/report/results.js';
import { territoryExpander } from '../../src/territory/expand.js';
import { defaultDeps } from '../../src/validate/deps.js';
import { buildDocIndex } from '../../src/validate/docIndex.js';
import { jsonStage } from '../../src/validate/jsonStage.js';
import { schemaStage } from '../../src/validate/schemaStage.js';
import { validateWithDeps } from '../../src/validate/validate.js';
import type {
  Account, EffectiveOptions, Finding, Instant, JsonValue, MediaResolver, Profile, Report, ResolvedProfile, RuleContext, SignatureOutcome,
  State, TerritoryExpander, ValidateOptions, ValidatorDeps, ValueLists, VerifiedTrustList,
} from '../../src/types.js';
import { type DocBuilder, docBuilder, EXAMPLE_NAME } from './docBuilder.js';
import { TEST_NOW, TEST_ROOTS } from './trustFixtures.js';

/** La hora de recepción de las validaciones de los tests. */
export const RECEIVED_AT = '2026-09-30T09:12:00-03:00';

/** El documento de una prueba: un builder, su texto o sus bytes. */
export type TestDocument = DocBuilder | string | Uint8Array;

export interface RuleContextOverrides {
  document?: TestDocument;
  input?: Partial<RuleContext['input']>;
  options?: Partial<EffectiveOptions>;
  profile?: string | Profile | ResolvedProfile;
  now?: string;
  values?: ValueLists;
  territories?: TerritoryExpander;
  state?: State | null;
  media?: MediaResolver | null;
  account?: Account | null;
  signature?: SignatureOutcome;
  trust?: VerifiedTrustList | null;
}

/** La firma de un documento sin .jws. */
export const ABSENT_SIGNATURE: SignatureOutcome = Object.freeze({
  report: Object.freeze({ status: 'absent', kid: null, issuer: null, env: null, reason: null }),
  findings: [],
  key: null,
}) as SignatureOutcome;

export function testDeps(more: Partial<ValidatorDeps> = {}): ValidatorDeps {
  return { ...defaultDeps(), clock: () => TEST_NOW, roots: TEST_ROOTS, ...more };
}

export function makeRuleContext(overrides: RuleContextOverrides = {}): RuleContext {
  const deps = testDeps();
  const bytes = bytesOf(overrides.document ?? docBuilder());
  const profile = resolved(overrides.profile ?? 'sadaic/0.1', deps);
  const json = jsonStage(bytes);
  if (!json.ok) throw new Error(`makeRuleContext: el documento no se lee: ${JSON.stringify(json.findings)}`);
  const schema = schemaStage(json.json, { bundle: deps.schemas, validators: deps.validators, profile: profile.profile });
  if (schema.kind !== 'passed') throw new Error(`makeRuleContext: el documento no pasa el schema: ${JSON.stringify(schema.findings)}`);
  const values = overrides.values ?? deps.values;
  const media = overrides.media ?? null;
  return {
    doc: schema.doc,
    json: json.json,
    index: buildDocIndex(schema.doc, schema.schemaIndex).index,
    schemaIndex: schema.schemaIndex,
    input: { fileName: EXAMPLE_NAME, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, ...overrides.input },
    options: {
      env: 'sandbox', profileShortId: profile.shortId, signature: 'optional', signatureExplicit: false, failOn: 'error',
      receivedAt: instant(RECEIVED_AT), lang: 'es', dir: media !== null, ...overrides.options,
    },
    now: instant(overrides.now ?? TEST_NOW.toISOString()),
    profile,
    values,
    territories: overrides.territories ?? territoryExpander(values.tis),
    state: overrides.state ?? null,
    media,
    account: overrides.account ?? null,
    signature: overrides.signature ?? ABSENT_SIGNATURE,
    trust: overrides.trust ?? null,
  };
}

export function findingProblems(findings: readonly Finding[]): string[] {
  const { catalog, validators } = defaultDeps();
  const problems: string[] = [];
  for (const f of findings) {
    const at = `${f.ruleId} ${f.instanceLocation}`;
    let rule;
    try {
      rule = catalogRule(catalog, f.ruleId);
    } catch {
      problems.push(`${at}: no está en el catálogo`);
      continue;
    }
    try {
      segmentsOf(f.instanceLocation);
    } catch {
      problems.push(`${at}: el lugar no es un JSON Pointer`);
    }
    if (f.keywordLocation !== undefined && f.ruleId !== 'JDX-SCH-001') problems.push(`${at}: keywordLocation es solo de JDX-SCH-001`);
    for (const [part, schema, value] of [
      ['params', 'resultParamsSchema', f.params ?? {}],
      ['context', 'contextSchema', f.context ?? {}],
    ] as const) {
      for (const e of validators.validateWith(rule[schema], value as JsonValue)) {
        problems.push(`${at}: ${part} no cumple ${schema} (${e.keyword} en "${e.instanceLocation}")`);
      }
    }
  }
  return problems;
}

export interface ExampleRun {
  document?: TestDocument;
  fileName?: string;
  jws?: string;
  options?: Partial<ValidateOptions>;
  deps?: Partial<ValidatorDeps>;
}

export function validateExample(run: ExampleRun = {}): Promise<Report> {
  return validateWithDeps(
    { bytes: bytesOf(run.document ?? docBuilder()), fileName: run.fileName ?? EXAMPLE_NAME, ...(run.jws === undefined ? {} : { jws: run.jws }) },
    { profile: 'sadaic/0.1', env: 'sandbox', receivedAt: RECEIVED_AT, ...run.options },
    testDeps(run.deps),
  );
}

function bytesOf(document: TestDocument): Uint8Array {
  if (document instanceof Uint8Array) return document;
  return new TextEncoder().encode(typeof document === 'string' ? document : document.text);
}

function resolved(ref: string | Profile | ResolvedProfile, deps: ValidatorDeps): ResolvedProfile {
  if (typeof ref === 'object' && 'shortId' in ref) return ref;
  const outcome = resolveProfile(ref, { catalog: deps.catalog, bundled: deps.profiles, validatorVersion: deps.validatorVersion, validators: deps.validators });
  if (!outcome.ok) throw new Error(`makeRuleContext: el perfil no resuelve: ${JSON.stringify(outcome.findings)}`);
  return outcome.profile;
}

function instant(text: string): Instant {
  const parsed = parseInstant(text);
  if (parsed === null) throw new Error(`makeRuleContext: ${text} no es un instante`);
  return parsed;
}
