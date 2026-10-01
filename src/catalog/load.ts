/**
 * El catálogo de reglas (catalog/<M.m>/rules.json), validado.
 *
 * loadCatalog controla lo que el schema del catálogo no puede decir: que cada
 * id aparezca una vez y en orden, que los schemas de cada regla (los params
 * del perfil, los params y el context de sus resultados) compilen, y que el
 * ejemplo de cada regla los cumpla. Devuelve una copia congelada.
 *
 * Lanza ante un catálogo que no cumple: es un error de empaquetado, que los
 * tests encuentran antes. El catálogo empaquetado siempre carga.
 */
import type { Catalog, CatalogRule, JsonValue, SchemaValidators } from '../types.js';

type RuleSchema = 'profileParamsSchema' | 'resultParamsSchema' | 'contextSchema';

export function loadCatalog(json: JsonValue, validators: SchemaValidators): Catalog {
  const errors = validators.validateAux('catalog', json);
  if (errors.length > 0) {
    const where = errors.map((e) => `${e.instanceLocation || '/'} ${e.keyword}`).join('; ');
    throw new Error(`el catálogo no cumple catalog.schema.json: ${where}`);
  }
  const catalog = structuredClone(json) as unknown as Catalog;
  let previous = '';
  for (const rule of catalog.rules) {
    if (rule.id === previous) throw new Error(`regla repetida en el catálogo: ${rule.id}`);
    if (rule.id < previous) throw new Error(`las reglas del catálogo van en orden de id: ${rule.id} después de ${previous}`);
    previous = rule.id;
    check(validators, rule, 'profileParamsSchema', undefined);
    check(validators, rule, 'resultParamsSchema', rule.example.params ?? {});
    check(validators, rule, 'contextSchema', (rule.example.context ?? {}) as JsonValue);
  }
  return deepFreeze(catalog);
}

/** Compila el schema de la regla y, si hay ejemplo, controla que lo cumpla. */
function check(validators: SchemaValidators, rule: CatalogRule, name: RuleSchema, example: JsonValue | undefined): void {
  let errors;
  try {
    errors = validators.validateWith(rule[name], example ?? {});
  } catch (error) {
    throw new Error(`${rule.id}: ${name} no compila: ${(error as Error).message}`);
  }
  if (example !== undefined && errors.length > 0) {
    const where = errors.map((e) => `${e.instanceLocation || '/'} ${e.keyword}`).join('; ');
    throw new Error(`${rule.id}: el ejemplo no cumple ${name}: ${where}`);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
