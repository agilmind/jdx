/**
 * Los patrones de ruta de la entrega: los de --ignore, que configura el
 * receptor, y las exclusiones de JDX-MED-003.
 *
 * - El path va con `/` y es relativo a la raíz de la entrega.
 * - Un patrón sin `/` compara el nombre base, a cualquier profundidad; uno con
 *   `/`, la ruta entera desde la raíz, segmento por segmento. Un segmento
 *   vacío del patrón (una barra inicial, final o doble) no calza con nada.
 * - `*` es cualquier tramo de un segmento y nunca cruza `/`; un segmento `**`
 *   cubre cero o más segmentos. Todo lo demás se compara tal cual: distingue
 *   mayúsculas.
 *
 * Los dos niveles se comparan sin retroceder más que hasta la última
 * estrella: el costo es a lo sumo el largo del patrón por el del path.
 */

export function matchDeliveryGlob(pattern: string, path: string): boolean {
  if (!pattern.includes('/')) return segmentMatches(pattern, path.slice(path.lastIndexOf('/') + 1));
  return segmentsMatch(pattern.split('/'), path.split('/'));
}

/** Un segmento contra un segmento del patrón, con `*` como cualquier tramo. */
function segmentMatches(glob: string, text: string): boolean {
  let g = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    if (g < glob.length && glob[g] === '*') {
      star = g++;
      mark = t;
    } else if (g < glob.length && glob[g] === text[t]) {
      g++;
      t++;
    } else if (star >= 0) {
      g = star + 1;
      t = ++mark;
    } else {
      return false;
    }
  }
  while (g < glob.length && glob[g] === '*') g++;
  return g === glob.length;
}

/** Los segmentos del path contra los del patrón, con `**` como cero o más segmentos. */
function segmentsMatch(globs: readonly string[], segments: readonly string[]): boolean {
  let g = 0;
  let s = 0;
  let star = -1;
  let mark = 0;
  while (s < segments.length) {
    if (g < globs.length && globs[g] === '**') {
      star = g++;
      mark = s;
    } else if (g < globs.length && globs[g] !== '' && segmentMatches(globs[g] as string, segments[s] as string)) {
      g++;
      s++;
    } else if (star >= 0) {
      g = star + 1;
      s = ++mark;
    } else {
      return false;
    }
  }
  while (g < globs.length && globs[g] === '**') g++;
  return g === globs.length;
}
