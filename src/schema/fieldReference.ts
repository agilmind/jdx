/**
 * docs/campos.md y docs/en/campos.md: la referencia de campos, generada del
 * modelo de tipos (schema/src/types.json y su overlay) por `npm run gen`, así
 * nunca se aparta de los schemas. Una tabla por tipo, agrupada por `group`,
 * con el tipo o formato de cada campo, si es requerido (o la condición del
 * overlay), sus valores y su descripción.
 *
 * En español, las descripciones son las de types.json; en inglés, las de
 * `translations` del overlay (`en`), que trae una por tipo y por campo.
 */
import { PATTERNS } from '../conventions/patterns.js';
import type { Condition, Constraint, PatternName, ScalarName, TypeRef, TypesModel } from '../types.js';

export type FieldReferenceLang = 'es' | 'en';

/** La ruta de la referencia de campos en cada idioma. */
export const FIELD_REFERENCE_PATHS: Readonly<Record<FieldReferenceLang, string>> = Object.freeze({
  es: 'docs/campos.md',
  en: 'docs/en/campos.md',
});

type Format = readonly [name: string, rule: string, pattern: PatternName | null, example: string];

/** Los textos de la referencia en un idioma. */
interface Texts {
  /** Nombre de cada escalar en singular y en plural, para la columna de tipo. */
  scalars: Readonly<Record<ScalarName, readonly [string, string]>>;
  /** La tabla de formatos: nombre, regla, patrón (si lo hay) y ejemplo. */
  formats: readonly Format[];
  /** Los nombres de los grupos de types.json; `null` los deja como están. */
  groups: Readonly<Record<string, string>> | null;
  header: readonly string[];
  index: string;
  formatsHeading: string;
  formatsTable: string;
  fieldsTable: string;
  usedIn: string;
  or: string;
  and: string;
  nor: string;
  is: string;
  if: string;
  yes: string;
  no: string;
  atLeastOneOf: string;
  exactlyOneOf: string;
  forbidden: string;
  otherwiseForbidden: string;
  listOf: string;
  atLeastOne: string;
  idOf: string;
  idsOf: string;
  list: string;
  closed: string;
  open: string;
  noValues: string;
  has: string;
  hasNo: string;
  eachItem: string;
  personalData: string;
  personalDataIf: string;
  extensions: string;
  /** La carpeta values/ vista desde la referencia. */
  values: string;
}

