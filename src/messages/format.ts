/**
 * Mensajes del catálogo en es, pt y en. Cada regla trae una plantilla por
 * idioma, con placeholders que se llenan con los params y el context de un
 * resultado:
 *
 * - `{name}`: el valor de `params.name` o, si no está, de `context.name`. Un
 *   número va con coma decimal en es y pt (37,5) y con punto en en; una lista,
 *   con sus elementos separados por coma; un valor que falta queda vacío.
 * - `{name:right}`, `{name:part}`, `{name:field}`, `{name:reason}`: el término
 *   del valor en el idioma: el derecho, la parte de la obra, el dato que falta
 *   o la razón. Un término puede llevar a su vez placeholders, que se llenan
 *   con los mismos datos. Un valor sin término (un código nuevo) se muestra
 *   tal cual. Un término al comienzo del mensaje va con mayúscula inicial.
 * - `{name:flag}`: el término de `name` (no de su valor) si el valor es
 *   `true`; nada si no.
 * - `{name:others}`: un recuento de países, como el resto de los que fallan:
 *   nada con uno, `one` con dos y `many` con más, con `{count}` países.
 * - `{name:paren}`: un dato opcional entre paréntesis, precedido de un espacio;
 *   nada si falta, es null o queda vacío.
 *
 * Los términos y los textos de `others` son datos del catálogo
 * (catalog/<M.m>/terms.json, MESSAGE_VOCABULARY): con ellos y las plantillas
 * de rules.json, otro programa arma los mismos mensajes. El texto de un
 * resultado sirve para leerlo; se decide por `ruleId` y `params`, nunca por el
 * mensaje. loadCatalog controla al cargar el vocabulario, que cada placeholder
 * esté declarado y que cada valor tenga su término.
 */
import { files } from '../generated/data.js';
import type { CatalogRule, FindingContext, JsonValue, Lang } from '../types.js';

export type TermFormatter = 'right' | 'part' | 'field' | 'reason' | 'flag';
export type Formatter = TermFormatter | 'others' | 'paren';
export const FORMATTERS: readonly Formatter[] = Object.freeze(['right', 'part', 'field', 'reason', 'flag', 'others', 'paren']);

type Texts = Readonly<Record<Lang, string>>;
type Terms = Readonly<Record<string, Texts>>;

/** El vocabulario de los mensajes: el término de cada valor, por formateador, y los textos de `others`. */
export interface MessageVocabulary {
  catalog: string;
  terms: Readonly<Record<TermFormatter, Terms>>;
  others: Readonly<{ one: Texts; many: Texts }>;
}

/** El archivo empaquetado del vocabulario. */
export const TERMS_FILE = 'catalog/1.0/terms.json';

const LANGS: readonly Lang[] = Object.freeze(['es', 'pt', 'en']);

/**
 * El vocabulario empaquetado (catalog/1.0/terms.json), congelado. Las razones
 * completan una frase cuyo sujeto pone la plantilla ("La firma …", "El estado
 * del receptor …"): un mismo valor sirve a todas las reglas que lo usan. Un
 * archivo que falta o no es JSON deja un vocabulario vacío, y loadCatalog no
 * carga el catálogo.
 */
export const MESSAGE_VOCABULARY: MessageVocabulary = deepFreeze(parseVocabulary(files[TERMS_FILE]));

/** Los términos de cada formateador, por valor. */
export const MESSAGE_TERMS: Readonly<Record<TermFormatter, Terms>> = MESSAGE_VOCABULARY.terms;

function parseVocabulary(text: string | undefined): MessageVocabulary {
  const empty: MessageVocabulary = { catalog: '', terms: { right: {}, part: {}, field: {}, reason: {}, flag: {} }, others: { one: { es: '', pt: '', en: '' }, many: { es: '', pt: '', en: '' } } };
  try {
    const parsed = JSON.parse(text ?? '') as unknown;
    return isRecord(parsed) && isRecord(parsed.terms) && isRecord(parsed.others) ? (parsed as unknown as MessageVocabulary) : empty;
  } catch {
    return empty;
  }
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)(?::([a-z][A-Za-z0-9]*))?\}/gu;

