/**
 * Mensajes del catálogo en es, pt y en. Cada regla trae una plantilla por
 * idioma, con placeholders que se llenan con los params y el context de un
 * resultado:
 *
 * - `{name}`: el valor de `params.name` o, si no está, de `context.name`. Un
 *   número va con coma decimal en es y pt (37,5) y con punto en en; una lista,
 *   con sus elementos separados por coma; un valor que falta queda vacío.
 * - `{name:right}`, `{name:part}`, `{name:field}`, `{name:reason}`: el término
 *   del valor en el idioma (MESSAGE_TERMS): el derecho, la parte de la obra, el
 *   dato que falta o la razón. Una razón puede llevar a su vez placeholders,
 *   que se llenan con los mismos params. Un valor sin término (un código nuevo)
 *   se muestra tal cual.
 * - `{name:others}`: un recuento de países, como el resto de los que fallan:
 *   nada con uno, "y otro país" con dos, "y otros N países" con más.
 * - `{name:paren}`: un dato opcional entre paréntesis, precedido de un espacio;
 *   nada si falta, es null o queda vacío.
 *
 * El texto de un resultado sirve para leerlo; se decide por `ruleId` y
 * `params`, nunca por el mensaje. loadCatalog controla al cargar que cada
 * placeholder esté declarado y que cada valor tenga su término.
 */
import type { CatalogRule, FindingContext, JsonValue, Lang } from '../types.js';

export type TermFormatter = 'right' | 'part' | 'field' | 'reason';
export type Formatter = TermFormatter | 'others' | 'paren';
export const FORMATTERS: readonly Formatter[] = Object.freeze(['right', 'part', 'field', 'reason', 'others', 'paren']);

type Terms = Readonly<Record<string, Readonly<Record<Lang, string>>>>;
const LANGS: readonly Lang[] = Object.freeze(['es', 'pt', 'en']);
const t = (es: string, pt: string, en: string): Readonly<Record<Lang, string>> => Object.freeze({ es, pt, en });

/**
 * Los términos de cada formateador, por valor. Las razones completan una frase
 * cuyo sujeto pone la plantilla ("La firma …", "El estado del receptor …"):
 * un mismo valor sirve a todas las reglas que lo usan.
 */
