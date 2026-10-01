/**
 * JSON Pointer (RFC 6901) y los patrones de puntero de schema/1.0/index.json,
 * donde `*` es exactamente un segmento cualquiera: `/parties/*` calza con
 * `/parties/0` y no con `/parties` ni con `/parties/0/names`.
 */
import type { JsonPointer, JsonValue } from '../types.js';

const escapeSegment = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');

/** Segmentos → puntero; `[]` es `''`, el documento entero. */
export function pointerOf(segments: readonly (string | number)[]): JsonPointer {
  return segments.map((s) => `/${escapeSegment(String(s))}`).join('');
}

/**
 * Puntero → segmentos sin escapes (primero `~1`, después `~0`, RFC 6901 §4).
 * Lanza si el puntero no es RFC 6901: no empieza con `/` o trae un `~` que no
 * es `~0` ni `~1`. Los punteros salen del parser o del índice: un puntero
 * inválido es un error de programación.
 */
export function segmentsOf(pointer: JsonPointer): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`JSON Pointer inválido: ${JSON.stringify(pointer)}`);
  return pointer.slice(1).split('/').map((s) => {
    if (/~(?![01])/.test(s)) throw new Error(`JSON Pointer inválido: ${JSON.stringify(pointer)}`);
    return s.replace(/~1/g, '/').replace(/~0/g, '~');
  });
}

/**
 * Valor en `pointer`, o `undefined` si no existe. En un arreglo el segmento es
 * un índice canónico (`0`, `12`; no `01` ni `-`) dentro del largo; en un objeto,
 * solo propiedades propias (`/constructor` no llega al prototipo).
 */
export function getAt(value: JsonValue, pointer: JsonPointer): JsonValue | undefined {
  let current: JsonValue | undefined = value;
  for (const segment of segmentsOf(pointer)) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else {
      current = Object.hasOwn(current, segment) ? current[segment] : undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

/**
 * ¿`pointer` calza con `pattern`? Misma cantidad de segmentos y cada uno igual,
 * salvo `*`, que calza con un segmento cualquiera (también el vacío). Compara
 * los segmentos escapados: `*` no puede salir de un escape.
 */
export function matchPattern(pattern: string, pointer: JsonPointer): boolean {
  if (pattern === '' || pointer === '') return pattern === pointer;
  const p = pattern.split('/');
  const s = pointer.split('/');
  return p.length === s.length && p.every((seg, i) => seg === '*' || seg === s[i]);
}