const ES: Texts = {
  scalars: {
    text: ['texto', 'textos'],
    boolean: ['booleano', 'booleanos'],
    integer: ['entero', 'enteros'],
    'integer>=0': ['entero ≥ 0', 'enteros ≥ 0'],
    'integer>=1': ['entero ≥ 1', 'enteros ≥ 1'],
    year: ['año', 'años'],
    percent: ['porcentaje', 'porcentajes'],
    instant: ['instante', 'instantes'],
    date: ['fecha', 'fechas'],
    duration: ['duración', 'duraciones'],
    amount: ['importe', 'importes'],
    currency: ['moneda', 'monedas'],
    sha256: ['sha256', 'sha256'],
    uuid: ['uuid', 'uuid'],
    localId: ['id local', 'ids locales'],
    issuerId: ['id de emisor', 'ids de emisor'],
    kid: ['kid', 'kid'],
    country: ['país', 'países'],
    subdivision: ['subdivisión', 'subdivisiones'],
    tis: ['territorio TIS', 'territorios TIS'],
    society: ['sociedad', 'sociedades'],
    language: ['idioma', 'idiomas'],
    url: ['url', 'urls'],
    uri: ['uri', 'uris'],
    email: ['email', 'emails'],
    phone: ['teléfono', 'teléfonos'],
    mediaType: ['tipo de medio', 'tipos de medio'],
    fraction: ['fracción', 'fracciones'],
    schemaVersion: ['versión', 'versiones'],
  },
  formats: [
    ['instante', 'RFC 3339 con zona horaria; fracción opcional', 'instant', '`2026-09-12T15:40:00-03:00`'],
    ['fecha', '`AAAA-MM-DD`, una fecha que existe', 'date', '`2026-09-12`'],
    ['año', 'Entero de 1000 a 9999', null, '`2026`'],
    ['duración', 'ISO 8601, sin semanas ni fracciones', 'duration', '`PT3M25S`, `P10Y`'],
    ['porcentaje', 'Número de 0 a 100, hasta 4 decimales, sin exponente', 'percent', '`33.3333`'],
    ['importe', 'Texto decimal, hasta 4 decimales', 'amount', '`"1500.00"`'],
    ['moneda', 'ISO 4217', 'currency', '`ARS`'],
    ['sha256', 'SHA-256 en hexadecimal minúscula', 'sha256', '`5052e13d…a5a6fd2c3` (64 caracteres)'],
    ['uuid', 'En minúscula, con guiones', 'uuid', '`3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13`'],
    ['id local', 'Único en todo el archivo', 'localId', '`p1`, `w1`, `a1`, `m1`'],
    ['id de emisor', 'Como un id local', 'issuerId', '`jupiter`'],
    ['kid', 'Huella RFC 7638 de una clave, en base64url', 'kid', '`3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E`'],
    ['país', 'ISO 3166-1 alfa-2', 'country', '`AR`'],
    ['subdivisión', 'ISO 3166-2', 'subdivision', '`AR-B`'],
    ['territorio TIS', 'Código TIS de CISAC, 4 dígitos, como texto', 'tis', '`2136` (el mundo), `0032` (Argentina)'],
    ['sociedad', 'Código CISAC de 3 dígitos, o de la lista de sociedades de JDX', 'society', '`061`, `X_JDX_AADI`'],
    ['idioma', 'BCP 47', 'language', '`es`, `pt-BR`'],
    ['url', 'HTTP o HTTPS', 'url', '`https://open.spotify.com/track/…`'],
    ['uri', 'HTTPS', 'uri', '`https://jdx.jupiter.ar/profiles/sadaic/0.1`'],
    ['email', 'Una dirección', 'email', '`ana@example.com`'],
    ['teléfono', 'E.164', 'phone', '`+5491155550000`'],
    ['tipo de medio', 'RFC 6838', 'mediaType', '`application/pdf`'],
    ['fracción', 'Entero/entero', 'fraction', '`1/3`'],
    ['versión', '`M.m`', 'schemaVersion', '`1.0`'],
    ['valor de lista abierta', 'lowerCamelCase, o propio con prefijo `X_`', 'enumValue', '`originalPublisher`, `X_MI_VALOR`'],
    ['esquema', 'UPPER_SNAKE_CASE (esquemas, registros, tipos de identificador)', 'schemeValue', '`SADAIC_GENRE`'],
    ['clave de extensión', 'Dominio invertido', 'extensionKey', '`ar.example.dato`'],
  ],
  groups: null,
  header: [
    '# Referencia de campos de JDX {jdx}',
    '',
    '<!-- Generado por `npm run gen` desde schema/src/types.json y schema/src/types.overlay.json. No editar a mano. -->',
    '',
    'Cada tipo de objeto del documento, con sus campos. La [guía](guia.md) explica cómo se usan juntos.',
    '',
    '- **Requerido:** `sí`, `no` o la condición en que el campo es requerido o está prohibido.',
    '- **Listas:** una lista cerrada admite solo sus valores. Una abierta admite los de su archivo en `values/` y valores propios con prefijo `X_` (por ejemplo, `X_MI_SOCIEDAD_CODIGO`).',
    '- **Referencias:** "id de `parties`" es el `id` de un elemento de esa lista del mismo archivo.',
    '- **Ausencia:** lo que no se sabe se omite; ningún campo admite `null`.',
    '- **Datos personales:** la descripción los marca.',
  ],
  index: 'Índice',
  formatsHeading: 'Formatos',
  formatsTable: '| Formato | Regla | Patrón | Ejemplo |',
  fieldsTable: '| Campo | Tipo | Requerido | Descripción |',
  usedIn: 'Se usa en',
  or: 'o',
  and: 'y',
  nor: 'ni',
  is: 'es',
  if: 'si',
  yes: 'sí',
  no: 'no',
  atLeastOneOf: 'al menos uno de',
  exactlyOneOf: 'exactamente uno de',
  forbidden: 'prohibido',
  otherwiseForbidden: 'si no, prohibido',
  listOf: 'lista de',
  atLeastOne: 'al menos uno',
  idOf: 'id de',
  idsOf: 'ids de',
  list: 'lista',
  closed: 'cerrada',
  open: 'abierta',
  noValues: 'sin valores todavía',
  has: 'lleva',
  hasNo: 'no lleva',
  eachItem: 'cada elemento',
  personalData: 'Dato personal.',
  personalDataIf: 'El objeto es dato personal',
  extensions: '| `extensions` | objeto | no | Datos que el schema no prevé, con claves de dominio invertido (`ar.example.dato`). |',
  values: '../values',
};