export const MESSAGE_TERMS: Readonly<Record<TermFormatter, Terms>> = Object.freeze({
  right: Object.freeze({
    performing: t('ejecución', 'execução', 'performing'),
    mechanical: t('reproducción mecánica', 'reprodução mecânica', 'mechanical'),
    synchronization: t('sincronización', 'sincronização', 'synchronization'),
    print: t('impresión', 'impressão', 'print'),
  }),
  part: Object.freeze({
    music: t('música', 'música', 'music'),
    lyrics: t('letra', 'letra', 'lyrics'),
  }),
  field: Object.freeze({
    signatureDate: t('la fecha de firma (signatureDate)', 'a data de assinatura (signatureDate)', 'signature date (signatureDate)'),
    territories: t('el territorio (territories)', 'o território (territories)', 'territories'),
    term: t('el plazo (term)', 'o prazo (term)', 'term'),
    grantor: t('quien concede los derechos (grantor)', 'quem concede os direitos (grantor)', 'grantor'),
    grantee: t('quien los recibe (grantee)', 'quem os recebe (grantee)', 'grantee'),
    coWriter: t('el segundo coautor (coWriter)', 'o segundo coautor (coWriter)', 'second co-writer (coWriter)'),
    via: t('a quién representa (via)', 'quem representa (via)', 'via'),
    agreement: t('el contrato (agreement)', 'o contrato (agreement)', 'agreement'),
    size: t('el tamaño (size)', 'o tamanho (size)', 'size'),
    sha256: t('el sha256', 'o sha256', 'sha256'),
    path: t('la ruta (path)', 'o caminho (path)', 'path'),
    delivery: t('la entrega en que viajó (delivery)', 'a entrega em que viajou (delivery)', 'delivery'),
    publicationDate: t('la fecha de publicación (publicationDate)', 'a data de publicação (publicationDate)', 'publication date (publicationDate)'),
    legalDepositCopy: t('el ejemplar del depósito legal (legalDepositCopy)', 'o exemplar do depósito legal (legalDepositCopy)', 'legal deposit copy (legalDepositCopy)'),
    registration: t('la inscripción como obra publicada', 'o registro como obra publicada', 'registration as a published work'),
    retailPricePercent: t('regalía sobre el precio de venta', 'royalty sobre o preço de venda', 'retail price royalty'),
    arrangementRetailPricePercent: t('regalía de orquestaciones y transcripciones', 'royalty de orquestrações e transcrições', 'arrangement royalty'),
  }),
  reason: Object.freeze({
    // Opciones y lista de confianza
    missing: t('falta', 'está faltando', 'is missing'),
    invalid: t('no es válida', 'não é válida', 'is not valid'),
    unknown: t('no existe', 'não existe', 'does not exist'),
    requiresValidator: t('el perfil pide {required}', 'o perfil pede {required}', 'the profile requires {required}'),
    minVersion: t('la lista de confianza pide {required}', 'a lista de confiança pede {required}', 'the trust list requires {required}'),
    // Estado del receptor
    unreadable: t('no se puede leer', 'não pode ser lido', 'cannot be read'),
    version: t('es de otra versión', 'é de outra versão', 'is from another version'),
    env: t('es de otro entorno', 'é de outro ambiente', 'is from another environment'),
    locked: t('está bloqueado desde {lockedSince}', 'está bloqueado desde {lockedSince}', 'has been locked since {lockedSince}'),
    // Perfil
    unknownProfile: t('el validador no trae {profile}', 'o validador não traz {profile}', 'the validator does not bundle {profile}'),
    invalidProfile: t('no cumple el schema de los perfiles', 'não cumpre o schema dos perfis', 'it does not conform to the profile schema'),
    unknownCatalog: t('pide el catálogo {catalog}, que el validador no trae', 'pede o catálogo {catalog}, que o validador não traz', 'it asks for catalog {catalog}, which the validator does not bundle'),
    unknownRule: t('la regla {ruleId} no está en el catálogo', 'a regra {ruleId} não está no catálogo', 'rule {ruleId} is not in the catalog'),
    retiredRule: t('la regla {ruleId} está retirada', 'a regra {ruleId} está retirada', 'rule {ruleId} is retired'),
    notImplemented: t('el validador no implementa la regla {ruleId}', 'o validador não implementa a regra {ruleId}', 'the validator does not implement rule {ruleId}'),
    notProfileRule: t('la regla {ruleId} no es de perfil', 'a regra {ruleId} não é de perfil', 'rule {ruleId} is not a profile rule'),
    invalidParams: t('los parámetros de {ruleId} no cumplen su schema', 'os parâmetros de {ruleId} não cumprem seu schema', 'the parameters of {ruleId} do not conform to its schema'),
    duplicateRule: t('la regla {ruleId} está repetida', 'a regra {ruleId} está repetida', 'rule {ruleId} is listed twice'),
    jdxNotAdmitted: t('no admite la versión {jdx} del documento', 'não admite a versão {jdx} do documento', 'it does not admit document version {jdx}'),
    // JSON
    bom: t('empieza con BOM', 'começa com BOM', 'it starts with a BOM'),
    utf8: t('no es UTF-8 válido', 'não é UTF-8 válido', 'it is not valid UTF-8'),
    syntax: t('tiene un error de sintaxis', 'tem um erro de sintaxe', 'it has a syntax error'),
    duplicateKey: t('repite una clave', 'repete uma chave', 'it repeats a key'),
    loneSurrogate: t('tiene un surrogate suelto', 'tem um surrogate solto', 'it has a lone surrogate'),
    integerRange: t('tiene un número fuera de ±(2^53 − 1)', 'tem um número fora de ±(2^53 − 1)', 'it has a number beyond ±(2^53 − 1)'),
    numberRange: t('tiene un número que no entra en un double', 'tem um número que não cabe em um double', 'it has a number that does not fit a double'),
    empty: t('está vacío', 'está vazio', 'it is empty'),
    depth: t('anida más de 64 niveles', 'aninha mais de 64 níveis', 'it nests more than 64 levels'),
    // Rutas y archivos
    absolute: t('es absoluta', 'é absoluto', 'is absolute'),
    segment: t('tiene un segmento vacío, «.» o «..»', 'tem um segmento vazio, «.» ou «..»', 'has an empty, "." or ".." segment'),
    characters: t('usa caracteres fuera de A-Z, a-z, 0-9, punto, guion y guion bajo', 'usa caracteres fora de A-Z, a-z, 0-9, ponto, hífen e sublinhado', 'uses characters outside A-Z, a-z, 0-9, dot, hyphen and underscore'),
    duplicate: t('repite otra sin distinguir mayúsculas', 'repete outro sem distinguir maiúsculas', 'repeats another one regardless of case'),
    changed: t('no coincide con el que se recibió', 'não confere com o recebido', 'does not match the one received'),
    notFound: t('no está ni en el estado ni en la entrega', 'não está nem no estado nem na entrega', 'is neither in the state nor in the delivery'),
    // Firma y clave
    signature: t('no verifica', 'não confere', 'does not verify'),
    header: t('tiene un encabezado que no cumple con JDX', 'tem um cabeçalho que não cumpre o JDX', 'has a header that does not meet JDX'),
    alg: t('no usa ES256', 'não usa ES256', 'does not use ES256'),
    payload: t('no corresponde a este archivo', 'não corresponde a este arquivo', 'does not match this file'),
    aud: t('no está dirigida a la sociedad del perfil', 'não está dirigida à sociedade do perfil', "is not addressed to the profile's society"),
    audience: t('no tiene los mismos destinatarios que la declaración', 'não tem os mesmos destinatários da declaração', "does not have the declaration's recipients"),
    unknownKey: t('no está en la lista de confianza', 'não está na lista de confiança', 'is not in the trust list'),
    pending: t('todavía no está activa', 'ainda não está ativa', 'is not active yet'),
    retired: t('está retirada', 'está retirada', 'is retired'),
    expired: t('estaba vencida al recibir el archivo', 'estava vencida ao receber o arquivo', 'had expired when the file was received'),
    compromised: t('fue revocada', 'foi revogada', 'was revoked'),
    issuer: t('es de otro emisor', 'é de outro emissor', 'belongs to another issuer'),
    scope: t('no cubre esta declaración', 'não cobre esta declaração', 'does not cover this declaration'),
    createdAt: t('no es el createdAt de la declaración', 'não é o createdAt da declaração', "is not the declaration's createdAt"),
    receivedAt: t('es más de 5 minutos posterior a la recepción', 'é mais de 5 minutos posterior ao recebimento', 'is more than 5 minutes after receipt'),
    // Referencias
    reciprocal: t('no tiene su referencia de vuelta', 'não tem sua referência de volta', 'has no reference back'),
    agreementWorks: t('es a un contrato que no incluye la obra', 'é a um contrato que não inclui a obra', 'points to an agreement that does not cover the work'),
  }),
});

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
  return template.replace(PLACEHOLDER, (_match, name: string, formatter: string | undefined) => {
    const value = valueOf(name);
    if (formatter === undefined || !terms) return text(value, lang);
    if (formatter === 'others') return others(value, lang);
    if (formatter === 'paren') {
      const shown = text(value, lang);
      return shown === '' ? '' : ` (${shown})`;
    }
    const term = typeof value === 'string' || typeof value === 'number' ? termOf(formatter as TermFormatter, String(value), lang) : undefined;
    // La frase de un término se llena con los mismos datos, sin otro nivel de términos.
    return term === undefined ? text(value, lang) : fill(term, lang, valueOf, false);
  });
}

/** El término de un valor, o undefined si no tiene. */
export function termOf(formatter: TermFormatter, value: string, lang: Lang): string | undefined {
  const terms = MESSAGE_TERMS[formatter] as Terms | undefined;
  return terms !== undefined && Object.hasOwn(terms, value) ? terms[value]?.[lang] : undefined;
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
  if (rest === 1) return { es: ' y otro país', pt: ' e outro país', en: ' and one other country' }[lang];
  return { es: ` y otros ${rest} países`, pt: ` e outros ${rest} países`, en: ` and ${rest} other countries` }[lang];
}
