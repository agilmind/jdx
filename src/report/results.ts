/**
 * Los resultados del reporte: cada hallazgo con su nivel, su fuente y su
 * mensaje, en un orden que no depende de cómo se juntaron.
 *
 * - El nivel es el del hallazgo, si lo trae (el de JDX-SIG-001 depende de la
 *   firma pedida); si no, el que el perfil aplicado le da a la regla; si no, el
 *   fijo del catálogo.
 * - La fuente es la capa de la regla en el catálogo; la de una regla de perfil
 *   es la del perfil aplicado, tal cual (`profile:sadaic/0.1@0.1.0`, con
 *   `+local` si lo trae).
 * - El mensaje es la plantilla de la regla en el idioma pedido, llenada con
 *   los params y el context del hallazgo.
 * - El orden: el paso de evaluación (entorno, JSON, versión y schema, y en el
 *   paso de las reglas: núcleo, firma, archivos de la entrega, perfil y
 *   política, por el bucket de cada regla), el código de la regla y el lugar
 *   del dato, con los índices de las listas comparados como números. Lo que
 *   queda igual se desempata por el lugar en el schema, los params, el context
 *   y el mensaje, así el orden es total.
 * - El tope, igual para todo código: el reporte lista de cada uno a lo sumo
 *   MAX_RESULTS_PER_RULE resultados, los primeros en ese orden, y menos si sus
 *   lugares y los textos de sus params llegan a MAX_RESULT_CHARS caracteres
 *   (capFindings). Los demás no se arman: se cuentan.
 *
 * Un hallazgo de una regla que no está en el catálogo, o de una regla de perfil
 * sin perfil aplicado, es un error de programación y lanza.
 */
import { formatMessage } from '../messages/format.js';
import type {
  Catalog, CatalogRule, CheckName, Finding, JsonPointer, JsonValue, Lang, Level, OmittedFindings, ResolvedProfile, Result, RuleId,
} from '../types.js';

export interface ResultContext { catalog: Catalog; profile: ResolvedProfile | null; lang: Lang }

/** Resultados de un mismo código que lista el reporte, como máximo. */
export const MAX_RESULTS_PER_RULE = 100;

/**
 * Caracteres de los lugares (instanceLocation) y de los textos de los params
 * de los resultados de un mismo código: con el que llega a este total, la
 * lista de ese código se corta.
 */
export const MAX_RESULT_CHARS = 1_000_000;

export interface CappedFindings { listed: Finding[]; omitted: OmittedFindings[] }

/** El paso de evaluación de cada bucket. */
const STEP: Readonly<Record<CheckName, number>> = Object.freeze({
  environment: 0, json: 1, schema: 2, core: 3, signature: 4, media: 5, profile: 6, policy: 7,
});

const byCatalog = new WeakMap<Catalog, ReadonlyMap<string, CatalogRule>>();

/** La regla del catálogo con ese código; lanza si no está. */
export function catalogRule(catalog: Catalog, ruleId: string): CatalogRule {
  let rules = byCatalog.get(catalog);
  if (rules === undefined) {
    rules = new Map(catalog.rules.map((rule) => [rule.id, rule]));
    byCatalog.set(catalog, rules);
  }
  const rule = rules.get(ruleId);
  if (rule === undefined) throw new Error(`${ruleId}: no está en el catálogo`);
  return rule;
}

export function toResult(f: Finding, c: ResultContext): Result {
  const rule = catalogRule(c.catalog, f.ruleId);
  const { source, level: byRule } = ruleDefaults(rule, c);
  const level = levelOf(f, byRule);
  return {
    ruleId: f.ruleId,
    level,
    source,
    instanceLocation: f.instanceLocation,
    ...(f.keywordLocation === undefined ? {} : { keywordLocation: f.keywordLocation }),
    ...(f.context === undefined ? {} : { context: structuredClone(f.context) }),
    message: formatMessage(rule, c.lang, f.params, f.context),
    ...(f.params === undefined ? {} : { params: structuredClone(f.params) }),
  };
}