/** Los placeholders de una plantilla, en orden: el nombre y, si tiene, el formateador. */
export function messagePlaceholders(template: string): { name: string; formatter?: string }[] {
  return [...template.matchAll(PLACEHOLDER)].map(([, name = '', formatter]) => (formatter === undefined ? { name } : { name, formatter }));
}

/**
 * El mensaje de la regla en `lang`, con los params y el context de un resultado. Nunca lanza:
 * un idioma sin plantilla usa la de español, y un dato que no se puede mostrar queda vacío.
 */
export function formatMessage(rule: CatalogRule, lang: Lang, params?: { [k: string]: JsonValue }, context?: FindingContext): string {
  const messages = isRecord(rule) && isRecord(rule.message) ? (rule.message as Record<string, unknown>) : {};
  const use: Lang = (LANGS as readonly string[]).includes(lang) && typeof messages[lang] === 'string' ? lang : 'es';
  const template = typeof messages[use] === 'string' ? (messages[use] as string) : '';
  const valueOf = (name: string): JsonValue | undefined => {
    if (isRecord(params) && Object.hasOwn(params, name)) return params[name];
    if (isRecord(context) && Object.hasOwn(context, name)) return (context as Record<string, JsonValue>)[name];
    return undefined;
  };
  try {
    return fill(template, use, valueOf, true);
  } catch {
    return template.replace(PLACEHOLDER, '');
  }
}

function fill(template: string, lang: Lang, valueOf: (name: string) => JsonValue | undefined, terms: boolean): string {
  return template.replace(PLACEHOLDER, (_match, name: string, formatter: string | undefined, offset: number) => {
    const value = valueOf(name);
    if (formatter === undefined || !terms) return text(value, lang);
    if (formatter === 'others') return others(value, lang);
    if (formatter === 'paren') {
      const shown = text(value, lang);
      return shown === '' ? '' : ` (${shown})`;
    }
    // flag busca el término del nombre, y solo con true; los demás, el del valor.
    const key = formatter === 'flag' ? (value === true ? name : undefined) : typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
    const term = key === undefined ? undefined : termOf(formatter as TermFormatter, key, lang);
    if (term === undefined) return formatter === 'flag' ? '' : text(value, lang);
    // La frase de un término se llena con los mismos datos, sin otro nivel de términos.
    const phrase = fill(term, lang, valueOf, false);
    return offset === 0 ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase;
  });
}

/** El término de un valor, o undefined si no tiene. */
export function termOf(formatter: TermFormatter, value: string, lang: Lang): string | undefined {
  const terms = Object.hasOwn(MESSAGE_TERMS, formatter) ? (MESSAGE_TERMS[formatter] as Terms | undefined) : undefined;
  if (!isRecord(terms) || !Object.hasOwn(terms, value)) return undefined;
  const texts = terms[value];
  return isRecord(texts) && typeof texts[lang] === 'string' ? texts[lang] : undefined;
}

function text(value: JsonValue | undefined, lang: Lang): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return lang === 'en' ? String(value) : String(value).replace('.', ',');
  if (Array.isArray(value)) return value.map((item) => text(item, lang)).join(', ');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value) ?? '';
    } catch {
      return '';
    }
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function others(value: JsonValue | undefined, lang: Lang): string {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 1) return '';
  const rest = value - 1;
  const texts = rest === 1 ? MESSAGE_VOCABULARY.others.one : MESSAGE_VOCABULARY.others.many;
  const template = isRecord(texts) && typeof texts[lang] === 'string' ? texts[lang] : '';
  return fill(template, lang, (name) => (name === 'count' ? rest : undefined), false);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