const EN: Texts = {
  scalars: {
    text: ['text', 'texts'],
    boolean: ['boolean', 'booleans'],
    integer: ['integer', 'integers'],
    'integer>=0': ['integer ≥ 0', 'integers ≥ 0'],
    'integer>=1': ['integer ≥ 1', 'integers ≥ 1'],
    year: ['year', 'years'],
    percent: ['percentage', 'percentages'],
    instant: ['instant', 'instants'],
    date: ['date', 'dates'],
    duration: ['duration', 'durations'],
    amount: ['amount', 'amounts'],
    currency: ['currency', 'currencies'],
    sha256: ['sha256', 'sha256'],
    uuid: ['uuid', 'uuid'],
    localId: ['local id', 'local ids'],
    issuerId: ['issuer id', 'issuer ids'],
    kid: ['kid', 'kid'],
    country: ['country', 'countries'],
    subdivision: ['subdivision', 'subdivisions'],
    tis: ['TIS territory', 'TIS territories'],
    society: ['society', 'societies'],
    language: ['language', 'languages'],
    url: ['url', 'urls'],
    uri: ['uri', 'uris'],
    email: ['email', 'emails'],
    phone: ['phone', 'phones'],
    mediaType: ['media type', 'media types'],
    fraction: ['fraction', 'fractions'],
    schemaVersion: ['version', 'versions'],
  },
  formats: [
    ['instant', 'RFC 3339 with time zone; optional fraction', 'instant', '`2026-09-12T15:40:00-03:00`'],
    ['date', '`YYYY-MM-DD`, a date that exists', 'date', '`2026-09-12`'],
    ['year', 'Integer from 1000 to 9999', null, '`2026`'],
    ['duration', 'ISO 8601, without weeks or fractions', 'duration', '`PT3M25S`, `P10Y`'],
    ['percentage', 'Number from 0 to 100, up to 4 decimals, without exponent', 'percent', '`33.3333`'],
    ['amount', 'Decimal text, up to 4 decimals', 'amount', '`"1500.00"`'],
    ['currency', 'ISO 4217', 'currency', '`ARS`'],
    ['sha256', 'SHA-256 in lowercase hexadecimal', 'sha256', '`5052e13d…a5a6fd2c3` (64 characters)'],
    ['uuid', 'Lowercase, with hyphens', 'uuid', '`3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13`'],
    ['local id', 'Unique in the whole file', 'localId', '`p1`, `w1`, `a1`, `m1`'],
    ['issuer id', 'Like a local id', 'issuerId', '`jupiter`'],
    ['kid', 'RFC 7638 thumbprint of a key, in base64url', 'kid', '`3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E`'],
    ['country', 'ISO 3166-1 alpha-2', 'country', '`AR`'],
    ['subdivision', 'ISO 3166-2', 'subdivision', '`AR-B`'],
    ['TIS territory', 'CISAC TIS code, 4 digits, as text', 'tis', '`2136` (the World), `0032` (Argentina)'],
    ['society', 'CISAC code of 3 digits, or one of the JDX society list', 'society', '`061`, `X_JDX_AADI`'],
    ['language', 'BCP 47', 'language', '`es`, `pt-BR`'],
    ['url', 'HTTP or HTTPS', 'url', '`https://open.spotify.com/track/…`'],
    ['uri', 'HTTPS', 'uri', '`https://jdx.jupiter.ar/profiles/sadaic/0.1`'],
    ['email', 'An address', 'email', '`ana@example.com`'],
    ['phone', 'E.164', 'phone', '`+5491155550000`'],
    ['media type', 'RFC 6838', 'mediaType', '`application/pdf`'],
    ['fraction', 'Integer/integer', 'fraction', '`1/3`'],
    ['version', '`M.m`', 'schemaVersion', '`1.0`'],
    ['open list value', 'lowerCamelCase, or an own value with the prefix `X_`', 'enumValue', '`originalPublisher`, `X_MY_VALUE`'],
    ['scheme', 'UPPER_SNAKE_CASE (schemes, registries, identifier types)', 'schemeValue', '`SADAIC_GENRE`'],
    ['extension key', 'Reverse domain', 'extensionKey', '`ar.example.dato`'],
  ],
  groups: {
    'Raíz y declaración': 'Root and declaration',
    'Tipos comunes': 'Common types',
    Personas: 'Parties',
    Obras: 'Works',
    Derechos: 'Rights',
    Grabaciones: 'Recordings',
    Contratos: 'Agreements',
    Edición: 'Edition',
    Archivos: 'Media and evidence',
  },
  header: [
    '# JDX {jdx} field reference',
    '',
    '<!-- Generated by `npm run gen` from schema/src/types.json and schema/src/types.overlay.json. Do not edit by hand. -->',
    '',
    'Each object type of the document, with its fields, translated from the [Spanish reference](../campos.md). The [guide](../guia.md), in Spanish, explains how they are used together.',
    '',
    '- **Required:** `yes`, `no` or the condition under which the field is required or not allowed.',
    '- **Lists:** a closed list admits only its values. An open list admits those of its file in `values/` and own values with the prefix `X_` (for example, `X_MY_SOCIETY_CODE`).',
    '- **References:** "id of `parties`" is the `id` of an element of that list in the same file.',
    '- **Absence:** what is not known is omitted; no field admits `null`.',
    '- **Personal data:** the description marks it.',
  ],
  index: 'Index',
  formatsHeading: 'Formats',
  formatsTable: '| Format | Rule | Pattern | Example |',
  fieldsTable: '| Field | Type | Required | Description |',
  usedIn: 'Used in',
  or: 'or',
  and: 'and',
  nor: 'or',
  is: 'is',
  if: 'if',
  yes: 'yes',
  no: 'no',
  atLeastOneOf: 'at least one of',
  exactlyOneOf: 'exactly one of',
  forbidden: 'not allowed',
  otherwiseForbidden: 'otherwise not allowed',
  listOf: 'list of',
  atLeastOne: 'at least one',
  idOf: 'id of',
  idsOf: 'ids of',
  list: 'list',
  closed: 'closed',
  open: 'open',
  noValues: 'no values yet',
  has: 'has',
  hasNo: 'has no',
  eachItem: 'each item',
  personalData: 'Personal data.',
  personalDataIf: 'The object is personal data',
  extensions: '| `extensions` | object | no | Data that the schema does not provide for, with reverse-domain keys (`ar.example.dato`). |',
  values: '../../values',
};

