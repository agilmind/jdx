/**
 * Mensajes del catálogo en es, pt y en: cada plantilla se llena con los params
 * y el context del resultado. Los números van con coma decimal en es y pt; los
 * derechos, las partes, los datos que faltan y las razones se traducen; el
 * recuento de países dice cuántos más fallan. Un placeholder que la regla no
 * declara no pasa la carga del catálogo.
 */
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { formatMessage, MESSAGE_TERMS, messagePlaceholders } from '../../../src/messages/format.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { CatalogRule, JsonValue, Lang } from '../../../src/types.js';

const bundled = (): { catalog: string; rules: { [k: string]: JsonValue }[] } =>
  JSON.parse(files['catalog/1.0/rules.json'] as string) as { catalog: string; rules: { [k: string]: JsonValue }[] };
const catalog = loadCatalog(bundled() as unknown as JsonValue, defaultValidators());
const rule = (id: string): CatalogRule => {
  const found = catalog.rules.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no está en el catálogo: ${id}`);
  return found;
};
const LANGS: readonly Lang[] = ['es', 'pt', 'en'];

/** La celda de SHR-008 de la subedición en España sin la exclusión. */
const SHR008 = { agreement: 'a1', right: 'performing', country: 'ES', countries: 1, sum: 37.5, expected: 25 };

describe('mensajes', () => {
  it('AGR-003 es renders the report example message exactly', () => {
    // El mensaje del ejemplo del reporte (tests/unit/schema/aux.test.ts).
    expect(formatMessage(rule('JDX-AGR-003'), 'es', { percent: 30, cap: 25 }, { agreement: 'a1' })).toBe(
      'El contrato da a la editora el 30 %; el tope es 25 %.',
    );
    // Un porcentaje con cuatro decimales va con coma en es.
    expect(formatMessage(rule('JDX-AGR-003'), 'es', { percent: 33.3334, cap: 33.3333 })).toBe(
      'El contrato da a la editora el 33,3334 %; el tope es 33,3333 %.',
    );
  });

  it('SHR-008 renders the agreement, the sum and the expected value', () => {
    expect(formatMessage(rule('JDX-SHR-008'), 'es', SHR008, { work: 'w1', agreement: 'a1' })).toBe(
      'Las filas de editora del contrato a1 suman 37,5 en ejecución en ES; el contrato da 25.',
    );
    // Con via (un grupo de un contrato sin subedición), el mismo mensaje.
    expect(formatMessage(rule('JDX-SHR-008'), 'es', { ...SHR008, via: ['p1'], country: 'AR', countries: 249, sum: 25, expected: 12.5 })).toBe(
      'Las filas de editora del contrato a1 suman 25 en ejecución en AR y otros 248 países; el contrato da 12,5.',
    );
  });

  it('one country renders without "y otros"', () => {
    const shr002 = rule('JDX-SHR-002');
    const cell = (countries: number) => ({ right: 'mechanical', country: 'AR', countries, sum: 110, cap: 100 });
    expect(formatMessage(shr002, 'es', cell(1))).toBe(
      'Las filas de cobro suman 110 en reproducción mecánica en AR; el máximo es 100.',
    );
    expect(formatMessage(shr002, 'es', cell(1))).not.toContain('y otro');
    expect(formatMessage(shr002, 'es', cell(2))).toContain('en AR y otro país;');
    expect(formatMessage(shr002, 'es', cell(3))).toContain('en AR y otros 2 países;');
    expect(formatMessage(shr002, 'pt', cell(1))).toContain('em AR;');
    expect(formatMessage(shr002, 'pt', cell(2))).toContain('em AR e outro país;');
    expect(formatMessage(shr002, 'pt', cell(249))).toContain('em AR e outros 248 países;');
    expect(formatMessage(shr002, 'en', cell(1))).toContain('in AR;');
    expect(formatMessage(shr002, 'en', cell(2))).toContain('in AR and one other country;');
    expect(formatMessage(shr002, 'en', cell(249))).toContain('in AR and 248 other countries;');
  });

  it('SHR-002 asks for exactly 100 only when the cell has writer rows', () => {
    const shr002 = rule('JDX-SHR-002');
    const cell = { right: 'performing', country: 'AR', countries: 1, sum: 90, cap: 100 };
    expect(formatMessage(shr002, 'es', { ...cell, writer: true })).toBe(
      'Las filas de cobro suman 90 en ejecución en AR; el máximo es 100 y, con filas de autor, tienen que sumar exactamente 100.',
    );
    expect(formatMessage(shr002, 'pt', { ...cell, writer: true })).toBe(
      'As linhas de recebimento somam 90 em execução em AR; o máximo é 100 e, com linhas de autor, devem somar exatamente 100.',
    );
    expect(formatMessage(shr002, 'en', { ...cell, writer: true })).toBe(
      'The collection rows add up to 90 for performing rights in AR; the maximum is 100 and, with writer rows, they must total exactly 100.',
    );
    // Sin filas de autor (writer ausente o distinto de true), solo el máximo.
    for (const writer of [undefined, false, 'true']) {
      const params = writer === undefined ? { ...cell, sum: 110 } : { ...cell, sum: 110, writer };
      expect(formatMessage(shr002, 'en', params), String(writer)).toBe('The collection rows add up to 110 for performing rights in AR; the maximum is 100.');
    }
  });

  it('a term at the start of a message takes a capital letter', () => {
    expect(formatMessage(rule('JDX-ENV-010'), 'es', { option: '--received-at', reason: 'missing' })).toBe('Falta la opción --received-at.');
    expect(formatMessage(rule('JDX-ENV-010'), 'es', { option: '--env', reason: 'invalid' })).toBe('No es válida la opción --env.');
    expect(formatMessage(rule('JDX-ENV-010'), 'pt', { option: '--received-at', reason: 'missing' })).toBe('A opção --received-at está ausente.');
    const med002 = { path: 'contrato.pdf', field: 'size' };
    expect(formatMessage(rule('JDX-MED-002'), 'es', med002)).toBe('El tamaño (size) del archivo contrato.pdf no coincide con lo declarado.');
    expect(formatMessage(rule('JDX-MED-002'), 'pt', med002)).toBe('O tamanho (size) do arquivo contrato.pdf não confere com o declarado.');
    expect(formatMessage(rule('JDX-MED-002'), 'en', med002)).toBe('The size of file contrato.pdf does not match the declaration.');
    // En medio de la frase, el término va como está; un valor sin término, también al comienzo.
    expect(formatMessage(rule('JDX-ENV-001'), 'es', { reason: 'missing' })).toBe('Hay firma y falta la lista de confianza.');
    expect(formatMessage(rule('JDX-ENV-010'), 'es', { option: '--x', reason: 'x_new' })).toBe('x_new la opción --x.');
  });

  it('field terms carry their article and end with the field name, unless they are just the name', () => {
    const articles: Record<Lang, RegExp> = { es: /^(el|la|los|las) /u, pt: /^(o|a|os|as) /u, en: /^the /u };
    for (const [key, texts] of Object.entries(MESSAGE_TERMS.field)) {
      for (const lang of LANGS) {
        const term = texts[lang];
        expect(term, `${key} ${lang}`).toMatch(articles[lang]);
        const justTheName = term.replace(articles[lang], '') === key;
        expect(/ \([A-Za-z0-9]+\)$/u.test(term), `${key} ${lang}: ${term}`).toBe(!justTheName);
      }
    }
  });

  it('messages read naturally in neutral Spanish, in Portuguese and in English', () => {
    const say = (id: string, lang: Lang, params: { [k: string]: JsonValue }, context?: { [k: string]: string }) => formatMessage(rule(id), lang, params, context);
    expect(say('JDX-REF-003', 'es', { value: 'm2', found: 'audio', expected: ['registrationFiling'] })).toBe('La referencia m2 es de tipo audio; se esperaba registrationFiling.');
    expect(say('JDX-REF-003', 'pt', { value: 'm2', found: 'audio', expected: ['registrationFiling'] })).toBe('A referência m2 é do tipo audio; esperado: registrationFiling.');
    expect(say('JDX-REF-004', 'es', { value: 'a2', reason: 'agreementWorks' })).toBe('La referencia a a2 apunta a un contrato que no incluye la obra.');
    expect(say('JDX-REF-004', 'pt', { value: 'a2', reason: 'agreementWorks' })).toBe('A referência a a2 aponta para um contrato que não inclui a obra.');
    const env007 = { reason: 'requiresValidator', required: '>=2.0.0', version: '1.0.0' };
    expect(say('JDX-ENV-007', 'es', env007)).toBe('El validador 1.0.0 es demasiado antiguo: el perfil requiere >=2.0.0.');
    expect(say('JDX-ENV-007', 'pt', env007)).toBe('O validador 1.0.0 não é suficiente: o perfil exige >=2.0.0.');
    expect(say('JDX-ENV-007', 'en', env007)).toBe('Validator 1.0.0 is too old: the profile requires >=2.0.0.');
    const agr006 = { field: 'retailPricePercent', percent: 15, min: 20 };
    expect(say('JDX-AGR-006', 'es', agr006, { agreement: 'a1' })).toBe('El contrato a1 fija la regalía sobre el precio de venta (retailPricePercent) en el 15 %; el mínimo es 20 %.');
    expect(say('JDX-AGR-006', 'pt', agr006, { agreement: 'a1' })).toBe('O contrato a1 fixa os direitos sobre o preço de venda (retailPricePercent) em 15 %; o mínimo é 20 %.');
    expect(say('JDX-AGR-006', 'en', agr006, { agreement: 'a1' })).toBe('Agreement a1 sets the retail price royalty (retailPricePercent) at 15%; the minimum is 20%.');
    expect(say('JDX-SHR-004', 'en', { missing: 'via' }, { party: 'p5' })).toBe('The publisher row of p5 lacks the represented rights holder (via).');
    expect(say('JDX-MED-010', 'en', { missing: 'delivery' }, { media: 'm4' })).toBe('Media m4 lacks the delivery it travelled in (delivery).');
    expect(say('JDX-CMP-003', 'en', { registry: 'DNDA_AR', part: 'lyrics' }, { work: 'w2' })).toBe('Work w2 has no DNDA_AR registration for its lyrics.');
    expect(say('JDX-EDN-001', 'es', { missing: 'registration', registry: 'DNDA_AR' })).toBe('A la edición le falta la inscripción en DNDA_AR como obra publicada (registrations).');
    // Sin formas regionales del español, y sin las formas que no se usan en portugués ni en inglés.
    const all = catalog.rules.flatMap((r) => [r.message, r.predicate]).concat(Object.values(MESSAGE_TERMS).flatMap((terms) => Object.values(terms)));
    expect(all.filter((texts) => /\bacá\b|no alcanza|\bpiso\b/u.test(texts.es)).map((texts) => texts.es)).toEqual([]);
    expect(all.filter((texts) => /aqui vai|está faltando|não basta|\broyalty\b|\bpiso\b/u.test(texts.pt)).map((texts) => texts.pt)).toEqual([]);
    expect(all.filter((texts) => /\d %|is not enough|must make|\bhas no (via|delivery)\b|fewer than two coWriter\b/u.test(texts.en)).map((texts) => texts.en)).toEqual([]);
  });

  it('ENV-001 and ENV-005 say why the list or the state cannot be read, only when they know', () => {
    const say = (id: string, lang: Lang, params: { [k: string]: JsonValue }) => formatMessage(rule(id), lang, params);
    expect(say('JDX-ENV-001', 'es', { reason: 'invalid', cause: 'listValidity' })).toBe(
      'Hay firma y no es válida la lista de confianza: vence antes de emitirse o más de 90 días después.',
    );
    expect(say('JDX-ENV-001', 'pt', { reason: 'invalid', cause: 'json' })).toBe('Há assinatura e a lista de confiança não é válida: não é I-JSON.');
    expect(say('JDX-ENV-001', 'en', { reason: 'invalid', cause: 'signatures' })).toBe('There is a signature and the trust list is not valid: it has more than 8 signatures.');
    expect(say('JDX-ENV-001', 'en', { reason: 'invalid' })).toBe('There is a signature and the trust list is not valid.');
    expect(say('JDX-ENV-005', 'es', { reason: 'unreadable', cause: 'missingDir' })).toBe('El estado del receptor no se puede leer: la carpeta no existe.');
    expect(say('JDX-ENV-005', 'pt', { reason: 'unreadable', cause: 'schema' })).toBe('O estado do receptor não pode ser lido: não cumpre seu schema.');
    expect(say('JDX-ENV-005', 'en', { reason: 'unreadable', cause: 'lock' })).toBe("The receiver's state cannot be read: its lock (state.lock) cannot be used.");
    expect(say('JDX-ENV-005', 'es', { reason: 'unreadable' })).toBe('El estado del receptor no se puede leer.');
    // Cada causa del catálogo tiene su texto en los tres idiomas, y solo va con la razón que la admite.
    const validators = defaultValidators();
    for (const [id, reason] of [['JDX-ENV-001', 'invalid'], ['JDX-ENV-005', 'unreadable']] as const) {
      const r = rule(id);
      const causes = (r.resultParamsSchema as { properties: { cause: { enum: string[] } } }).properties.cause.enum;
      for (const cause of causes) {
        expect(validators.validateWith(r.resultParamsSchema, { reason, cause }), `${id} ${cause}`).toEqual([]);
        for (const lang of LANGS) expect(say(id, lang, { reason, cause }), `${id} ${cause} ${lang}`).toMatch(/: [^:{}]+\.$/u);
      }
      const other = id === 'JDX-ENV-001' ? { reason: 'missing', cause: 'jws' } : { reason: 'version', cause: 'json' };
      expect(validators.validateWith(r.resultParamsSchema, other), id).not.toEqual([]);
    }
  });

  it('pt and en render', () => {
    expect(formatMessage(rule('JDX-SHR-008'), 'pt', SHR008)).toBe(
      'As linhas de editora do contrato a1 somam 37,5 em execução em ES; o contrato dá 25.',
    );
    expect(formatMessage(rule('JDX-SHR-008'), 'en', SHR008)).toBe(
      'The publisher rows of agreement a1 add up to 37.5 for performing rights in ES; the agreement gives 25.',
    );
    expect(formatMessage(rule('JDX-AGR-003'), 'pt', { percent: 30, cap: 25 })).toBe('O contrato dá à editora 30 %; o teto é 25 %.');
    expect(formatMessage(rule('JDX-AGR-003'), 'en', { percent: 30, cap: 25 })).toBe('The agreement gives the publisher 30%; the cap is 25%.');
    // Las razones, los datos que faltan y las partes también se traducen.
    expect(formatMessage(rule('JDX-ENV-006'), 'pt', { reason: 'retiredRule', ruleId: 'JDX-SHR-001' })).toBe(
      'O perfil não pode ser aplicado: a regra JDX-SHR-001 está retirada.',
    );
    expect(formatMessage(rule('JDX-ENV-005'), 'en', { reason: 'locked', lockedSince: '2026-09-30T09:12:00-03:00' })).toBe(
      "The receiver's state has been locked since 2026-09-30T09:12:00-03:00.",
    );
    // Con cero o con un coautor, el mismo texto: falta el mínimo de dos.
    expect(formatMessage(rule('JDX-AGR-002'), 'es', { missing: 'coWriter' }, { agreement: 'a3' })).toBe('Al contrato a3 le falta el mínimo de dos coautores (coWriter).');
    expect(formatMessage(rule('JDX-AGR-002'), 'en', { missing: 'coWriter' }, { agreement: 'a3' })).toBe('Agreement a3 lacks the minimum of two co-writers (coWriter).');
    expect(formatMessage(rule('JDX-CMP-003'), 'pt', { registry: 'DNDA_AR', part: 'lyrics' }, { work: 'w2' })).toBe(
      'Falta o registro DNDA_AR da letra da obra w2.',
    );
  });

  it('rights are translated', () => {
    const shr002 = rule('JDX-SHR-002');
    const expected: Record<string, Record<Lang, string>> = {
      performing: { es: 'ejecución', pt: 'execução', en: 'performing rights' },
      mechanical: { es: 'reproducción mecánica', pt: 'reprodução mecânica', en: 'mechanical rights' },
      synchronization: { es: 'sincronización', pt: 'sincronização', en: 'synchronization rights' },
      print: { es: 'impresión', pt: 'impressão', en: 'print rights' },
    };
    expect(MESSAGE_TERMS.right).toEqual(expected);
    const at = { es: ' en ', pt: ' em ', en: ' for ' };
    for (const [right, names] of Object.entries(expected)) {
      for (const lang of LANGS) {
        const text = formatMessage(shr002, lang, { right, country: 'AR', countries: 1, sum: 101, cap: 100 });
        expect(text, `${right} ${lang}`).toContain(`${at[lang]}${names[lang]} `);
      }
    }
    // Un código sin término se muestra tal cual.
    expect(formatMessage(shr002, 'es', { right: 'X_OTHER', country: 'AR', countries: 1, sum: 101, cap: 100 })).toContain(' en X_OTHER en AR');
  });

  it('every catalog message renders its example in the three languages', () => {
    for (const r of catalog.rules) {
      for (const lang of LANGS) {
        const text = formatMessage(r, lang, r.example.params, r.example.context);
        expect(text, `${r.id} ${lang}`).not.toMatch(/[{}]/u);
        expect(text.length, `${r.id} ${lang}`).toBeGreaterThan(10);
        // Cada valor del ejemplo que la plantilla muestra sin formateador aparece tal cual (los números, con su coma).
        for (const { name, formatter } of messagePlaceholders(r.message[lang])) {
          const value = (r.example.params?.[name] ?? (r.example.context as Record<string, JsonValue> | undefined)?.[name]) as JsonValue | undefined;
          if (formatter === undefined && typeof value === 'string') expect(text, `${r.id} ${lang} {${name}}`).toContain(value);
        }
      }
    }
    // Cada razón de ENV-006 se lee completa, con el dato que la acompaña.
    const env006 = rule('JDX-ENV-006');
    expect(formatMessage(env006, 'es', { reason: 'unknownProfile', profile: 'sadaic/9.9' })).toBe(
      'El perfil no se puede aplicar: el validador no incluye sadaic/9.9.',
    );
    expect(formatMessage(env006, 'es', { reason: 'notImplemented', ruleId: 'JDX-IDN-004' })).toBe(
      'El perfil no se puede aplicar: el validador no implementa la regla JDX-IDN-004.',
    );
    expect(formatMessage(env006, 'en', { reason: 'jdxNotAdmitted', jdx: '1.1' })).toBe('The profile cannot be applied: it does not admit document version 1.1.');
    // Lo que falta queda vacío, sin el placeholder.
    expect(formatMessage(rule('JDX-ENV-002'), 'es')).toBe('La lista de confianza venció el .');
  });

  it('placeholders not in params or context fail at catalog load', () => {
    const validators = defaultValidators();
    const withRule = (id: string, change: (r: { [k: string]: JsonValue }) => { [k: string]: JsonValue }): JsonValue => {
      const base = bundled();
      return { catalog: base.catalog, rules: base.rules.map((r) => (r.id === id ? change(r) : r)) };
    };
    const message = (r: { [k: string]: JsonValue }, lang: Lang, text: string) => ({ ...r, message: { ...(r.message as object), [lang]: text } });
    expect(() => loadCatalog(withRule('JDX-AGR-003', (r) => message(r, 'pt', 'O contrato dá {pct} %.')), validators)).toThrow(
      'JDX-AGR-003: el mensaje pt usa {pct}, que no está en params ni en context',
    );
    expect(() => loadCatalog(withRule('JDX-AGR-003', (r) => message(r, 'es', 'El contrato da {percent:percent} %; el tope es {cap} %.')), validators)).toThrow(
      'JDX-AGR-003: el mensaje es usa el formateador percent, que no existe',
    );
    expect(() => loadCatalog(withRule('JDX-AGR-003', (r) => message(r, 'en', 'The agreement gives {percent} %.')), validators)).toThrow(
      'JDX-AGR-003: los mensajes en es, pt y en no usan los mismos placeholders',
    );
    // Un valor de la regla que su formateador no sabe decir.
    const withReason = withRule('JDX-ENV-001', (r) => ({
      ...r,
      resultParamsSchema: {
        type: 'object',
        properties: { reason: { type: 'string', enum: ['missing', 'expiredYesterday'] }, cause: { type: 'string', enum: ['jws'] } },
        required: ['reason'],
        additionalProperties: false,
      },
      example: { params: { reason: 'missing' } },
    }));
    expect(() => loadCatalog(withReason, validators)).toThrow('JDX-ENV-001: {reason:reason} no tiene término para expiredYesterday');
    // Una frase de razón con un dato que la regla no declara.
    const withoutRuleId = withRule('JDX-ENV-006', (r) => ({
      ...r,
      resultParamsSchema: { type: 'object', properties: { reason: { type: 'string', enum: ['retiredRule'] } }, required: ['reason'], additionalProperties: false },
      example: { params: { reason: 'retiredRule' } },
    }));
    expect(() => loadCatalog(withoutRuleId, validators)).toThrow('JDX-ENV-006: el término retiredRule de reason usa {ruleId}, que no está en params ni en context');
    // flag pide un dato booleano de params y un término con su nombre.
    const flagOn = (name: string) =>
      withRule('JDX-SHR-002', (r) => {
        const texts = r.message as Record<Lang, string>;
        const message = Object.fromEntries(LANGS.map((lang) => [lang, texts[lang].replace('{writer:flag}', `{${name}:flag}`)]));
        const schema = r.resultParamsSchema as { properties: object };
        return { ...r, message, resultParamsSchema: { ...schema, properties: { ...schema.properties, shared: { type: 'boolean', const: true } } } };
      });
    expect(() => loadCatalog(flagOn('cap'), validators)).toThrow('JDX-SHR-002: {cap:flag} pide un dato booleano de params');
    expect(() => loadCatalog(flagOn('shared'), validators)).toThrow('JDX-SHR-002: {shared:flag} no tiene término para shared');
    // phrase pide un término con el nombre del dato, con datos que la regla declara.
    const phraseOn = (name: string) =>
      withRule('JDX-VER-004', (r) => {
        const texts = r.message as Record<Lang, string>;
        return { ...r, message: Object.fromEntries(LANGS.map((lang) => [lang, texts[lang].replace('{scheme:phrase}', `{${name}:phrase}`)])) };
      });
    expect(() => loadCatalog(phraseOn('list'), validators)).toThrow('JDX-VER-004: {list:phrase} no tiene término para list');
  });

  it('an optional value renders in parentheses only when present', () => {
    const cls001 = rule('JDX-CLS-001');
    expect(formatMessage(cls001, 'es', { scheme: 'SADAIC_GENRE', code: '311', name: 'ZAMBA' }, { work: 'w1' })).toBe(
      'El código 311 (ZAMBA) no está en la lista de SADAIC_GENRE.',
    );
    expect(formatMessage(cls001, 'en', { scheme: 'SADAIC_ART8', code: 'promotionalDiscs' })).toBe('Code promotionalDiscs is not in the SADAIC_ART8 list.');
    // Un null o un texto vacío no dejan paréntesis vacíos.
    for (const name of [null, '']) {
      expect(formatMessage(cls001, 'es', { scheme: 'SADAIC_GENRE', code: '311', name })).toBe('El código 311 no está en la lista de SADAIC_GENRE.');
    }
  });

  it('a phrase renders, filled with the same data, only when its value is there', () => {
    const ver004 = rule('JDX-VER-004');
    expect(formatMessage(ver004, 'es', { list: 'identifierTypes', value: 'CUIT', scheme: 'NATIONAL_ID' })).toBe('El valor CUIT no está en la lista identifierTypes para el esquema NATIONAL_ID.');
    expect(formatMessage(ver004, 'pt', { list: 'identifierTypes', value: 'CUIT', scheme: 'NATIONAL_ID' })).toBe('O valor CUIT não está na lista identifierTypes para o esquema NATIONAL_ID.');
    expect(formatMessage(ver004, 'en', { list: 'identifierTypes', value: 'CUIT', scheme: 'NATIONAL_ID' })).toBe('Value CUIT is not in list identifierTypes for scheme NATIONAL_ID.');
    for (const scheme of [undefined, null, '']) {
      expect(formatMessage(ver004, 'es', { list: 'roles', value: 'zz', ...(scheme === undefined ? {} : { scheme }) })).toBe('El valor zz no está en la lista roles.');
    }
  });

  it('formatMessage never throws: a language without a template renders in Spanish, and odd data renders empty', () => {
    for (const r of catalog.rules) {
      const es = formatMessage(r, 'es', r.example.params, r.example.context);
      for (const lang of ['fr', '', 'ES', 'toString', '__proto__'] as unknown as Lang[]) {
        const text = formatMessage(r, lang, r.example.params, r.example.context);
        expect(text, `${r.id} ${String(lang)}`).toBe(es);
        expect(text, `${r.id} ${String(lang)}`).not.toContain('undefined');
      }
    }
    const agr003 = rule('JDX-AGR-003');
    // Params y context que no son objetos cuentan como ausentes.
    expect(formatMessage(agr003, 'es', null as never, 'a1' as never)).toBe('El contrato da a la editora el  %; el tope es  %.');
    // Un valor circular, una regla sin mensajes o ninguna regla no lanzan.
    const cyclic: JsonValue[] = [];
    cyclic.push(cyclic);
    const ref003 = rule('JDX-REF-003');
    expect(() => formatMessage(ref003, 'en', { value: 'm2', found: 'audio', expected: cyclic })).not.toThrow();
    expect(formatMessage(ref003, 'en', { value: 'm2', found: 'audio', expected: cyclic })).not.toMatch(/[{}]|undefined/u);
    expect(formatMessage({ ...agr003, message: undefined } as unknown as CatalogRule, 'es')).toBe('');
    expect(formatMessage(null as unknown as CatalogRule, 'pt')).toBe('');
  });

  it('messagePlaceholders lists names and formatters in order', () => {
    expect(messagePlaceholders('suman {sum} en {right:right} en {country}{countries:others}; el contrato da {expected}.')).toEqual([
      { name: 'sum' },
      { name: 'right', formatter: 'right' },
      { name: 'country' },
      { name: 'countries', formatter: 'others' },
      { name: 'expected' },
    ]);
    expect(messagePlaceholders('El $schema no corresponde a {jdx}: {} y { x } no son placeholders.')).toEqual([{ name: 'jdx' }]);
  });
});
