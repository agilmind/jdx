/**
 * Variantes del ejemplo por puntero, para los tests de reglas. Cada cambio
 * edita el texto en su lugar y deja el resto del archivo igual, byte a byte:
 * así un número se puede escribir de otra forma (`1E1`, `-0`, `100.0000`) y
 * el resultado se lee con el parser, como un archivo que llega.
 *
 * - set(puntero, valor): pone el valor (JSON.stringify) en el puntero: lo
 *   reemplaza si existe, y si no lo agrega al final de su objeto, o de su
 *   arreglo si el último segmento es el largo o `-`.
 * - setRaw(puntero, texto): lo mismo con el texto JSON tal cual.
 * - remove(puntero): saca el miembro o el elemento, con su coma.
 * - text, bytes() (UTF-8) y value() (JSON.parse) dan el resultado.
 *
 * Cada cambio da un builder nuevo y no toca el anterior. El padre del puntero
 * tiene que existir; si no, lanza.
 */
import { readFileSync } from 'node:fs';
import { pointerOf, segmentsOf } from '../../src/json/pointer.js';
import type { JsonPointer, JsonValue } from '../../src/types.js';

/** El nombre del ejemplo, `<declaration.id>.r<revision>.jdx.json`. */
export const EXAMPLE_NAME = '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json';

const EXAMPLE_TEXT = readFileSync(new URL(`../../docs/ejemplo/${EXAMPLE_NAME}`, import.meta.url), 'utf8');

/** El texto del ejemplo, tal como está en el repositorio. */
export function exampleText(): string {
  return EXAMPLE_TEXT;
}

export interface DocBuilder {
  readonly text: string;
  set(pointer: JsonPointer, value: JsonValue): DocBuilder;
  setRaw(pointer: JsonPointer, text: string): DocBuilder;
  remove(pointer: JsonPointer): DocBuilder;
  bytes(): Uint8Array;
  value(): JsonValue;
}

export function docBuilder(base: string = EXAMPLE_TEXT): DocBuilder {
  return {
    text: base,
    set: (pointer, value) => docBuilder(put(base, pointer, JSON.stringify(value))),
    setRaw: (pointer, text) => docBuilder(put(base, pointer, text)),
    remove: (pointer) => docBuilder(drop(base, pointer)),
    bytes: () => new TextEncoder().encode(base),
    value: () => JSON.parse(base) as JsonValue,
  };
}

/** Un miembro o un elemento de un contenedor: dónde empieza (su clave, en un objeto) y dónde está su valor. */
interface Child { key: string; start: number; valueStart: number; valueEnd: number }
interface Container { kind: 'object' | 'array'; open: number; children: Child[] }

function put(text: string, pointer: JsonPointer, raw: string): string {
  const { parent, last, child } = locate(text, pointer);
  if (child !== undefined) return splice(text, child.valueStart, child.valueEnd, raw);
  if (parent.kind === 'array' && last !== '-' && last !== String(parent.children.length)) {
    throw new Error(`docBuilder: ${pointer} no es el final de un arreglo de ${parent.children.length}`);
  }
  const previous = parent.children[parent.children.length - 1];
  const member = parent.kind === 'object' ? `${JSON.stringify(last)}: ${raw}` : raw;
  return previous === undefined ? splice(text, parent.open + 1, parent.open + 1, member) : splice(text, previous.valueEnd, previous.valueEnd, `, ${member}`);
}

function drop(text: string, pointer: JsonPointer): string {
  const { parent, child } = locate(text, pointer);
  if (child === undefined) throw new Error(`docBuilder: no existe ${pointer}`);
  const k = parent.children.indexOf(child);
  const previous = parent.children[k - 1];
  const next = parent.children[k + 1];
  if (previous !== undefined) return splice(text, previous.valueEnd, child.valueEnd, '');
  if (next !== undefined) return splice(text, child.start, next.start, '');
  return splice(text, child.start, child.valueEnd, '');
}

/** El contenedor padre del puntero, su último segmento y el hijo con ese segmento, si está. */
function locate(text: string, pointer: JsonPointer): { parent: Container; last: string; child: Child | undefined } {
  const segments = segmentsOf(pointer);
  const last = segments.pop();
  if (last === undefined) throw new Error('docBuilder: el documento entero no se cambia por puntero');
  let start = skipSpace(text, 0);
  segments.forEach((segment, i) => {
    const child = childOf(containerAt(text, start, pointer), segment);
    if (child === undefined) throw new Error(`docBuilder: no existe ${pointerOf(segments.slice(0, i + 1))}`);
    start = child.valueStart;
  });
  const parent = containerAt(text, start, pointer);
  return { parent, last, child: childOf(parent, last) };
}

function childOf(container: Container, segment: string): Child | undefined {
  if (container.kind === 'object') return container.children.find((c) => c.key === segment);
  return /^(?:0|[1-9]\d*)$/u.test(segment) ? container.children[Number(segment)] : undefined;
}

/** Los hijos directos del objeto o arreglo que empieza en `start`, sin entrar en los nietos. */
function containerAt(text: string, start: number, pointer: JsonPointer): Container {
  const open = text[start];
  if (open !== '{' && open !== '[') throw new Error(`docBuilder: ${pointer} no está dentro de un objeto ni de un arreglo`);
  const kind = open === '{' ? 'object' : 'array';
  const close = kind === 'object' ? '}' : ']';
  const children: Child[] = [];
  let i = skipSpace(text, start + 1);
  if (text[i] === close) return { kind, open: start, children };
  for (;;) {
    const childStart = i;
    let key = String(children.length);
    if (kind === 'object') {
      const keyEnd = skipString(text, i);
      key = JSON.parse(text.slice(i, keyEnd)) as string;
      i = skipSpace(text, keyEnd);
      if (text[i] !== ':') throw new Error('docBuilder: falta un ":"');
      i = skipSpace(text, i + 1);
    }
    const valueEnd = skipValue(text, i);
    children.push({ key, start: childStart, valueStart: i, valueEnd });
    i = skipSpace(text, valueEnd);
    if (text[i] === ',') i = skipSpace(text, i + 1);
    else if (text[i] === close) return { kind, open: start, children };
    else throw new Error(`docBuilder: JSON inesperado en ${i}`);
  }
}

/** El fin del valor que empieza en `i`; un contenedor se salta contando corchetes, sin recursión. */
function skipValue(text: string, i: number): number {
  const c = text[i];
  if (c === '"') return skipString(text, i);
  if (c === '{' || c === '[') {
    let depth = 0;
    for (let j = i; j < text.length; ) {
      const d = text[j];
      if (d === '"') {
        j = skipString(text, j);
        continue;
      }
      if (d === '{' || d === '[') depth++;
      else if (d === '}' || d === ']') {
        depth--;
        if (depth === 0) return j + 1;
      }
      j++;
    }
    throw new Error('docBuilder: un contenedor sin cerrar');
  }
  let j = i;
  while (j < text.length && !',}] \t\n\r'.includes(text[j] as string)) j++;
  if (j === i) throw new Error(`docBuilder: falta un valor en ${i}`);
  return j;
}

function skipString(text: string, i: number): number {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === '"') return j + 1;
  }
  throw new Error('docBuilder: un texto sin cerrar');
}

function skipSpace(text: string, i: number): number {
  while (i < text.length && ' \t\n\r'.includes(text[i] as string)) i++;
  return i;
}

function splice(text: string, from: number, to: number, insert: string): string {
  return `${text.slice(0, from)}${insert}${text.slice(to)}`;
}
