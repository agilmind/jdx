/**
 * Las reglas que el validador evalúa en el paso de las reglas, por código. Las
 * etapas (entorno, JSON, versión y schema, el índice del documento y la firma)
 * dan sus hallazgos sin pasar por acá.
 *
 * Cada módulo de reglas (src/rules/<capa>/<área>.ts) exporta sus reglas, y la
 * lista de RULES las suma. Una regla tiene que estar en el catálogo, activa e
 * implementada, y ser del núcleo, del perfil o de la política: validate lo
 * controla al correrla.
 */
import type { Rule, RuleId } from '../types.js';

/** Un registro: cada regla por su código, en el orden de la lista. Lanza con un código repetido. */
export function ruleMap(rules: readonly Rule[]): ReadonlyMap<RuleId, Rule> {
  const map = new Map<RuleId, Rule>();
  for (const rule of rules) {
    if (map.has(rule.id)) throw new Error(`regla repetida en el registro: ${rule.id}`);
    map.set(rule.id, rule);
  }
  return map;
}

export const RULES: ReadonlyMap<RuleId, Rule> = ruleMap([]);
