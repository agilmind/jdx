/**
 * docs/campos.md: la referencia de campos, generada del modelo de tipos
 * (schema/src/types.json y su overlay) por `npm run gen`, así nunca se aparta
 * de los schemas. Una tabla por tipo, agrupada por `group`, con el tipo o
 * formato de cada campo, si es requerido (o la condición del overlay), sus
 * valores y su descripción.
 */
import { PATTERNS } from '../conventions/patterns.js';
import type { Condition, Constraint, PatternName, ScalarName, TypeRef, TypesModel } from '../types.js';

/** Nombre de cada escalar en singular y en plural, para la columna de tipo. */
const SCALAR_NAMES: Readonly<Record<ScalarName, readonly [string, string]>> = {
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
};

/** La tabla de formatos: nombre, regla, patrón (si lo hay) y ejemplo. */
const FORMATS: readonly (readonly [string, string, PatternName | null, string])[] = [
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
];

/** Texto para una celda de tabla Markdown: `|` escapado y sin saltos de línea. */
function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const code = (value: string): string => `\`${value}\``;
const anchor = (typeName: string): string => `#${typeName.toLowerCase()}`;
const typeLink = (typeName: string): string => `[${code(typeName)}](${anchor(typeName)})`;
const valuesLink = (list: string): string => `../values/${list}.json`;

function joinOr(values: readonly string[]): string {
  return values.length <= 1 ? (values[0] ?? '') : `${values.slice(0, -1).join(', ')} o ${values.at(-1)}`;
}

function joinAnd(values: readonly string[]): string {
  return values.length <= 1 ? (values[0] ?? '') : `${values.slice(0, -1).join(', ')} y ${values.at(-1)}`;
}

/** `si \`a.b\` es \`x\` o \`y\``. */
function conditionText(when: Condition): string {
  return `si ${code(when.path)} es ${joinOr(when.in.map(code))}`;
}

/** Los valores de una lista: cerrada o abierta, con el enlace a su archivo de valores. */
function valuesText(model: TypesModel, leaf: TypeRef): string | null {
  if ('closed' in leaf) return `cerrada: ${leaf.closed.map(code).join(', ')}`;
  if ('open' in leaf) {
    const initial = model.source.openLists[leaf.open]?.initial ?? [];
    const open = `[abierta](${valuesLink(leaf.open)})`;
    return initial.length > 0 ? `${open}: ${initial.map(code).join(', ')}` : `${open}, sin valores todavía`;
  }
  return null;
}

/** La columna de tipo. */
function typeText(model: TypesModel, ref: TypeRef): string {
  if ('array' in ref) {
    const item = ref.array;
    let text: string;
    if ('scalar' in item) text = `lista de ${SCALAR_NAMES[item.scalar][1]}`;
    else if ('type' in item) text = `lista de ${typeLink(item.type)}`;
    else if ('ref' in item) text = `lista de ids de ${code(item.ref)}${item.refTypes === undefined ? '' : ` (${item.refTypes.map(code).join(', ')})`}`;
    else if ('array' in item) text = `lista de ${typeText(model, item)}`;
    else text = `lista, ${valuesText(model, item) ?? ''}`;
    return ref.minItems === 1 ? `${text}, al menos uno` : text;
  }
  if ('scalar' in ref) return SCALAR_NAMES[ref.scalar][0];
  if ('type' in ref) return typeLink(ref.type);
  if ('ref' in ref) return `id de ${code(ref.ref)}${ref.refTypes === undefined ? '' : ` (${ref.refTypes.map(code).join(', ')})`}`;
  return valuesText(model, ref) ?? '';
}

