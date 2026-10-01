/**
 * Guarda de redacción. Una sola definición de lo que se busca y de dónde:
 * - las descripciones generales de JDX (LICENSE, README, NOTICE, SECURITY,
 *   CONTRIBUTING y la `description` del paquete) hablan de las Sociedades de
 *   Gestión Colectiva (SGC) y no nombran a SADAIC; los identificadores técnicos
 *   del primer perfil (`sadaic/0.1`, `sadaic-genres`, `SADAIC_GENRE`) no
 *   cuentan como nombrarla;
 * - el sitio público (todo lo que hay bajo site/) no habla de licencias: cada
 *   página lleva una sola línea al pie, la de las condiciones de uso en
 *   GitHub; un schema publicado lleva su aviso (`$comment` y `x-jdx-license`),
 *   y ningún archivo del sitio es un texto de licencia o de avisos;
 * - un dato codificado (una clave, una huella, una firma) no es texto: las
 *   letras al azar de una firma no cuentan como una palabra buscada.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_COMMENT, SCHEMA_LICENSE } from '../../src/schema/notice.js';

export interface DescriptionText {
  source: string;
  text: string;
}

/**
 * Lo único con "licen" que puede aparecer en el sitio: los roles de productor
 * (`licensor`, `licensee`) y la figura de la Ley 25.506. La lista es cerrada: en portugués y
 * en inglés esa figura se escribe sin "licen" ("autoridade certificadora
 * credenciada", "accredited certification authority").
 */
const ALLOWED: readonly RegExp[] = [/\blicensor\b/gi, /\blicensee\b/gi, /\bcertificador\s+licenciado\b/gi];

/**
 * Cambia por un espacio cada dato codificado: una corrida de 40 o más
 * caracteres de base64 o base64url con al menos un dígito, una mayúscula y una
 * minúscula (una clave, una huella, una firma, un payload, un PEM). Las letras
 * al azar de esos datos pueden formar una palabra buscada; un identificador o
 * una ruta de ese largo casi nunca mezcla las tres clases, y sigue contando.
 */
export function blankEncodedData(text: string): string {
  return text.replace(/[A-Za-z0-9+/_-]{40,}/g, (run) => (/\d/.test(run) && /[A-Z]/.test(run) && /[a-z]/.test(run) ? ' ' : run));
}

/** Palabras con "licen" que quedan después de quitar los datos codificados y los tokens permitidos. */
export function licensingHits(text: string): string[] {
  let rest = blankEncodedData(text);
  for (const token of ALLOWED) rest = rest.replace(token, ' ');
  return [...rest.matchAll(/[\p{L}\p{N}_-]*licen[\p{L}\p{N}_-]*/giu)].map((m) => m[0]);
}

/** El texto de la única línea del sitio sobre condiciones de uso: el pie de cada página. */
export const SITE_FOOTER_TEXT = '© 2026 Agilmind SRL · Especificación, código y condiciones de uso en GitHub';
/** El único enlace del pie: el repositorio público. */
export const SITE_FOOTER_URL = 'https://github.com/agilmind/jdx';

/** Lo que habla de licencias o de condiciones de uso, además de las palabras con "licen" (es, pt, en). */
const TERMS: readonly RegExp[] = [
  /condiciones\s+de\s+uso/giu,
  /condições\s+de\s+uso/giu,
  /t[ée]rminos\s+de\s+uso/giu,
  /termos\s+de\s+uso/giu,
  /terms\s+of\s+(?:use|service)/giu,
  /\bspdx\b/giu,
  /\bcopyright\b/giu,
  /©|&copy;|&#169;|&#xa9;/giu,
  /derechos\s+reservados/giu,
  /direitos\s+reservados/giu,
  /rights\s+reserved/giu,
];

/** `licensingHits` más las menciones de condiciones de uso, avisos de copyright y SPDX. */
export function termsHits(text: string): string[] {
  const rest = blankEncodedData(text);
  return [...licensingHits(rest), ...TERMS.flatMap((term) => [...rest.matchAll(term)].map((m) => m[0]))];
}

/** Un archivo de licencia o de avisos por su nombre: LICENSE, LICENCE, LICENÇA, LICENCIA, COPYING, NOTICE, THIRD-PARTY-NOTICES. */
const LICENSE_FILE = /^(?:licen[cs]e|licen[cç]a|licencia|copying|notice|third-party-notices)(?:[.-]|$)/iu;

