/**
 * Las reglas que el validador evalúa en el paso de las reglas, por código. Las
 * etapas (entorno, JSON, versión y schema, el índice del documento y la firma)
 * dan sus hallazgos sin pasar por acá.
 *
 * Cada módulo de reglas (src/rules/<capa>/<área>.ts) exporta sus reglas, y la
 * lista de RULES las suma. Una regla tiene que estar en el catálogo, activa e
 * implementada, y ser del núcleo, del perfil o de la política, con un código
 * que no da una etapa: validate lo controla al correrla.
 */
import type { Rule, RuleId } from '../types.js';
import { DEC_002, DEC_003, DEC_004, DEC_005 } from './core/declaration.js';
import { MED_001, MED_004, MED_009 } from './core/media.js';
import { MED_002, MED_006, MED_007, MED_008 } from './core/mediaDir.js';
import { NUM_001, NUM_002 } from './core/numbers.js';
import { VER_004 } from './core/openLists.js';

/** Un registro: cada regla por su código, en el orden de la lista. Lanza con un código repetido. */
export function ruleMap(rules: readonly Rule[]): ReadonlyMap<RuleId, Rule> {
  const map = new Map<RuleId, Rule>();
  for (const rule of rules) {
    if (map.has(rule.id)) throw new Error(`regla repetida en el registro: ${rule.id}`);
    map.set(rule.id, rule);
  }
  return map;
}

export const RULES: ReadonlyMap<RuleId, Rule> = ruleMap([NUM_001, NUM_002, DEC_002, DEC_003, DEC_004, DEC_005, MED_001, MED_004, MED_009, VER_004, MED_002, MED_006, MED_007, MED_008]);
