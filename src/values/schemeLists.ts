/**
 * Esquemas con lista empaquetada (JDX-CLS-001): el código de una
 * clasificación, una condición o un contrato tipo se controla contra la lista
 * de su esquema. Un esquema sin lista no se evalúa: `schemeHasCode` da `null`.
 *
 * - `SADAIC_GENRE`: el par (`code`, `name`) en values/sadaic-genres.json, porque
 *   la lista repite códigos. El nombre se compara en NFC y tal como está
 *   escrito (la lista va en mayúsculas); sin nombre no hay par.
 * - `SADAIC_ART8` y `SADAIC_CONTRACT`: el código en values/sadaic-art8.json y
 *   values/sadaic-contract.json; el nombre no cuenta.
 */
import type { ValueLists } from '../types.js';

export const SCHEME_LISTS: Readonly<Record<string, 'sadaicGenres' | 'sadaicArt8' | 'sadaicContract'>> = Object.freeze({
  SADAIC_GENRE: 'sadaicGenres',
  SADAIC_ART8: 'sadaicArt8',
  SADAIC_CONTRACT: 'sadaicContract',
});

/** Si la lista del esquema trae el código (y, en los géneros, el par con el nombre); `null` si el esquema no tiene lista. */
export function schemeHasCode(values: ValueLists, scheme: string, code: string, name?: string): boolean | null {
  const list = Object.hasOwn(SCHEME_LISTS, scheme) ? SCHEME_LISTS[scheme] : undefined;
  if (list === undefined) return null;
  if (list === 'sadaicGenres') {
    if (name === undefined) return false;
    const normalized = name.normalize('NFC');
    return values.sadaicGenres.some((genre) => genre.code === code && genre.name === normalized);
  }
  return values[list].values.some((entry) => entry.code === code);
}
