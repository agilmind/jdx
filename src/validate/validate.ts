/**
 * Una validación entera con las dependencias dadas (validateWithDeps): las de
 * defaultDeps, o las de la suite de conformidad, con su reloj y sus raíces.
 *
 * 1. El entorno (evaluateEnvironment). Si falla: salida 2, un JDX-ENV-* por
 *    falla y, del documento, lo que se pueda leer del archivo.
 * 2. El JSON (jsonStage). Si falla: sus JDX-JSN-001, y lo demás notEvaluated.
 * 3. La versión y el schema (schemaStage), con el perfil resuelto. Un perfil
 *    que no admite la versión es del entorno (salida 2); con errores, lo demás
 *    notEvaluated.
 * 4. El índice del documento (JDX-REF-001 y -002) y las reglas de deps.rules,
 *    en su orden: las del núcleo y de la política siempre, con params `{}`; las
 *    del perfil si el perfil aplicado las trae, con sus params (el nivel lo da
 *    el perfil). Una regla que pide estado, carpeta de la entrega o cuenta no
 *    corre sin ellos; el bucket media corre solo con carpeta. La firma: sin
 *    .jws, ausente; con .jws, todavía no se evalúa (notEvaluated).
 *
 * El reporte sale de buildReport. Una regla registrada que no está en el
 * catálogo, retirada, sin implementar o de otra capa es un error de
 * programación y lanza, como una excepción de una regla o del estado.
 */
import { parseInstant } from '../conventions/time.js';
import { buildReport } from '../report/build.js';
import { documentFacts } from '../report/document.js';
import { catalogRule, toResult } from '../report/results.js';
import { territoryExpander } from '../territory/expand.js';
import type {
  CheckName, Finding, Instant, JsonValue, Report, ReportDocument, ReportParts, ReportSignature, ResolvedProfile, RuleContext,
  SignatureOutcome, TerritoryExpander, ValidateInput, ValidateOptions, ValidatorDeps, ValueLists,
} from '../types.js';
import { buildDocIndex } from './docIndex.js';
import { evaluateEnvironment } from './environment.js';
import { jsonStage } from './jsonStage.js';
import { schemaStage } from './schemaStage.js';

const NOT_EVALUATED: ReportSignature = Object.freeze({ status: 'notEvaluated', kid: null, issuer: null, env: null, reason: null });
const ABSENT: ReportSignature = Object.freeze({ status: 'absent', kid: null, issuer: null, env: null, reason: null });

export async function validateWithDeps(input: ValidateInput, opts: ValidateOptions, deps: ValidatorDeps): Promise<Report> {
  const env = await evaluateEnvironment(input, opts, deps);
  const finish = (parts: Finish): Report => report(deps, env.reportOptions, parts);

  if (!env.ok) {
    const json = jsonStage(input.bytes);
    return finish({
      document: documentFacts(input, json.ok ? json.json : null, false), appliedProfiles: env.profile === null ? [] : [env.profile.applied],
      outcome: 'environment', evaluated: ['environment'], hasState: false, signature: NOT_EVALUATED, trustList: null,
      findings: env.findings, profile: env.profile,
    });
  }
  const base = {
    appliedProfiles: [env.profile.applied], hasState: env.state !== null, profile: env.profile,
    trustList: env.trust === null ? null : { seq: env.trust.list.seq, expiresAt: env.trust.list.expiresAt },
  };

  const json = jsonStage(input.bytes);
  if (!json.ok) {
    return finish({ ...base, document: documentFacts(input, null, false), outcome: 'completed', evaluated: ['environment', 'json'], signature: NOT_EVALUATED, findings: json.findings });
  }
  const schema = schemaStage(json.json, { bundle: deps.schemas, validators: deps.validators, profile: env.profile.profile });
  if (schema.kind === 'environment') {
    return finish({
      ...base, document: documentFacts(input, json.json, false), outcome: 'environment', evaluated: ['environment', 'json'],
      hasState: false, signature: NOT_EVALUATED, trustList: null, findings: schema.findings,
    });
  }
  if (schema.kind === 'failed') {
    return finish({ ...base, document: documentFacts(input, json.json, false), outcome: 'completed', evaluated: ['environment', 'json', 'schema'], signature: NOT_EVALUATED, findings: schema.findings });
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
  const findings = [...schema.findings, ...docIndex.findings, ...signature.findings, ...(await runRules(ctx, deps))];
  const evaluated: CheckName[] = ['environment', 'json', 'schema', 'core', 'profile', 'policy'];
  if (signature.report.status !== 'notEvaluated') evaluated.push('signature');
  if (ctx.media !== null) evaluated.push('media');
  return finish({ ...base, document, outcome: 'completed', evaluated, signature: signature.report, findings });
}

/** Las reglas del registro que aplican, en su orden, con sus params. */
async function runRules(ctx: RuleContext, deps: ValidatorDeps): Promise<Finding[]> {
  const applied = new Map(ctx.profile.rules.map((r) => [r.ruleId, r] as const));
  const available = { state: ctx.state !== null, media: ctx.media !== null, account: ctx.account !== null };
  const out: Finding[] = [];
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
    }
    if (rule.requires?.some((need) => !available[need]) === true) continue;
    out.push(...(await rule.evaluate(ctx, params)));
  }
  return out;
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
  profile: ResolvedProfile | null;
}

function report(deps: ValidatorDeps, options: Report['options'], parts: Finish): Report {
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
    results: parts.findings.map((f) => toResult(f, { catalog: deps.catalog, profile: parts.profile, lang: options.lang })),
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
