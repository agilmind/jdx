/**
 * Expansión de territorios TIS a países, el primer paso de las sumas de
 * `shares`: los países de `include` menos los de `exclude`, como ISO 3166-1
 * alfa-2.
 *
 * - Con la lista empaquetada de sadaic/0.1 (values/tis.json), un grupo se
 *   expande a sus `members` (2136: los 249 países) y un código de país, a su
 *   `iso2`.
 * - Un código que no está en la lista va a `unknown`, una vez y en el orden en
 *   que aparece (primero `include`, después `exclude`): JDX-TER-001 lo informa
 *   y la fila queda fuera de las sumas.
 * - `validFrom` y `validTo` no se miran: ninguna entrada de la lista 2026-10 los
 *   trae.
 */
import type { TerritoryExpander, TisEntry } from '../types.js';

export function territoryExpander(tis: readonly TisEntry[]): TerritoryExpander {
  const countriesOf = new Map<string, readonly string[]>();
  for (const entry of tis) {
    const countries = entry.kind === 'country' ? (entry.iso2 === undefined ? [] : [entry.iso2]) : (entry.members ?? []);
    countriesOf.set(entry.code, Object.freeze([...countries]));
  }
  return {
    expand({ include, exclude = [] }) {
      const countries = new Set<string>();
      const unknown = new Set<string>();
      const lookup = (code: string): readonly string[] => {
        const found = countriesOf.get(code);
        if (found === undefined) unknown.add(code);
        return found ?? [];
      };
      for (const code of include) for (const country of lookup(code)) countries.add(country);
      for (const code of exclude) for (const country of lookup(code)) countries.delete(country);
      return { countries, unknown: [...unknown] };
    },
  };
}
