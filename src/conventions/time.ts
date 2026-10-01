/**
 * Fechas e instantes de JDX sin `Date`: el calendario gregoriano proléptico,
 * instantes como nanosegundos desde 1970-01-01T00:00:00Z en BigInt, y sumas de
 * períodos y años con la semántica de java.time.
 *
 * - `Date` redondea a milisegundos: con fracciones de 9 dígitos y offsets
 *   mezclados (-03:00 contra Z) movería los bordes de vigencia de claves, de
 *   TRU-001, de SIG-004 y del vencimiento de la lista.
 * - El segundo 60 vale solo en el último minuto del día UTC, 23:59 en Z o su
 *   equivalente en otro offset (RFC 3339 §5.7). Sin tabla de segundos
 *   intercalares no se mira el día, y el 60 cuenta como el 00 del minuto
 *   siguiente: el orden nunca se invierte.
 * - Los offsets de RFC 3339 son fijos: sumar minutos o días conserva el offset
 *   escrito. El `text` de un instante calculado se escribe en ese offset, con
 *   la fracción sin ceros finales. Fuera de los años 0000–9999 el año va como
 *   lo escribe java.time (`+10000`, `-0001`): ese texto ya no cumple el formato, pero
 *   `epochNanos` sigue exacto y el offset se conserva al encadenar sumas.
 */
import type { Instant } from '../types.js';
import { PATTERNS } from './patterns.js';

const NANOS_PER_SECOND = 1_000_000_000n;
const NANOS_PER_MINUTE = 60n * NANOS_PER_SECOND;
const NANOS_PER_DAY = 86_400n * NANOS_PER_SECOND;