const TEXTS: Readonly<Record<FieldReferenceLang, Texts>> = { es: ES, en: EN };

/** Texto para una celda de tabla Markdown: `|` escapado y sin saltos de línea. */
function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const code = (value: string): string => `\`${value}\``;
const anchor = (typeName: string): string => `#${typeName.toLowerCase()}`;
const typeLink = (typeName: string): string => `[${code(typeName)}](${anchor(typeName)})`;
const capitalize = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** `a, b y c` (o la palabra que se pase). */
function joinWith(values: readonly string[], word: string): string {
  return values.length <= 1 ? (values[0] ?? '') : `${values.slice(0, -1).join(', ')} ${word} ${values.at(-1)}`;
}

/** Lo que depende del idioma: textos, descripciones y grupos. */
class Writer {
  constructor(
    private readonly model: TypesModel,
    private readonly t: Texts,
    private readonly lang: FieldReferenceLang,
  ) {}

  /** `si \`a.b\` es \`x\` o \`y\``. */
  condition(when: Condition): string {
    return `${this.t.if} ${code(when.path)} ${this.t.is} ${joinWith(when.in.map(code), this.t.or)}`;
  }

  /** Los valores de una lista: cerrada o abierta, con el enlace a su archivo de valores. */
  values(leaf: TypeRef): string | null {
    if ('closed' in leaf) return `${this.t.closed}: ${leaf.closed.map(code).join(', ')}`;
    if ('open' in leaf) {
      const initial = this.model.source.openLists[leaf.open]?.initial ?? [];
      const open = `[${this.t.open}](${this.t.values}/${leaf.open}.json)`;
      return initial.length > 0 ? `${open}: ${initial.map(code).join(', ')}` : `${open}, ${this.t.noValues}`;
    }
    return null;
  }

