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
 *
 * Un hallazgo de una regla que no está en el catálogo, o de una regla de perfil
 * sin perfil aplicado, es un error de programación y lanza.
 */
import { formatMessage } from '../messages/format.js';
import type { Catalog, CatalogRule, CheckName, Finding, JsonPointer, Lang, Level, ResolvedProfile, Result } from '../types.js';

export interface ResultContext { catalog: Catalog; profile: ResolvedProfile | null; lang: Lang }

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
  let source: Result['source'];
  let profileLevel: Level | undefined;
  if (rule.layer === 'profile') {
    if (c.profile === null) throw new Error(`${f.ruleId}: regla de perfil sin perfil aplicado`);
    source = c.profile.source;
    profileLevel = c.profile.rules.find((r) => r.ruleId === f.ruleId)?.level;
  } else {
    source = rule.layer;
  }
  const level = f.level ?? profileLevel ?? rule.level;
  if (level === undefined) throw new Error(`${f.ruleId}: regla de perfil que el perfil aplicado no trae`);
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
  const step = (r: Result): number => STEP[catalogRule(catalog, r.ruleId).check];
  return [...results].sort(
    (a, b) =>
      step(a) - step(b) ||
      compareText(a.ruleId, b.ruleId) ||
      comparePointers(a.instanceLocation, b.instanceLocation) ||
      comparePointers(a.keywordLocation ?? '', b.keywordLocation ?? '') ||
      compareText(JSON.stringify(a.params ?? null), JSON.stringify(b.params ?? null)) ||
      compareText(JSON.stringify(a.context ?? null), JSON.stringify(b.context ?? null)) ||
      compareText(a.message, b.message) ||
      compareText(a.level, b.level) ||
      compareText(a.source, b.source),
  );
}

/** Orden de unidades de código, igual en cualquier configuración regional. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const INDEX = /^(?:0|[1-9]\d*)$/u;

/** Por segmentos: los índices como números y antes que los nombres; un prefijo antes que lo que sigue. */
function comparePointers(a: JsonPointer, b: JsonPointer): number {
  const as = a.split('/');
  const bs = b.split('/');
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    const x = as[i] as string;
    const y = bs[i] as string;
    if (x === y) continue;
    const xi = INDEX.test(x);
    const yi = INDEX.test(y);
    if (xi && yi) return x.length - y.length || compareText(x, y);
    if (xi !== yi) return xi ? -1 : 1;
    return compareText(x, y);
  }
  return as.length - bs.length;
}
