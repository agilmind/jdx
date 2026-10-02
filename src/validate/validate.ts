/**
 * Una validación entera con las dependencias dadas (validateWithDeps): las de
 * defaultDeps, o las de la suite de conformidad, con su reloj y sus raíces.
 *
 * 1. El entorno (evaluateEnvironment). Si falla: código de salida 2, un
 *    JDX-ENV-* por falla y, del documento, lo que se pueda leer del archivo.
 * 2. El JSON (jsonStage). Si falla: sus JDX-JSN-001, y lo demás notEvaluated.
 *    Un archivo de más de MAX_DOCUMENT_BYTES puede llegar sin sus bytes, con su
 *    tamaño y su sha256: da el mismo JDX-JSN-001 `size`, después del entorno.
 * 3. La versión y el schema (schemaStage), con el perfil resuelto. Un perfil
 *    que no admite la versión es del entorno (código de salida 2); con
 *    errores, lo demás notEvaluated.
 * 4. El índice del documento (JDX-REF-001 y -002) y las reglas de deps.rules,
 *    en su orden: las del núcleo y de la política siempre, con params `{}`; las
 *    del perfil si el perfil aplicado las trae, con sus params (el nivel lo da
 *    el perfil). Una regla que pide estado, carpeta de la entrega o cuenta no
 *    corre sin ellos; el bucket media corre solo con carpeta. La firma: sin
 *    .jws, ausente; con .jws, todavía no se evalúa (notEvaluated).
 *
 * Una carpeta de la entrega que no se puede usar es del entorno también si una
 * regla lo encuentra mientras la lee (un MediaFolderError): el reporte es el de
 * una falla del entorno, con su JDX-ENV-011, y lo demás queda notEvaluated. Al
 * terminar, bien o mal, se cierra lo que la carpeta dejó abierto (close).
 *
 * El reporte sale de buildReport, con el tope de cada código (capFindings): de
 * cada uno, a lo sumo 100 resultados, y los demás se cuentan sin armarlos (una
 * regla puede dar solo sus primeros y cuántos más encontró). Una
 * regla registrada que no está en el catálogo, retirada, sin implementar, de
 * otra capa o con un código que da un paso de la validación es un error de
 * programación y lanza, como una excepción de una regla o del estado.
 */
import { parseInstant } from '../conventions/time.js';
import { MediaFolderError } from '../media/errors.js';
import { buildReport } from '../report/build.js';
import { documentFacts } from '../report/document.js';
import { capFindings, catalogRule, toResult } from '../report/results.js';
import { territoryExpander } from '../territory/expand.js';
import type {
  CheckName, Finding, Instant, JsonValue, Report, ReportDocument, ReportParts, ReportSignature, ResolvedProfile, RuleContext, RuleId,
  SignatureOutcome, TerritoryExpander, ValidateInput, ValidateOptions, ValidatorDeps, ValueLists,
} from '../types.js';
import { buildDocIndex } from './docIndex.js';
import { evaluateEnvironment, folderFinding } from './environment.js';
import { jsonStageOf } from './jsonStage.js';
import { schemaStage } from './schemaStage.js';

/**
 * Códigos que da un paso de la validación y no el registro: el JSON, la versión,
 * el índice del documento, la firma y la falla interna. Una regla registrada
 * con uno de ellos los repetiría.
 */
const STEP_CODES: ReadonlySet<RuleId> = new Set<RuleId>([
  'JDX-INT-001', 'JDX-JSN-001', 'JDX-REF-001', 'JDX-REF-002', 'JDX-SIG-002', 'JDX-SIG-003', 'JDX-SIG-004', 'JDX-VER-001', 'JDX-VER-002', 'JDX-VER-003',
]);

const NOT_EVALUATED: ReportSignature = Object.freeze({ status: 'notEvaluated', kid: null, issuer: null, env: null, reason: null });
const ABSENT: ReportSignature = Object.freeze({ status: 'absent', kid: null, issuer: null, env: null, reason: null });