  /** La columna de tipo. */
  type(ref: TypeRef): string {
    const { t } = this;
    const refTypes = (types: readonly string[] | undefined): string => (types === undefined ? '' : ` (${types.map(code).join(', ')})`);
    if ('array' in ref) {
      const item = ref.array;
      let text: string;
      if ('scalar' in item) text = `${t.listOf} ${t.scalars[item.scalar][1]}`;
      else if ('type' in item) text = `${t.listOf} ${typeLink(item.type)}`;
      else if ('ref' in item) text = `${t.listOf} ${t.idsOf} ${code(item.ref)}${refTypes(item.refTypes)}`;
      else if ('array' in item) text = `${t.listOf} ${this.type(item)}`;
      else text = `${t.list}, ${this.values(item) ?? ''}`;
      return ref.minItems === 1 ? `${text}, ${t.atLeastOne}` : text;
    }
    if ('scalar' in ref) return t.scalars[ref.scalar][0];
    if ('type' in ref) return typeLink(ref.type);
    if ('ref' in ref) return `${t.idOf} ${code(ref.ref)}${refTypes(ref.refTypes)}`;
    return this.values(ref) ?? '';
  }

  /** La columna de requerido: `sí`, `no` o lo que dicen las restricciones del overlay sobre el campo. */
  required(required: boolean, prop: string, constraints: readonly Constraint[]): string {
    const { t } = this;
    const positive: string[] = required ? [t.yes] : [];
    const negative: string[] = [];
    for (const c of constraints) {
      switch (c.kind) {
        case 'anyOfRequired':
          if (c.props.includes(prop)) positive.push(`${t.atLeastOneOf} ${joinWith(c.props.map(code), t.and)}`);
          break;
        case 'oneOfRequired':
          if (c.props.includes(prop)) positive.push(`${t.exactlyOneOf} ${joinWith(c.props.map(code), t.and)}`);
          break;
        case 'requiredIf':
          if (c.props.includes(prop)) positive.push(this.condition(c.when));
          break;
        case 'forbiddenIf':
          if (c.props.includes(prop)) negative.push(`${t.forbidden} ${this.condition(c.when)}`);
          break;
        case 'requiredIff':
          if (c.prop === prop) positive.push(`${this.condition(c.when)}; ${t.otherwiseForbidden}`);
          break;
        case 'itemsIf':
          break;
      }
    }
    if (positive.length === 0) positive.push(t.no);
    return [...positive, ...negative].join('; ');
  }

  /** Lo que el overlay agrega a la descripción: los requisitos sobre los elementos de una lista. */
  itemsNote(prop: string, constraints: readonly Constraint[]): string[] {
    const { t } = this;
    return constraints.flatMap((c) => {
      if (c.kind !== 'itemsIf' || c.items !== prop) return [];
      const parts = [
        ...(c.require.length > 0 ? [`${t.has} ${joinWith(c.require.map(code), t.and)}`] : []),
        ...(c.forbid.length > 0 ? [`${t.hasNo} ${joinWith(c.forbid.map(code), t.nor)}`] : []),
      ];
      return [`${capitalize(this.condition(c.when))}, ${t.eachItem} ${joinWith(parts, t.and)}.`];
    });
  }