/** Los resultados en orden: paso de evaluación, código de la regla y lugar del dato. No cambia la entrada. */
export function sortResults(results: readonly Result[], catalog: Catalog): Result[] {
  return [...results].sort(
    (a, b) =>
      compareCodes(a.ruleId, b.ruleId, catalog) ||
      comparePointers(a.instanceLocation, b.instanceLocation) ||
      comparePointers(a.keywordLocation ?? '', b.keywordLocation ?? '') ||
      compareText(JSON.stringify(a.params ?? null), JSON.stringify(b.params ?? null)) ||
      compareText(JSON.stringify(a.context ?? null), JSON.stringify(b.context ?? null)) ||
      compareText(a.message, b.message) ||
      compareText(a.level, b.level) ||
      compareText(a.source, b.source),
  );
}

/** Dos códigos en el orden del reporte: el paso de evaluación de su bucket y el código. */
export function compareCodes(a: RuleId, b: RuleId, catalog: Catalog): number {
  return STEP[catalogRule(catalog, a).check] - STEP[catalogRule(catalog, b).check] || compareText(a, b);
}

/**
 * Los hallazgos que lista el reporte. De cada código, los primeros en el orden
 * del reporte (el de sortResults): a lo sumo MAX_RESULTS_PER_RULE, y hasta el
 * que lleva sus lugares y los textos de sus params a MAX_RESULT_CHARS. Los
 * demás se cuentan por nivel y no se arman: de un código con muchos, solo se
 * ordenan los que quedan, y los otros solo se comparan con ellos.
 */
export function capFindings(findings: readonly Finding[], c: ResultContext): CappedFindings {
  const byRule = new Map<RuleId, Finding[]>();
  for (const f of findings) {
    const list = byRule.get(f.ruleId);
    if (list === undefined) byRule.set(f.ruleId, [f]);
    else list.push(f);
  }
  const listed: Finding[] = [];
  const omitted: OmittedFindings[] = [];
  for (const [ruleId, all] of byRule) {
    const byRuleLevel = ruleDefaults(catalogRule(c.catalog, ruleId), c).level;
    const kept = new Set<number>();
    let chars = 0;
    for (const entry of firstInOrder(all, byRuleLevel)) {
      listed.push(entry.f);
      kept.add(entry.at);
      chars += entry.f.instanceLocation.length + textLength(entry.f.params);
      if (chars >= MAX_RESULT_CHARS) break;
    }
    if (kept.size === all.length) continue;
    // Sin hallazgos con nivel propio, todos tienen el de la regla.
    if (byRuleLevel !== undefined && all.every((f) => f.level === undefined)) {
      omitted.push({ ruleId, level: byRuleLevel, count: all.length - kept.size });
      continue;
    }
    const counts = new Map<Level, number>();
    all.forEach((f, at) => {
      if (kept.has(at)) return;
      const level = levelOf(f, byRuleLevel);
      counts.set(level, (counts.get(level) ?? 0) + 1);
    });
    for (const [level, count] of counts) omitted.push({ ruleId, level, count });
  }
  return { listed, omitted };
}

/** La fuente de los resultados de una regla y el nivel que le da el perfil o el catálogo. */
function ruleDefaults(rule: CatalogRule, c: ResultContext): { source: Result['source']; level: Level | undefined } {
  if (rule.layer !== 'profile') return { source: rule.layer, level: rule.level };
  if (c.profile === null) throw new Error(`${rule.id}: regla de perfil sin perfil aplicado`);
  return { source: c.profile.source, level: c.profile.rules.find((r) => r.ruleId === rule.id)?.level };
}

/** El nivel de un hallazgo: el suyo, si lo trae; si no, el de su regla. */
function levelOf(f: Finding, byRule: Level | undefined): Level {
  const level = f.level ?? byRule;
  if (level === undefined) throw new Error(`${f.ruleId}: regla de perfil que el perfil aplicado no trae`);
  return level;
}

interface Entry { f: Finding; at: number; level: Level }

/**
 * Los hallazgos de un código que quedan primeros en el orden del reporte, a lo
 * sumo MAX_RESULTS_PER_RULE, ordenados. Con más, un montículo de los que van
 * quedando: cada hallazgo se compara con el último de ellos, sin copiar nada.
 */