export async function validateWithDeps(input: ValidateInput, opts: ValidateOptions, deps: ValidatorDeps): Promise<Report> {
  try {
    const prepared = await prepareRules(input, opts, deps);
    if (!prepared.ok) return prepared.report;
    let found: RulesOutcome;
    try {
      found = await runRules(prepared.ctx, deps);
    } catch (error) {
      if (error instanceof MediaFolderError) return prepared.environment([folderFinding(error)]);
      throw error;
    }
    return prepared.finish([...prepared.findings, ...found.findings], found.more);
  } finally {
    // Lo que la carpeta de la entrega dejó abierto se cierra antes de devolver el reporte.
    await opts.media?.close?.();
  }
}

/**
 * Hasta el paso de las reglas: o el reporte de una validación que terminó
 * antes, o el contexto que reciben las reglas, los hallazgos que ya hay, cómo
 * terminar el reporte con los de las reglas y cómo darlo como una falla del
 * entorno que apareció mientras corrían (la carpeta de la entrega).
 */
export type PreparedRules =
  | { ok: false; report: Report }
  | {
      ok: true; ctx: RuleContext; findings: readonly Finding[];
      finish: (findings: readonly Finding[], more?: readonly MoreFindings[]) => Report;
      environment: (findings: readonly Finding[]) => Report;
    };

/**
 * Los pasos 1 a 3 y el índice del documento, y el contexto de las reglas
 * armado de lo que dieron: el mismo para validateWithDeps y para los tests de
 * reglas, que así reciben lo que reciben en una validación.
 */
export async function prepareRules(input: ValidateInput, opts: ValidateOptions, deps: ValidatorDeps): Promise<PreparedRules> {
  const env = await evaluateEnvironment(input, opts, deps);
  const finish = (parts: Finish): Report => report(deps, env.reportOptions, parts);

  // Una falla del entorno: el documento con lo que se puede leer del archivo, y lo demás notEvaluated.
  const environment = (profile: ResolvedProfile | null, findings: readonly Finding[]): Report => {
    const json = jsonStageOf(input);
    return finish({
      document: documentFacts(input, json.ok ? json.json : null, false), appliedProfiles: profile === null ? [] : [profile.applied],
      outcome: 'environment', evaluated: ['environment'], hasState: false, signature: NOT_EVALUATED, trustList: null,
      findings, profile,
    });
  };
  if (!env.ok) return { ok: false, report: environment(env.profile, env.findings) };
  const base = {
    appliedProfiles: [env.profile.applied], hasState: env.state !== null, profile: env.profile,
    trustList: env.trust === null ? null : { seq: env.trust.list.seq, expiresAt: env.trust.list.expiresAt },
  };

  const json = jsonStageOf(input);
  if (!json.ok) {
    return {
      ok: false,
      report: finish({
        ...base, document: documentFacts(input, null, false), outcome: 'completed', evaluated: ['environment', 'json'], signature: NOT_EVALUATED,
        findings: json.findings, stopped: json.capped === true ? ['JDX-JSN-001'] : [],
      }),
    };
  }
  const schema = schemaStage(json.json, { bundle: deps.schemas, validators: deps.validators, profile: env.profile.profile });
  if (schema.kind === 'environment') {
    return {
      ok: false,
      report: finish({
        ...base, document: documentFacts(input, json.json, false), outcome: 'environment', evaluated: ['environment', 'json'],
        hasState: false, signature: NOT_EVALUATED, trustList: null, findings: schema.findings,
      }),
    };
  }
  if (schema.kind === 'failed') {
    return {
      ok: false,
      report: finish({
        ...base, document: documentFacts(input, json.json, false), outcome: 'completed', evaluated: ['environment', 'json', 'schema'], signature: NOT_EVALUATED,
        findings: schema.findings, stopped: schema.capped === true ? ['JDX-SCH-001'] : [],
      }),
    };
  }

  const document = documentFacts(input, json.json, true);
  const docIndex = buildDocIndex(schema.doc, schema.schemaIndex);
  const signature: SignatureOutcome = { report: input.jws === undefined ? ABSENT : NOT_EVALUATED, findings: [], key: null };
  const ctx: RuleContext = {
    doc: schema.doc,
    json: json.json,
    index: docIndex.index,
    schemaIndex: schema.schemaIndex,
    input: { fileName: input.fileName, sha256: document.sha256, size: document.size },
    options: env.options,
    now: instantOf(deps.clock()),
    profile: env.profile,
    values: deps.values,
    territories: territoriesOf(deps.values),
    state: env.state,
    media: opts.media ?? null,
    account: opts.account ?? null,
    signature,
    trust: env.trust,
  };
  const evaluated: CheckName[] = ['environment', 'json', 'schema', 'core', 'profile', 'policy'];
  if (signature.report.status !== 'notEvaluated') evaluated.push('signature');
  if (ctx.media !== null) evaluated.push('media');
  return {
    ok: true,
    ctx,
    findings: [...schema.findings, ...docIndex.findings, ...signature.findings],
    finish: (findings, more = []) => finish({ ...base, document, outcome: 'completed', evaluated, signature: signature.report, findings, more }),
    environment: (findings) => environment(env.profile, findings),
  };
}

