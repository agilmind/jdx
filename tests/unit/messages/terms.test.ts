/**
 * Vocabulario de los mensajes (catalog/1.0/terms.json): los términos que
 * comparten las plantillas del catálogo y los textos del recuento de países.
 * Es un dato empaquetado con su schema, así que otro programa arma los mismos
 * mensajes con rules.json y terms.json, sin este código.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { formatMessage, MESSAGE_TERMS, MESSAGE_VOCABULARY, TERMS_FILE } from '../../../src/messages/format.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { CatalogRule, JsonValue, Lang } from '../../../src/types.js';

const LANGS: readonly Lang[] = ['es', 'pt', 'en'];
const RULES_FILE = 'catalog/1.0/rules.json';
const termsText = files[TERMS_FILE] as string;
const vocabulary = (): { [k: string]: JsonValue } => JSON.parse(termsText) as { [k: string]: JsonValue };
const catalogJson = (): JsonValue => JSON.parse(files[RULES_FILE] as string) as JsonValue;
const errorsOf = (value: JsonValue) => defaultValidators().validateAux('terms', value).map((e) => [e.instanceLocation, e.keyword]);

type Data = (name: string) => JsonValue | undefined;
type Vocabulary = { terms: Record<string, Record<string, Record<Lang, string>>>; others: Record<'one' | 'many', Record<Lang, string>> };

/** La gramática de la guía, escrita aparte: solo lee las plantillas y el vocabulario. */
function render(template: string, lang: Lang, data: Data, words: Vocabulary, terms = true): string {
  const show = (value: JsonValue | undefined): string => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'number') return lang === 'en' ? String(value) : String(value).replace('.', ',');
    if (Array.isArray(value)) return value.map(show).join(', ');
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)(?::([a-z][A-Za-z0-9]*))?\}/gu, (_match, name: string, formatter: string | undefined, at: number) => {
    const value = data(name);
    if (formatter === undefined || !terms) return show(value);
    if (formatter === 'paren') return show(value) === '' ? '' : ` (${show(value)})`;
    if (formatter === 'others') {
      if (typeof value !== 'number' || value <= 1) return '';
      return render(value === 2 ? words.others.one[lang] : words.others.many[lang], lang, (n) => (n === 'count' ? value - 1 : undefined), words, false);
    }
    const term = formatter === 'flag' ? (value === true ? words.terms.flag?.[name]?.[lang] : undefined)
      : formatter === 'phrase' ? (show(value) === '' ? undefined : words.terms.phrase?.[name]?.[lang])
        : words.terms[formatter]?.[String(value)]?.[lang];
    if (term === undefined) return formatter === 'flag' || formatter === 'phrase' ? '' : show(value);
    const phrase = render(term, lang, data, words, false);
    return at === 0 ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase;
  });
}

afterEach(() => {
  vi.doUnmock('../../../src/generated/data.js');
  vi.resetModules();
});

describe('vocabulario de los mensajes', () => {
  it('the vocabulary is bundled data, catalog/1.0/terms.json, that conforms to terms.schema.json', () => {
    expect(TERMS_FILE).toBe('catalog/1.0/terms.json');
    expect(JSON.parse(termsText)).toEqual(MESSAGE_VOCABULARY);
    expect(termsText).toBe(`${JSON.stringify(JSON.parse(termsText), null, 2)}\n`);
    expect(MESSAGE_TERMS).toBe(MESSAGE_VOCABULARY.terms);
    expect(Object.isFrozen(MESSAGE_VOCABULARY) && Object.isFrozen(MESSAGE_TERMS.reason) && Object.isFrozen(MESSAGE_VOCABULARY.others.many)).toBe(true);
    expect(MESSAGE_VOCABULARY.catalog).toBe('1.0');
    expect(errorsOf(vocabulary())).toEqual([]);
    // Sin un idioma, many sin {count}, un formateador que no existe o una clave que no es un valor: no cumple.
    const without = vocabulary() as { terms: { right: { performing: { [k: string]: JsonValue } } }; others: { many: { [k: string]: JsonValue } } };
    delete without.terms.right.performing.pt;
    without.others.many.en = ' and other countries';
    expect(errorsOf(without as unknown as JsonValue)).toEqual([
      ['/terms/right/performing', 'required'],
      ['/others/many/en', 'pattern'],
    ]);
    const extra = vocabulary() as { terms: { [k: string]: JsonValue } };
    extra.terms.percent = {};
    (extra.terms['part'] as { [k: string]: JsonValue })['dos partes'] = { es: 'x', pt: 'x', en: 'x' };
    expect(errorsOf(extra as unknown as JsonValue)).toEqual([
      ['/terms/percent', 'additionalProperties'],
      ['/terms/part', 'pattern'],
      ['/terms/part', 'propertyNames'],
    ]);
  });

  it('rules.json and terms.json are enough to render every message with the grammar of the guide', () => {
    const rules = (catalogJson() as unknown as { rules: CatalogRule[] }).rules;
    const words = vocabulary() as unknown as Vocabulary;
    const shr002 = rules.find((r) => r.id === 'JDX-SHR-002') as CatalogRule;
    const cases: [CatalogRule, CatalogRule['example']][] = [
      ...rules.map((r): [CatalogRule, CatalogRule['example']] => [r, r.example]),
      // El recuento de países con dos, y una celda con filas de autor.
      [shr002, { ...shr002.example, params: { ...shr002.example.params, countries: 2 } }],
      [shr002, { ...shr002.example, params: { ...shr002.example.params, writer: true } }],
    ];
    for (const [r, example] of cases) {
      const data: Data = (name) => example.params?.[name] ?? (example.context as Record<string, JsonValue> | undefined)?.[name];
      for (const lang of LANGS) {
        expect(render(r.message[lang], lang, data, words), `${r.id} ${lang}`).toBe(formatMessage(r, lang, example.params, example.context));
      }
    }
  });

  it('loadCatalog refuses a vocabulary off its schema or of another catalog', async () => {
    for (const [terms, message] of [
      ['{}', `el vocabulario de los mensajes (${TERMS_FILE}) no cumple terms.schema.json`],
      [`${JSON.stringify({ ...vocabulary(), catalog: '1.1' })}\n`, 'el vocabulario de los mensajes es del catálogo 1.1 y el catálogo, del 1.0'],
    ] as const) {
      vi.resetModules();
      vi.doMock('../../../src/generated/data.js', () => ({ files: Object.freeze({ ...files, [TERMS_FILE]: terms }) }));
      const load = (await import('../../../src/catalog/load.js')).loadCatalog;
      const validators = (await import('../../../src/schema/validators.js')).defaultValidators();
      expect(() => load(catalogJson(), validators), message).toThrow(message);
    }
    // El vocabulario empaquetado carga.
    expect(loadCatalog(catalogJson(), defaultValidators()).catalog).toBe('1.0');
  });
});
