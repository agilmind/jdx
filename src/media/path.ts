/**
 * Las rutas de la entrega como texto: lo que JDX-MED-001 controla de cada
 * `path` y cómo se comparan sin distinguir mayúsculas.
 *
 * - Un path válido son segmentos de [A-Za-z0-9._-] separados por `/`, sin
 *   barra inicial y sin segmentos vacíos, `.` ni `..`. pathProblem da el
 *   primer problema: absoluto, un segmento, o caracteres fuera de esos.
 * - foldCase pasa a minúscula solo de A a Z: es la comparación sin
 *   mayúsculas de las rutas de la entrega, igual en cualquier sistema de
 *   archivos y sin depender del idioma. Otra letra no se pliega.
 *
 * - shownName muestra el nombre de una entrada de la carpeta: el UTF-8 válido
 *   tal cual (también un U+FEFF al principio) y cada byte que no lo es, y la
 *   barra invertida, como `\xHH` (hexadecimal en mayúsculas). De lo que
 *   muestra vuelven los bytes: dos nombres distintos se muestran distinto, y
 *   uno con `\` nunca es un path válido: no se confunde con uno declarado.
 *
 * Las reglas de la carpeta de la entrega no buscan un path inválido: solo da
 * JDX-MED-001.
 */

export type PathProblem = 'absolute' | 'segment' | 'characters';

const SEGMENT = /^[A-Za-z0-9._-]+$/u;

export function pathProblem(path: string): PathProblem | null {
  if (path.startsWith('/')) return 'absolute';
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return 'segment';
  return segments.every((s) => SEGMENT.test(s)) ? null : 'characters';
}

export function foldCase(path: string): string {
  return path.replace(/[A-Z]+/gu, (upper) => upper.toLowerCase());
}

// ignoreBOM: un U+FEFF al principio de un tramo queda en el texto (sin esto, se pierde).
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export function shownName(name: Uint8Array): string {
  let out = '';
  let start = 0;
  const flush = (end: number): void => {
    if (end > start) out += decoder.decode(name.subarray(start, end));
  };
  for (let i = 0; i < name.length; ) {
    const length = sequenceLength(name, i);
    if (length > 0 && name[i] !== 0x5c) {
      i += length;
      continue;
    }
    flush(i);
    out += `\\x${(name[i] as number).toString(16).toUpperCase().padStart(2, '0')}`;
    start = ++i;
  }
  flush(name.length);
  return out;
}

/** El largo de la secuencia UTF-8 válida que empieza en `at` (RFC 3629), o 0 si no hay una. */
function sequenceLength(bytes: Uint8Array, at: number): number {
  const lead = bytes[at] as number;
  if (lead < 0x80) return 1;
  const tail = (i: number, low = 0x80, high = 0xbf): boolean => at + i < bytes.length && (bytes[at + i] as number) >= low && (bytes[at + i] as number) <= high;
  if (lead >= 0xc2 && lead <= 0xdf) return tail(1) ? 2 : 0;
  if (lead >= 0xe0 && lead <= 0xef) {
    // Sin formas largas de más (E0 A0–BF) ni sustitutos (ED 80–9F).
    const ok = lead === 0xe0 ? tail(1, 0xa0) : lead === 0xed ? tail(1, 0x80, 0x9f) : tail(1);
    return ok && tail(2) ? 3 : 0;
  }
  if (lead >= 0xf0 && lead <= 0xf4) {
    // Hasta U+10FFFF: F0 90–BF, F4 80–8F.
    const ok = lead === 0xf0 ? tail(1, 0x90) : lead === 0xf4 ? tail(1, 0x80, 0x8f) : tail(1);
    return ok && tail(2) && tail(3) ? 4 : 0;
  }
  return 0;
}
