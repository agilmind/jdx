/**
 * Las raíces fijadas en el validador: las claves que firman la lista de
 * confianza, tres por entorno. Vienen de trust/roots.json, que `npm run gen`
 * lee con parseRootsFile (src/trust/keys.ts) y escribe en
 * src/generated/roots.ts, aparte del resto de los datos para que la imagen de
 * un entorno se quede solo con las suyas (filterRoots). La lista de confianza
 * no agrega raíces: cambian solo con una versión nueva del validador.
 */
import { roots as generatedRoots } from '../generated/roots.js';
import type { JsonValue, PinnedRoots } from '../types.js';
import { parseRootsFile } from './keys.js';

let pinned: PinnedRoots | undefined;

/** Las raíces que trae el validador (src/generated/roots.ts), controladas una vez y congeladas. */
export function pinnedRoots(): PinnedRoots {
  pinned ??= parseRootsFile(generatedRoots as unknown as JsonValue);
  return pinned;
}