/** La columna de requerido: `sí`, `no` o lo que dicen las restricciones del overlay sobre el campo. */
function requiredText(required: boolean, prop: string, constraints: readonly Constraint[]): string {
  const positive: string[] = required ? ['sí'] : [];
  const negative: string[] = [];
  for (const c of constraints) {
    switch (c.kind) {
      case 'anyOfRequired':
        if (c.props.includes(prop)) positive.push(`al menos uno de ${joinAnd(c.props.map(code))}`);
        break;
      case 'oneOfRequired':
        if (c.props.includes(prop)) positive.push(`exactamente uno de ${joinAnd(c.props.map(code))}`);
        break;
      case 'requiredIf':
        if (c.props.includes(prop)) positive.push(conditionText(c.when));
        break;
      case 'forbiddenIf':
        if (c.props.includes(prop)) negative.push(`prohibido ${conditionText(c.when)}`);
        break;
      case 'requiredIff':
        if (c.prop === prop) positive.push(`${conditionText(c.when)}; si no, prohibido`);
        break;
      case 'itemsIf':
        break;
    }
  }
  if (positive.length === 0) positive.push('no');
  return [...positive, ...negative].join('; ');
}

/** Lo que el overlay agrega a la descripción: los requisitos sobre los elementos de una lista. */
function itemsNote(prop: string, constraints: readonly Constraint[]): string[] {
  return constraints.flatMap((c) => {
    if (c.kind !== 'itemsIf' || c.items !== prop) return [];
    const parts = [
      ...(c.require.length > 0 ? [`lleva ${joinAnd(c.require.map(code))}`] : []),
      ...(c.forbid.length > 0 ? [`no lleva ${joinOr(c.forbid.map(code)).replace(' o ', ' ni ')}`] : []),
    ];
    return [`S${conditionText(c.when).slice(1)}, cada elemento ${joinAnd(parts)}.`];
  });
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

/** El texto de docs/campos.md. */
export function generateFieldReference(model: TypesModel): string {
  const { source, overlay } = model;
  const groups = new Map<string, string[]>();
  for (const [typeName, type] of Object.entries(source.types)) groups.set(type.group, [...(groups.get(type.group) ?? []), typeName]);
  const used = usages(model);

  const lines: string[] = [
    `# Referencia de campos de JDX ${source.jdx}`,
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
    '',
    '## Índice',
    '',
    ...[...groups].map(([group, names]) => `- **${group}:** ${names.map(typeLink).join(', ')}`),
    '',
    '## Formatos',
    '',
    '| Formato | Regla | Patrón | Ejemplo |',
    '|---|---|---|---|',
    ...FORMATS.map(([name, rule, pattern, example]) => {
      const text = pattern === null ? '—' : code(PATTERNS[pattern].source.replaceAll('\\/', '/'));
      return `| ${name} | ${cell(rule)} | ${cell(text)} | ${cell(example)} |`;
    }),
  ];

  for (const [group, names] of groups) {
    lines.push('', `## ${group}`);
    for (const typeName of names) {
      const type = source.types[typeName];
      if (type === undefined) continue;
      const constraints = overlay.constraints.filter((c) => c.type === typeName);
      const where = typeName === 'Document' ? '' : ` Se usa en ${joinAnd(used.get(typeName) ?? [])}.`;
      lines.push('', `### ${code(typeName)}`, '', `${type.description}${where}`, '', '| Campo | Tipo | Requerido | Descripción |', '|---|---|---|---|');
      for (const [prop, spec] of Object.entries(type.props)) {
        const notes = [spec.description, ...itemsNote(prop, constraints)];
        if (spec.personalData === true) {
          const when = overlay.personalDataWhen[`${typeName}.${prop}`];
          notes.push(when === undefined ? 'Dato personal.' : `El objeto es dato personal ${conditionText(when)}.`);
        }
        lines.push(`| ${code(prop)} | ${cell(typeText(model, spec.type))} | ${cell(requiredText(spec.required, prop, constraints))} | ${cell(notes.join(' '))} |`);
      }
      if (type.extensions) {
        lines.push('| `extensions` | objeto | no | Datos que el schema no prevé, con claves de dominio invertido (`ar.example.dato`). |');
      }
    }
  }
  return `${lines.join('\n')}\n`;
}