  /** La descripción de un tipo (`Tipo`) o de un campo (`Tipo.prop`); fuera del español, la del overlay, que no puede faltar. */
  description(key: string, spanish: string): string {
    if (this.lang === 'es') return spanish;
    const text = this.model.overlay.translations[key]?.[this.lang];
    if (text === undefined || text.trim() === '') throw new Error(`referencia de campos (${this.lang}): falta la traducción de ${key}`);
    return text;
  }

  /** El nombre de un grupo de types.json en el idioma. */
  group(name: string): string {
    const translated = this.t.groups === null ? name : this.t.groups[name];
    if (translated === undefined) throw new Error(`referencia de campos (${this.lang}): falta la traducción del grupo ${name}`);
    return translated;
  }
}

/** El tipo de la hoja (sin listas). */
function leafOf(ref: TypeRef): TypeRef {
  return 'array' in ref ? leafOf(ref.array) : ref;
}

/** Dónde se usa cada tipo: `Tipo.campo` que lo tienen como hoja, en el orden de types.json. */
function usages(model: TypesModel): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const [typeName, type] of Object.entries(model.source.types)) {
    for (const [prop, spec] of Object.entries(type.props)) {
      const leaf = leafOf(spec.type);
      if ('type' in leaf) used.set(leaf.type, [...(used.get(leaf.type) ?? []), `[${code(`${typeName}.${prop}`)}](${anchor(typeName)})`]);
    }
  }
  return used;
}

/** El texto de la referencia de campos: docs/campos.md en español (por defecto) o docs/en/campos.md en inglés. */
export function generateFieldReference(model: TypesModel, lang: FieldReferenceLang = 'es'): string {
  const { source, overlay } = model;
  const t = TEXTS[lang];
  const w = new Writer(model, t, lang);
  const groups = new Map<string, string[]>();
  for (const [typeName, type] of Object.entries(source.types)) groups.set(type.group, [...(groups.get(type.group) ?? []), typeName]);
  const used = usages(model);

  const lines: string[] = [
    ...t.header.map((line) => line.replace('{jdx}', source.jdx)),
    '',
    `## ${t.index}`,
    '',
    ...[...groups].map(([group, names]) => `- **${w.group(group)}:** ${names.map(typeLink).join(', ')}`),
    '',
    `## ${t.formatsHeading}`,
    '',
    t.formatsTable,
    '|---|---|---|---|',
    ...t.formats.map(([name, rule, pattern, example]) => {
      const text = pattern === null ? '—' : code(PATTERNS[pattern].source.replaceAll('\\/', '/'));
      return `| ${name} | ${cell(rule)} | ${cell(text)} | ${cell(example)} |`;
    }),
  ];

  for (const [group, names] of groups) {
    lines.push('', `## ${w.group(group)}`);
    for (const typeName of names) {
      const type = source.types[typeName];
      if (type === undefined) continue;
      const constraints = overlay.constraints.filter((c) => c.type === typeName);
      const where = typeName === 'Document' ? '' : ` ${t.usedIn} ${joinWith(used.get(typeName) ?? [], t.and)}.`;
      lines.push('', `### ${code(typeName)}`, '', `${w.description(typeName, type.description)}${where}`, '', t.fieldsTable, '|---|---|---|---|');
      for (const [prop, spec] of Object.entries(type.props)) {
        const notes = [w.description(`${typeName}.${prop}`, spec.description), ...w.itemsNote(prop, constraints)];
        if (spec.personalData === true) {
          const when = overlay.personalDataWhen[`${typeName}.${prop}`];
          notes.push(when === undefined ? t.personalData : `${t.personalDataIf} ${w.condition(when)}.`);
        }
        lines.push(`| ${code(prop)} | ${cell(w.type(spec.type))} | ${cell(w.required(spec.required, prop, constraints))} | ${cell(notes.join(' '))} |`);
      }
      if (type.extensions) lines.push(t.extensions);
    }
  }
  return `${lines.join('\n')}\n`;
}
