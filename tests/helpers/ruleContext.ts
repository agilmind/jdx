/**
 * Lo que necesitan los tests de reglas, sobre el ejemplo y los datos
 * empaquetados.
 *
 * - makeRuleContext(overrides) da el RuleContext que recibirían las reglas en
 *   validateExample con lo mismo: lo arma prepareRules, el mismo paso de
 *   validateWithDeps, así las opciones efectivas (la firma pedida por el
 *   entorno y el piso del perfil), el reloj y el índice son los de una
 *   validación. Lanza si la validación termina antes de las reglas (el
 *   entorno, el JSON o el schema fallan), con sus resultados. Solo la firma se
 *   puede pasar hecha, hasta que la validación la evalúe.
 * - findingProblems(findings) dice qué tiene cada hallazgo fuera de su regla
 *   en el catálogo: el código, el lugar (un JSON Pointer), keywordLocation
 *   (solo JDX-SCH-001) y sus params y su context contra los schemas de la regla.
 * - testDeps() son las dependencias de las validaciones de los tests: las de
 *   defaultDeps, con las raíces de prueba y el reloj TEST_NOW.
 * - validateExample(run) corre validateWithDeps sobre el ejemplo (o el
 *   documento que se pase) en sandbox, con sadaic/0.1 y RECEIVED_AT, con las
 *   opciones y las dependencias que se pasen encima.
 */
import { segmentsOf } from '../../src/json/pointer.js';
import { catalogRule } from '../../src/report/results.js';
import { defaultDeps } from '../../src/validate/deps.js';
import { prepareRules, validateWithDeps } from '../../src/validate/validate.js';
import type { Finding, JsonValue, Report, RuleContext, RuleFindings, SignatureOutcome, State, StateStore, ValidateOptions, ValidatorDeps, ValueLists } from '../../src/types.js';
import { type DocBuilder, docBuilder, EXAMPLE_NAME } from './docBuilder.js';
import { TEST_NOW, TEST_ROOTS } from './trustFixtures.js';

/** La hora de recepción de las validaciones de los tests. */
export const RECEIVED_AT = '2026-09-30T09:12:00-03:00';

/** El documento de una prueba: un builder, su texto o sus bytes. */
export type TestDocument = DocBuilder | string | Uint8Array;

export interface ExampleRun {
  document?: TestDocument;
  fileName?: string;
  jws?: string;
  options?: Partial<ValidateOptions>;
  deps?: Partial<ValidatorDeps>;
}

/** Lo que se puede cambiar de una validación de prueba para armar el contexto de las reglas. */
export interface RuleContextOverrides extends ExampleRun {
  state?: State | null;                                    // un estado en memoria, que se lee como en una validación
  now?: string;                                            // el reloj del validador (por defecto, TEST_NOW)
  values?: ValueLists;                                     // las listas de valores (por defecto, las empaquetadas)
  signature?: SignatureOutcome;                            // la firma, hasta que la validación la evalúe
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

export async function makeRuleContext(overrides: RuleContextOverrides = {}): Promise<RuleContext> {
  const { state, now, values, signature, ...run } = overrides;
  const deps = {
    ...run.deps,
    ...(now === undefined ? {} : { clock: () => new Date(now) }),
    ...(values === undefined ? {} : { values }),
  };
  const options = { ...(state === undefined || state === null ? {} : { state: memoryState(state) }), ...run.options };
  const prepared = await prepareRules(inputOf(run), optionsOf(options), testDeps(deps));
  if (!prepared.ok) {
    const results = prepared.report.results.map((r) => ({ ruleId: r.ruleId, instanceLocation: r.instanceLocation, params: r.params }));
    throw new Error(`makeRuleContext: la validación termina antes de las reglas: ${JSON.stringify(results)}`);
  }
  return signature === undefined ? prepared.ctx : { ...prepared.ctx, signature };
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

export function validateExample(run: ExampleRun = {}): Promise<Report> {
  return validateWithDeps(inputOf(run), optionsOf(run.options), testDeps(run.deps));
}

function inputOf(run: ExampleRun): { bytes: Uint8Array; fileName: string; jws?: string } {
  return { bytes: bytesOf(run.document ?? docBuilder()), fileName: run.fileName ?? EXAMPLE_NAME, ...(run.jws === undefined ? {} : { jws: run.jws }) };
}

function optionsOf(options: Partial<ValidateOptions> = {}): ValidateOptions {
  return { profile: 'sadaic/0.1', env: 'sandbox', receivedAt: RECEIVED_AT, ...options };
}

/** Un estado fijo, en memoria: se lee; escribirlo es un error de la prueba. */
function memoryState(state: State): StateStore {
  return {
    read: async (fn) => fn(state),
    update: async () => {
      throw new Error('el contexto de las reglas no escribe el estado');
    },
  };
}

function bytesOf(document: TestDocument): Uint8Array {
  if (document instanceof Uint8Array) return document;
  return new TextEncoder().encode(typeof document === 'string' ? document : document.text);
}

/** Los hallazgos de una regla como lista: los que da, o los primeros que guardó si no contó otros. */
export function findingsOf(result: RuleFindings): Finding[] {
  if (Array.isArray(result)) return result;
  if (result.omitted !== 0) throw new Error(`la regla guardó ${result.findings.length} hallazgos y contó ${result.omitted} más`);
  return result.findings;
}
