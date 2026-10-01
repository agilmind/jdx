/**
 * Porcentajes como enteros de diezmilésimos (`TenK`, 0..1_000_000): las sumas
 * de porcentajes se hacen desde el texto original del número, nunca en punto
 * flotante (16.6667 + 16.6666 da 33.333299999999994 en double y 333333 acá).
 */
import type { TenK } from '../types.js';
import { PATTERNS } from './patterns.js';

/** Texto de un porcentaje (0 a 100, hasta 4 decimales, sin exponente) → diezmilésimos; null si no cumple. */
export function percentTextToTenK(text: string): TenK | null {
  if (!PATTERNS.percent.test(text)) return null;
  const [int = '', frac = ''] = text.split('.');
  return Number(int) * 10_000 + Number(frac.padEnd(4, '0'));
}

/** Diezmilésimos → número: el double más cercano al decimal, el mismo que da su texto. */
export function tenKToNumber(v: TenK): number {
  return v / 10_000;
}

/**
 * Número de un parámetro del perfil (un `cap`, un `value`) → diezmilésimos. El
 * número se lee por su texto más corto (el de `String(v)` y `JSON.stringify`),
 * con las mismas reglas que un porcentaje del documento: null si tiene más de
 * 4 decimales, si no está entre 0 y 100 o si no es finito.
 */
export function paramToTenK(v: number): TenK | null {
  return Number.isFinite(v) ? percentTextToTenK(String(v)) : null;
}