/** Cuántos hallazgos más encontró una regla que dio solo los primeros. */
type MoreFindings = { ruleId: RuleId; count: number };
type RulesOutcome = { findings: Finding[]; more: MoreFindings[] };

/** Las reglas del registro que aplican, en su orden, con sus params. */
async function runRules(ctx: RuleContext, deps: ValidatorDeps): Promise<RulesOutcome> {
  const applied = new Map(ctx.profile.rules.map((r) => [r.ruleId, r] as const));
  const available = { state: ctx.state !== null, media: ctx.media !== null, account: ctx.account !== null };
  const out: Finding[] = [];
  const more: MoreFindings[] = [];
  for (const [id, rule] of deps.rules) {
    const entry = catalogRule(deps.catalog, id);
    if (entry.status !== 'active') throw new Error(`${id}: está registrada y el catálogo la da como retirada`);
    if (!entry.implemented) throw new Error(`${id}: está registrada y el catálogo la da como no implementada`);
    let params: { [k: string]: JsonValue } = {};
    if (entry.layer === 'profile') {
      const inProfile = applied.get(id);
      if (inProfile === undefined) continue;
      params = inProfile.params;
    } else if (entry.layer !== 'core' && entry.layer !== 'policy') {
      throw new Error(`${id}: una regla de la capa ${entry.layer} no va en el registro`);
    } else if (STEP_CODES.has(id)) {
      throw new Error(`${id}: la da un paso de la validación y no va en el registro`);
    }
    if (rule.requires?.some((need) => !available[need]) === true) continue;
    // Uno por uno: una regla puede dar cientos de miles, y push(...lista) desborda la pila.
    const got = await rule.evaluate(ctx, params);
    for (const f of Array.isArray(got) ? got : got.findings) out.push(f);
    if (!Array.isArray(got) && got.omitted > 0) more.push({ ruleId: id, count: got.omitted });
  }
  return { findings: out, more };
}

interface Finish {
  document: ReportDocument;
  appliedProfiles: string[];
  outcome: ReportParts['outcome'];
  evaluated: readonly CheckName[];
  hasState: boolean;
  signature: ReportSignature;
  trustList: ReportParts['trustList'];
  findings: readonly Finding[];
  more?: readonly MoreFindings[];
  stopped?: readonly RuleId[];
  profile: ResolvedProfile | null;
}

function report(deps: ValidatorDeps, options: Report['options'], parts: Finish): Report {
  const c = { catalog: deps.catalog, profile: parts.profile, lang: options.lang };
  const capped = capFindings(parts.findings, c, parts.more);
  return buildReport({
    validator: { name: 'jdx', version: deps.validatorVersion, catalog: deps.catalog.catalog },
    options,
    document: parts.document,
    appliedProfiles: parts.appliedProfiles,
    outcome: parts.outcome,
    evaluated: new Set(parts.evaluated),
    hasState: parts.hasState,
    signature: parts.signature,
    trustList: parts.trustList,
    results: capped.listed.map((f) => toResult(f, c)),
    omitted: capped.omitted,
    stopped: parts.stopped ?? [],
    catalog: deps.catalog,
  });
}

/** El reloj del validador como instante. */
function instantOf(date: Date): Instant {
  const instant = parseInstant(date.toISOString());
  if (instant === null) throw new Error(`el reloj del validador dio una fecha inválida: ${String(date)}`);
  return instant;
}

const territories = new WeakMap<ValueLists, TerritoryExpander>();

/** La expansión de territorios de las listas de valores, una por lista. */
function territoriesOf(values: ValueLists): TerritoryExpander {
  let expander = territories.get(values);
  if (expander === undefined) {
    expander = territoryExpander(values.tis);
    territories.set(values, expander);
  }
  return expander;
}