/** El texto de un fragmento de HTML: sin etiquetas, con las entidades del pie decodificadas y los espacios colapsados. */
function htmlText(html: string): string {
  return html
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&copy;|&#169;|&#xa9;/giu, '©')
    .replace(/&middot;|&#183;|&#xb7;/giu, '·')
    .replace(/&nbsp;|&#160;|&#xa0;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Lo que un archivo del sitio dice de licencias (`source` es su ruta desde la
 * raíz, con `/`), como `<ruta>: <qué>`; vacío si no dice nada:
 * - un archivo de licencia o de avisos, por su nombre: el sitio no los sirve;
 * - una página (`.html`): exactamente un `<footer>`, con el texto
 *   SITE_FOOTER_TEXT y un solo enlace, a SITE_FOOTER_URL; fuera del pie, nada
 *   sobre licencias ni condiciones de uso;
 * - un schema publicado (`.schema.json`): su `$comment` y su `x-jdx-license`,
 *   en la raíz y con esos valores exactos; nada más sobre licencias;
 * - cualquier otro archivo: nada sobre licencias ni condiciones de uso.
 */
export function siteFileHits(source: string, text: string): string[] {
  const name = source.slice(source.lastIndexOf('/') + 1);
  if (LICENSE_FILE.test(name)) return [`${source}: archivo de licencia o de avisos`];
  if (/\.html?$/iu.test(name)) {
    const hits: string[] = [];
    const footers = [...text.matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer\s*>/giu)];
    if (footers.length !== 1) hits.push(`${source}: ${footers.length} pies de página`);
    let rest = text;
    for (const [footer, inner = ''] of footers) {
      const shown = htmlText(inner);
      if (shown !== SITE_FOOTER_TEXT) hits.push(`${source}: pie "${shown}"`);
      const links = [...inner.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/giu)].map((m) => m[2]);
      if (links.length !== 1 || links[0] !== SITE_FOOTER_URL) hits.push(`${source}: el pie enlaza ${links.join(', ') || 'nada'}`);
      rest = rest.replace(footer, ' ');
    }
    return [...hits, ...termsHits(rest).map((hit) => `${source}: ${hit}`)];
  }
  if (name.endsWith('.schema.json')) {
    let schema: unknown;
    try {
      schema = JSON.parse(text);
    } catch {
      return [`${source}: no es JSON`];
    }
    if (typeof schema === 'object' && schema !== null && !Array.isArray(schema)) {
      const rest: Record<string, unknown> = { ...schema };
      if (rest.$comment === SCHEMA_COMMENT) delete rest.$comment;
      if (JSON.stringify(rest['x-jdx-license']) === JSON.stringify(SCHEMA_LICENSE)) delete rest['x-jdx-license'];
      return termsHits(JSON.stringify(rest)).map((hit) => `${source}: ${hit}`);
    }
  }
  return termsHits(text).map((hit) => `${source}: ${hit}`);
}

/** `siteFileHits` de cada archivo bajo site/, en orden de ruta; vacío si site/ no existe. */
export function siteHits(root: string): string[] {
  return siteTexts(root).flatMap((t) => siteFileHits(t.source, t.text));
}

/**
 * Cada vez que el texto nombra a SADAIC: la palabra entera, en cualquier
 * combinación de mayúsculas. No cuentan los identificadores técnicos del primer
 * perfil, una lista cerrada: el perfil (`sadaic/0.1`, `profiles/sadaic/0.1.0.json`),
 * su familia al final de una URI (`https://jdx.jupiter.ar/profiles/sadaic`, el
 * `scope.profiles` de una clave), las listas de valores (`sadaic-genres`,
 * `sadaic-art8`, `sadaic-contract`), la guía del perfil (`sadaic-0.1.md`), la
 * fuente de géneros (`sadaic-generos-2006.txt`) y la clave de extensión de
 * dominio invertido (`ar.sadaic.x`); en `SADAIC_GENRE` el `_` es parte de
 * la palabra. La familia y la clave de extensión se reconocen solo en
 * minúsculas, como se escriben. Otro `/` u otro `-` detrás sí la nombra
 * (`SADAIC/AADI`, `SADAIC-Argentina`, `profiles/sadaic/AADI`), y un dominio
 * también (`www.sadaic.org.ar`).
 */
export function sadaicHits(text: string): string[] {
  const rest = text.replace(/\bprofiles\/sadaic(?![\w/-])|\bar\.sadaic\.(?=[a-z0-9-])/gu, ' ');
  return [...rest.matchAll(/\bsadaic\b(?!\/\d|-(?:genres|art8|contract|generos-2006|\d+\.\d+)\b)/giu)].map((m) => m[0]);
}

/**
 * Las descripciones generales de JDX en un árbol con la forma del repo, las
 * que existan: LICENSE, README.md, NOTICE, SECURITY.md, CONTRIBUTING.md y la
 * `description` de package.json.
 */
export function generalDescriptions(root: string): DescriptionText[] {
  const out: DescriptionText[] = [];
  for (const rel of ['LICENSE', 'README.md', 'NOTICE', 'SECURITY.md', 'CONTRIBUTING.md']) {
    if (existsSync(join(root, rel))) out.push({ source: rel, text: readFileSync(join(root, rel), 'utf8') });
  }
  if (existsSync(join(root, 'package.json'))) {
    const description: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).description;
    if (typeof description === 'string') out.push({ source: 'package.json#description', text: description });
  }
  return out;
}

/** Todo archivo bajo site/ (rutas desde la raíz, con `/`, en orden); vacío si site/ no existe. */
export function siteTexts(root: string): DescriptionText[] {
  if (!existsSync(join(root, 'site'))) return [];
  return walk(root, 'site')
    .sort()
    .map((rel) => ({ source: rel, text: readFileSync(join(root, rel), 'utf8') }));
}

/** Archivos bajo `dir` (relativos a `root`, con `/`). */
function walk(root: string, dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...walk(root, rel));
    else if (entry.isFile()) files.push(rel);
  }
  return files;
}