const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) => (m === 2 ? (isLeapYear(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);

/** Días desde 1970-01-01 (days_from_civil de Howard Hinnant). */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * ((m + 9) % 12) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** Inversa de daysFromCivil: [año, mes, día]. */
function civilFromDays(days: number): [number, number, number] {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');
/** Año con 4 dígitos; fuera de 0000–9999, con signo como java.time (`+10000`, `-0001`). */
const formatYear = (y: number) => (y > 9999 ? `+${y}` : y < 0 ? `-${pad(-y, 4)}` : pad(y, 4));
const formatDate = (y: number, m: number, d: number) => `${formatYear(y)}-${pad(m)}-${pad(d)}`;

/** [año, mes, día] de un texto con el patrón de fecha, o null si no existe en el calendario. */
function dateParts(s: string): [number, number, number] | null {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) ? [y, m, d] : null;
}

/** `YYYY-MM-DD` que cumple el patrón de fecha y existe en el calendario. */
export function isCalendarDate(s: string): boolean {
  return PATTERNS.date.test(s) && dateParts(s) !== null;
}

/** Offset escrito → segundos (Z = 0), o null si la hora pasa de 23 o los minutos de 59. */
function offsetSeconds(zone: string): number | null {
  if (zone === 'Z') return 0;
  const h = Number(zone.slice(1, 3));
  const m = Number(zone.slice(4, 6));
  if (h > 23 || m > 59) return null;
  return (zone.startsWith('-') ? -1 : 1) * (h * 3600 + m * 60);
}

/**
 * Instante que cumple su patrón y existe en el calendario: fecha válida, 00–23 h, 00–59
 * min, 00–59 s (60 solo a las 23:59 UTC), offset ±00:00–23:59.
 */
export function isCalendarInstant(s: string): boolean {
  return parseInstant(s) !== null;
}

export function parseInstant(s: string): Instant | null {
  const match = PATTERNS.instant.exec(s);
  if (match === null) return null;
  const date = dateParts(s);
  const offset = offsetSeconds(match[2] ?? '');
  const hh = Number(s.slice(11, 13));
  const mm = Number(s.slice(14, 16));
  const ss = Number(s.slice(17, 19));
  if (date === null || offset === null || hh > 23 || mm > 59 || ss > 60) return null;
  // El segundo 60 solo en el minuto 23:59 UTC: la hora local menos el offset (minutos enteros).
  if (ss === 60 && (((hh * 60 + mm - offset / 60) % 1440) + 1440) % 1440 !== 1439) return null;
  const fraction = BigInt((match[1] ?? '.').slice(1).padEnd(9, '0'));
  const seconds = BigInt(daysFromCivil(...date)) * 86_400n + BigInt(hh * 3600 + mm * 60 + ss - offset);
  return { text: s, epochNanos: seconds * NANOS_PER_SECOND + fraction, localDate: s.slice(0, 10) };
}

export function compareInstants(a: Instant, b: Instant): -1 | 0 | 1 {
  return a.epochNanos < b.epochNanos ? -1 : a.epochNanos > b.epochNanos ? 1 : 0;
}

/**
 * El offset escrito de un instante: el texto (`Z`, `-03:00`) y sus segundos. Se
 * lee del final del texto, así sirve también para un año fuera de 0000–9999.
 */
function zoneOf(i: Instant): { text: string; seconds: bigint } {
  const zone = /(Z|[+-]\d{2}:\d{2})$/.exec(i.text)?.[1] ?? 'Z';
  return { text: zone, seconds: BigInt(offsetSeconds(zone) ?? 0) };
}

/** Los argumentos de las sumas son enteros: con otra cosa es un error de programación. */
function whole(n: number, what: string): number {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${what} tiene que ser un entero: ${n}`);
  return n;
}

const floorDiv = (a: bigint, b: bigint) => (a >= 0n ? a / b : -((-a + b - 1n) / b));

/** Instante con `epochNanos`, escrito en el offset `zone`. */
function instantAt(epochNanos: bigint, zone: { text: string; seconds: bigint }): Instant {
  const local = epochNanos + zone.seconds * NANOS_PER_SECOND;
  const days = floorDiv(local, NANOS_PER_DAY);
  const ofDay = local - days * NANOS_PER_DAY;
  const secs = Number(ofDay / NANOS_PER_SECOND);
  const nanos = ofDay % NANOS_PER_SECOND;
  const localDate = formatDate(...civilFromDays(Number(days)));
  const fraction = nanos === 0n ? '' : `.${nanos.toString().padStart(9, '0').replace(/0+$/, '')}`;
  const time = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;
  return { text: `${localDate}T${time}${fraction}${zone.text}`, epochNanos, localDate };
}

/** Suma minutos enteros (también negativos) en el mismo offset; RangeError si `minutes` no es entero. */
export function addMinutes(i: Instant, minutes: number): Instant {
  return instantAt(i.epochNanos + BigInt(whole(minutes, 'minutes')) * NANOS_PER_MINUTE, zoneOf(i));
}

/** Suma días de 24 horas en el mismo offset; RangeError si `days` no es entero. */
export function addDays(i: Instant, days: number): Instant {
  return instantAt(i.epochNanos + BigInt(whole(days, 'days')) * NANOS_PER_DAY, zoneOf(i));
}

/**
 * Suma años a la fecha local, con la hora y el offset intactos: el 29 de
 * febrero pasa al 28 en un año no bisiesto (LocalDate.plusYears de java.time).
 * RangeError si `years` no es entero.
 */
export function addYears(i: Instant, years: number): Instant {
  const zone = zoneOf(i);
  const local = i.epochNanos + zone.seconds * NANOS_PER_SECOND;
  const days = floorDiv(local, NANOS_PER_DAY);
  const [y, m, d] = civilFromDays(Number(days));
  const target = y + whole(years, 'years');
  const moved = BigInt(daysFromCivil(target, m, Math.min(d, daysInMonth(target, m))));
  return instantAt(i.epochNanos + (moved - days) * NANOS_PER_DAY, zone);
}

/**
 * Fecha + período, como Period.addTo de java.time: años y meses juntos, con un
 * solo recorte a fin de mes, y después los días. null si la duración tiene
 * parte horaria (H, M o S después de T), si la fecha o la duración no cumplen
 * su patrón o si el resultado sale de los años 0000–9999.
 */
export function addPeriodToDate(date: string, duration: string): string | null {
  if (!PATTERNS.date.test(date) || !PATTERNS.duration.test(duration) || duration.includes('T')) return null;
  const parts = dateParts(date);
  const period = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/.exec(duration);
  if (parts === null || period === null) return null;
  const [y, m, d] = parts;
  const months = y * 12 + (m - 1) + Number(period[1] ?? 0) * 12 + Number(period[2] ?? 0);
  const year = Math.floor(months / 12);
  const month = (months % 12) + 1;
  if (!Number.isSafeInteger(months) || year > 9999) return null;
  const days = daysFromCivil(year, month, Math.min(d, daysInMonth(year, month))) + Number(period[3] ?? 0);
  if (!Number.isSafeInteger(days)) return null;
  const result = civilFromDays(days);
  return result[0] > 9999 ? null : formatDate(...result);
}

/**
 * Años cumplidos en `onDate`: `Period.between(birthDate, onDate).getYears()` de
 * java.time (negativo si `onDate` es anterior). NaN si alguna fecha no existe.
 */
export function ageInYears(birthDate: string, onDate: string): number {
  const birth = isCalendarDate(birthDate) ? dateParts(birthDate) : null;
  const on = isCalendarDate(onDate) ? dateParts(onDate) : null;
  if (birth === null || on === null) return Number.NaN;
  const [by, bm, bd] = birth;
  const [oy, om, od] = on;
  let months = oy * 12 + om - (by * 12 + bm);
  if (months > 0 && od < bd) months--;
  else if (months < 0 && od > bd) months++;
  return Math.trunc(months / 12);
}