function firstInOrder(all: readonly Finding[], byRule: Level | undefined): Entry[] {
  if (all.length <= MAX_RESULTS_PER_RULE) return all.map((f, at) => ({ f, at, level: levelOf(f, byRule) })).sort(compareEntries);
  // El montículo tiene arriba el mayor de los que quedan.
  const heap: Entry[] = [];
  const down = (from: number): void => {
    for (let i = from; ;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let top = i;
      if (l < heap.length && compareEntries(heap[l] as Entry, heap[top] as Entry) > 0) top = l;
      if (r < heap.length && compareEntries(heap[r] as Entry, heap[top] as Entry) > 0) top = r;
      if (top === i) return;
      [heap[i], heap[top]] = [heap[top] as Entry, heap[i] as Entry];
      i = top;
    }
  };
  all.forEach((f, at) => {
    const level = levelOf(f, byRule);
    if (heap.length < MAX_RESULTS_PER_RULE) {
      heap.push({ f, at, level });
      if (heap.length === MAX_RESULTS_PER_RULE) for (let i = heap.length >> 1; i >= 0; i--) down(i);
    } else if (compareFindings(f, level, (heap[0] as Entry).f, (heap[0] as Entry).level) < 0) {
      heap[0] = { f, at, level };
      down(0);
    }
  });
  return heap.sort(compareEntries);
}

function compareEntries(a: Entry, b: Entry): number {
  return compareFindings(a.f, a.level, b.f, b.level);
}

/** El orden de sortResults entre hallazgos del mismo código: el mensaje depende solo de params y context. */
function compareFindings(a: Finding, al: Level, b: Finding, bl: Level): number {
  return (
    comparePointers(a.instanceLocation, b.instanceLocation) ||
    comparePointers(a.keywordLocation ?? '', b.keywordLocation ?? '') ||
    compareText(JSON.stringify(a.params ?? null), JSON.stringify(b.params ?? null)) ||
    compareText(JSON.stringify(a.context ?? null), JSON.stringify(b.context ?? null)) ||
    compareText(al, bl)
  );
}

/** Los caracteres de los textos de un valor, también los de adentro de listas y objetos. */
function textLength(value: JsonValue | undefined): number {
  if (typeof value === 'string') return value.length;
  if (typeof value !== 'object' || value === null) return 0;
  let n = 0;
  for (const v of Array.isArray(value) ? value : Object.values(value)) n += textLength(v);
  return n;
}

/** Orden de unidades de código, igual en cualquier configuración regional. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Dos punteros por segmentos: los índices (sin ceros a la izquierda) como
 * números y antes que los nombres, los nombres por unidades de código, y un
 * prefijo antes que lo que sigue. Recorre los dos textos sin partirlos.
 */
function comparePointers(a: JsonPointer, b: JsonPointer): number {
  // Lo que tienen igual al principio no se mira por segmentos: se sigue desde el segmento donde difieren.
  const n = Math.min(a.length, b.length);
  let k = 0;
  while (k < n && a.charCodeAt(k) === b.charCodeAt(k)) k++;
  if (k === a.length && k === b.length) return 0;
  let i = k === 0 ? 0 : a.lastIndexOf('/', k - 1) + 1;
  let j = i;
  for (;;) {
    const ea = endOfSegment(a, i);
    const eb = endOfSegment(b, j);
    const order = compareSegment(a, i, ea, b, j, eb);
    if (order !== 0) return order;
    if (ea === a.length || eb === b.length) return ea === a.length ? (eb === b.length ? 0 : -1) : 1;
    i = ea + 1;
    j = eb + 1;
  }
}

function endOfSegment(text: string, from: number): number {
  const at = text.indexOf('/', from);
  return at < 0 ? text.length : at;
}

function compareSegment(a: string, i: number, ea: number, b: string, j: number, eb: number): number {
  const ai = isIndex(a, i, ea);
  const bi = isIndex(b, j, eb);
  if (ai !== bi) return ai ? -1 : 1;
  if (ai && ea - i !== eb - j) return ea - i - (eb - j);
  for (; i < ea && j < eb; i++, j++) {
    const d = a.charCodeAt(i) - b.charCodeAt(j);
    if (d !== 0) return d;
  }
  return ea - i - (eb - j);
}

/** Si el tramo es un índice: dígitos, sin ceros a la izquierda. */
function isIndex(text: string, from: number, to: number): boolean {
  if (to === from || (to - from > 1 && text.charCodeAt(from) === 0x30)) return false;
  for (let k = from; k < to; k++) {
    const c = text.charCodeAt(k);
    if (c < 0x30 || c > 0x39) return false;
  }
  return true;
}
