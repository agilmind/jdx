/**
 * El catálogo de reglas (catalog/<M.m>/rules.json), validado.
 *
 * loadCatalog controla lo que el schema del catálogo no puede decir: que cada
 * id aparezca una vez y en orden, que los schemas de cada regla (los params
 * del perfil, los params y el context de sus resultados) compilen, que el
 * ejemplo de cada regla los cumpla, y que sus mensajes solo usen datos que la
 * regla declara (src/messages/format.ts): los mismos placeholders en los tres
 * idiomas, formateadores que existen y un término para cada valor posible de
 * lo que se traduce. Controla también el vocabulario de los mensajes
 * (catalog/<M.m>/terms.json): que cumpla terms.schema.json y sea del mismo
 * catálogo. Devuelve una copia congelada.
 *
 * Lanza ante un catálogo que no cumple: es un error de empaquetado, que los
 * tests encuentran antes. El catálogo empaquetado siempre carga.
 */
import { FORMATTERS, MESSAGE_VOCABULARY, messagePlaceholders, TERMS_FILE, termOf, type TermFormatter } from '../messages/format.js';
import type { Catalog, CatalogRule, JsonValue, Lang, SchemaValidators } from '../types.js';

type RuleSchema = 'profileParamsSchema' | 'resultParamsSchema' | 'contextSchema';
const LANGS: readonly Lang[] = ['es', 'pt', 'en'];

export function loadCatalog(json: JsonValue, validators: SchemaValidators): Catalog {
  const errors = validators.validateAux('catalog', json);
  if (errors.length > 0) {
    const where = errors.map((e) => `${e.instanceLocation || '/'} ${e.keyword}`).join('; ');
    throw new Error(`el catálogo no cumple catalog.schema.json: ${where}`);
  }
  const catalog = structuredClone(json) as unknown as Catalog;
  checkVocabulary(validators, catalog.catalog);
  let previous = '';
  for (const rule of catalog.rules) {
    if (rule.id === previous) throw new Error(`regla repetida en el catálogo: ${rule.id}`);
    if (rule.id < previous) throw new Error(`las reglas del catálogo van en orden de id: ${rule.id} después de ${previous}`);
    previous = rule.id;
    check(validators, rule, 'profileParamsSchema', undefined);
    check(validators, rule, 'resultParamsSchema', rule.example.params ?? {});
    check(validators, rule, 'contextSchema', (rule.example.context ?? {}) as JsonValue);
    checkMessages(rule);
  }
  return deepFreeze(catalog);
}

/** El vocabulario de los mensajes: cumple su schema y es del mismo catálogo. */
function checkVocabulary(validators: SchemaValidators, version: string): void {
  const errors = validators.validateAux('terms', MESSAGE_VOCABULARY as unknown as JsonValue);
  if (errors.length > 0) {
    const where = errors.map((e) => `${e.instanceLocation || '/'} ${e.keyword}`).join('; ');
    throw new Error(`el vocabulario de los mensajes (${TERMS_FILE}) no cumple terms.schema.json: ${where}`);
  }
  if (MESSAGE_VOCABULARY.catalog !== version) {
    throw new Error(`el vocabulario de los mensajes es del catálogo ${MESSAGE_VOCABULARY.catalog} y el catálogo, del ${version}`);
  }
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

/** Los mensajes de la regla: placeholders declarados, formateadores que existen y un término para cada valor. */
function checkMessages(rule: CatalogRule): void {
  const declared = new Set([...propertiesOf(rule.resultParamsSchema), ...propertiesOf(rule.contextSchema)]);
  const undeclared = (name: string) => !declared.has(name);
  const checkTerm = (formatter: TermFormatter, name: string, key: string, lang: Lang): void => {
    const term = termOf(formatter, key, lang);
    if (term === undefined) throw new Error(`${rule.id}: {${name}:${formatter}} no tiene término para ${key}`);
    const inner = messagePlaceholders(term).find((p) => undeclared(p.name));
    if (inner !== undefined) {
      throw new Error(`${rule.id}: el término ${key} de ${formatter} usa {${inner.name}}, que no está en params ni en context`);
    }
  };
  for (const lang of LANGS) {
    for (const { name, formatter } of messagePlaceholders(rule.message[lang])) {
      if (undeclared(name)) throw new Error(`${rule.id}: el mensaje ${lang} usa {${name}}, que no está en params ni en context`);
      if (formatter === undefined) continue;
      if (!(FORMATTERS as readonly string[]).includes(formatter)) {
        throw new Error(`${rule.id}: el mensaje ${lang} usa el formateador ${formatter}, que no existe`);
      }
      if (formatter === 'others' || formatter === 'paren') continue;
      if (formatter === 'flag') {
        if (propertyOf(rule.resultParamsSchema, name)?.type !== 'boolean') throw new Error(`${rule.id}: {${name}:flag} pide un dato booleano de params`);
        checkTerm('flag', name, name, lang);
        continue;
      }
      for (const value of enumOf(rule.resultParamsSchema, name)) checkTerm(formatter as TermFormatter, name, value, lang);
    }
  }
  const used = (lang: Lang): string =>
    [...new Set(messagePlaceholders(rule.message[lang]).map((p) => `${p.name}:${p.formatter ?? ''}`))].sort().join(' ');
  if (new Set(LANGS.map(used)).size !== 1) throw new Error(`${rule.id}: los mensajes en es, pt y en no usan los mismos placeholders`);
}

/** Las propiedades que declara un schema de objeto. */
function propertiesOf(schema: object): string[] {
  const properties = (schema as { properties?: object }).properties;
  return typeof properties === 'object' && properties !== null ? Object.keys(properties) : [];
}

/** El schema de una propiedad de un schema de objeto, o undefined. */
function propertyOf(schema: object, name: string): { type?: unknown; enum?: unknown } | undefined {
  const properties = (schema as { properties?: Record<string, { type?: unknown; enum?: unknown }> }).properties;
  return typeof properties === 'object' && properties !== null && Object.hasOwn(properties, name) ? properties[name] : undefined;
}

/** Los valores de una propiedad con `enum` (un texto cerrado), o ninguno. */
function enumOf(schema: object, name: string): string[] {
  const property = propertyOf(schema, name);
  return Array.isArray(property?.enum) ? property.enum.filter((v): v is string => typeof v === 'string') : [];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
