/**
 * Calendario, instantes, períodos, años y edad (src/conventions/time.ts):
 * lo que usan NUM-002, AGR-005, MIN-001, SIG-004 y la vigencia de claves y
 * listas. Instantes en nanosegundos, sin Date; períodos y años como java.time.
 */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMinutes,
  addPeriodToDate,
  addYears,
  ageInYears,
  compareInstants,
  isCalendarDate,
  isCalendarInstant,
  parseInstant,
} from '../../../src/conventions/time.js';
import type { Instant } from '../../../src/types.js';

function instant(text: string): Instant {
  const i = parseInstant(text);
  if (i === null) throw new Error(`instante inválido: ${text}`);
  return i;
}
const cmp = (a: string, b: string) => compareInstants(instant(a), instant(b));

describe('calendar', () => {
  it('2024-02-29 valid, 2026-02-29 invalid', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('2000-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('1900-02-29')).toBe(false);
    expect(isCalendarInstant('2026-02-29T10:00:00Z')).toBe(false);
    expect(parseInstant('2026-02-29T10:00:00Z')).toBeNull();
    // Primero el patrón de fecha: sin él no hay fecha.
    expect(isCalendarDate('2026-2-28')).toBe(false);
  });

  it('2026-04-31 invalid', () => {
    expect(isCalendarDate('2026-04-31')).toBe(false);
    expect(isCalendarDate('2026-04-30')).toBe(true);
    for (const bad of ['2026-00-10', '2026-13-01', '2026-01-00', '2026-01-32']) expect(isCalendarDate(bad), bad).toBe(false);
  });

  it('hour 24:00:00 invalid', () => {
    expect(isCalendarInstant('2026-09-30T24:00:00Z')).toBe(false);
    expect(isCalendarInstant('2026-09-30T23:60:00Z')).toBe(false);
    expect(isCalendarInstant('2026-09-30T23:59:61Z')).toBe(false);
    expect(isCalendarInstant('2026-09-30T23:59:59.999999999Z')).toBe(true);
  });

  it('second 23:59:60 valid (RFC 3339 leap second)', () => {
    expect(isCalendarInstant('2016-12-31T23:59:60Z')).toBe(true);
    // Sin tabla de segundos intercalares: el 60 cuenta como el 00 del minuto siguiente.
    expect(cmp('2016-12-31T23:59:60Z', '2017-01-01T00:00:00Z')).toBe(0);
    expect(cmp('2016-12-31T23:59:60Z', '2016-12-31T23:59:59.999999999Z')).toBe(1);
    expect(instant('2016-12-31T23:59:60Z').localDate).toBe('2016-12-31');
    // Solo en el minuto 23:59 UTC (RFC 3339 §5.7), también escrito en otro offset.
    expect(isCalendarInstant('2016-12-31T20:59:60-03:00')).toBe(true);
    expect(isCalendarInstant('2017-01-01T05:29:60+05:30')).toBe(true);
    expect(cmp('2016-12-31T20:59:60-03:00', '2017-01-01T00:00:00Z')).toBe(0);
    expect(isCalendarInstant('2026-09-30T10:15:60Z')).toBe(false);
    expect(isCalendarInstant('2016-12-31T23:59:60-03:00')).toBe(false);
  });

  it('offset +24:00 invalid', () => {
    expect(isCalendarInstant('2026-09-30T10:00:00+24:00')).toBe(false);
    expect(isCalendarInstant('2026-09-30T10:00:00+05:60')).toBe(false);
    expect(isCalendarInstant('2026-09-30T10:00:00+23:59')).toBe(true);
    expect(isCalendarInstant('2026-09-30T10:00:00-00:00')).toBe(true);
    expect(isCalendarInstant('2026-09-30T10:00:00')).toBe(false);
  });

  it('same moment with -03:00 and Z compares equal', () => {
    expect(cmp('2026-09-30T09:12:00-03:00', '2026-09-30T12:12:00Z')).toBe(0);
    expect(cmp('2026-09-30T23:30:00-03:00', '2026-10-01T02:30:00Z')).toBe(0);
    expect(cmp('2026-09-30T09:12:00-03:00', '2026-09-30T09:12:00Z')).toBe(1);
    expect(cmp('2026-09-30T09:12:00Z', '2026-09-30T09:12:00-03:00')).toBe(-1);
    expect(cmp('2026-09-30T12:12:00+00:00', '2026-09-30T12:12:00-00:00')).toBe(0);
  });

  it('9-digit fractions compare at nanosecond precision', () => {
    expect(cmp('2026-09-30T12:00:00.123456789Z', '2026-09-30T12:00:00.123456788Z')).toBe(1);
    expect(cmp('2026-09-30T12:00:00.12345678Z', '2026-09-30T12:00:00.123456780Z')).toBe(0);
    expect(cmp('2026-09-30T09:00:00.000000001-03:00', '2026-09-30T12:00:00Z')).toBe(1);
    // Con Date (milisegundos) estos dos serían iguales.
    expect(cmp('2026-09-30T12:00:00.0001Z', '2026-09-30T12:00:00.0002Z')).toBe(-1);
    expect(instant('1970-01-01T00:00:01.5Z').epochNanos).toBe(1_500_000_000n);
    expect(instant('1969-12-31T23:59:59Z').epochNanos).toBe(-1_000_000_000n);
  });

  it('localDate keeps the date as written', () => {
    const i = instant('2026-09-30T23:30:00-03:00');
    expect(i.localDate).toBe('2026-09-30');
    expect(i.text).toBe('2026-09-30T23:30:00-03:00');
    expect(instant('2026-10-01T02:30:00Z').localDate).toBe('2026-10-01');
  });
});

describe('periods', () => {
  it('2026-09-12 + P10Y = 2036-09-12', () => {
    expect(addPeriodToDate('2026-09-12', 'P10Y')).toBe('2036-09-12');
  });

  it('2024-02-29 + P1Y = 2025-02-28', () => {
    expect(addPeriodToDate('2024-02-29', 'P1Y')).toBe('2025-02-28');
    expect(addPeriodToDate('2024-02-29', 'P4Y')).toBe('2028-02-29');
  });

  it('2026-01-31 + P1M = 2026-02-28', () => {
    expect(addPeriodToDate('2026-01-31', 'P1M')).toBe('2026-02-28');
    expect(addPeriodToDate('2024-01-31', 'P1M')).toBe('2024-02-29');
    expect(addPeriodToDate('2026-12-15', 'P1M')).toBe('2027-01-15');
  });

  it('P1Y2M10D adds years and months together, then days', () => {
    expect(addPeriodToDate('2024-01-31', 'P1Y2M10D')).toBe('2025-04-10');
    // Como Period.addTo de java.time: años y meses juntos, con un solo recorte a fin
    // de mes; después los días. Sumar P1Y y después P1M daría 2025-03-28.
    expect(addPeriodToDate('2024-02-29', 'P1Y1M')).toBe('2025-03-29');
    expect(addPeriodToDate('2026-01-31', 'P1M1D')).toBe('2026-03-01');
    expect(addPeriodToDate('2026-09-12', 'P400D')).toBe('2027-10-17');
    expect(addPeriodToDate('2026-09-12', 'P0D')).toBe('2026-09-12');
  });

  it('duration with hours returns null', () => {
    for (const d of ['PT1H', 'P1DT2H', 'PT30M', 'PT0S']) expect(addPeriodToDate('2026-09-12', d), d).toBeNull();
    // Tampoco con una fecha o una duración que no cumplen su patrón, o fuera de los años 0000–9999.
    expect(addPeriodToDate('2026-02-30', 'P1Y')).toBeNull();
    expect(addPeriodToDate('2026-09-12', 'P1W')).toBeNull();
    expect(addPeriodToDate('9999-12-31', 'P1D')).toBeNull();
  });
});

describe('instants', () => {
  it('addYears(2026-09-30T00:00:00-03:00, 2) = 2028-09-30T00:00:00-03:00', () => {
    const r = addYears(instant('2026-09-30T00:00:00-03:00'), 2);
    expect(r.text).toBe('2028-09-30T00:00:00-03:00');
    expect(r.localDate).toBe('2028-09-30');
    expect(compareInstants(r, instant('2028-09-30T03:00:00Z'))).toBe(0);
  });

  it('addYears(2028-02-29T10:00:00Z, 2) = 2030-02-28T10:00:00Z', () => {
    const r = addYears(instant('2028-02-29T10:00:00Z'), 2);
    expect(r).toEqual(instant('2030-02-28T10:00:00Z'));
    expect(addYears(instant('2028-02-29T10:00:00.5+05:30'), 4).text).toBe('2032-02-29T10:00:00.5+05:30');
    // Después del año 9999 el año va con signo, como java.time, y el offset sigue al encadenar.
    const past = addYears(instant('9999-06-01T00:00:00-03:00'), 1);
    expect(past.text).toBe('+10000-06-01T00:00:00-03:00');
    expect(past.localDate).toBe('+10000-06-01');
    expect(addMinutes(past, 1).text).toBe('+10000-06-01T00:01:00-03:00');
    expect(addMinutes(past, 1).epochNanos - past.epochNanos).toBe(60_000_000_000n);
    expect(parseInstant(past.text)).toBeNull();
    expect(() => addYears(r, 0.5)).toThrow(RangeError);
  });

  it('age of 2008-02-29 is 17 on 2026-02-28 and 18 on 2026-03-01', () => {
    expect(ageInYears('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageInYears('2008-02-29', '2026-03-01')).toBe(18);
    // El cumpleaños 18 en la fecha de referencia ya es mayoría.
    expect(ageInYears('2008-03-01', '2026-03-01')).toBe(18);
    expect(ageInYears('2008-03-02', '2026-03-01')).toBe(17);
    expect(ageInYears('2026-03-01', '2026-03-01')).toBe(0);
    // Como Period.between: una fecha de referencia anterior da una edad negativa.
    expect(ageInYears('2026-03-01', '2008-02-29')).toBe(-18);
    // Una fecha que no existe no tiene edad: NaN, y ninguna comparación con NaN da verdadero.
    expect(ageInYears('2008-02-30', '2026-03-01')).toBeNaN();
  });

  it('addMinutes crosses midnight and offsets', () => {
    const r = addMinutes(instant('2026-09-30T23:58:00-03:00'), 5);
    expect(r.text).toBe('2026-10-01T00:03:00-03:00');
    expect(r.localDate).toBe('2026-10-01');
    expect(compareInstants(r, instant('2026-10-01T03:03:00Z'))).toBe(0);
    // SIG-004: issuedAt en Z contra --received-at en -03:00 más 5 minutos.
    expect(compareInstants(instant('2026-09-30T12:17:00.000000001Z'), addMinutes(instant('2026-09-30T09:12:00-03:00'), 5))).toBe(1);
    expect(addMinutes(instant('2026-01-01T00:01:00.25Z'), -2).text).toBe('2025-12-31T23:59:00.25Z');
    expect(addMinutes(instant('2016-12-31T23:59:60Z'), 0).text).toBe('2017-01-01T00:00:00Z');
    // addDays suma días de 24 horas en el mismo offset (los offsets de RFC 3339 son fijos).
    expect(addDays(instant('2026-09-30T00:00:00-03:00'), 90).text).toBe('2026-12-29T00:00:00-03:00');
    expect(addDays(instant('2024-02-28T12:00:00Z'), 1).text).toBe('2024-02-29T12:00:00Z');
    // Antes del año 0000, también con signo; minutos y días son enteros.
    expect(addMinutes(instant('0000-01-01T00:00:00Z'), -1).text).toBe('-0001-12-31T23:59:00Z');
    expect(addDays(instant('9999-12-31T12:00:00+05:30'), 1).text).toBe('+10000-01-01T12:00:00+05:30');
    expect(() => addMinutes(r, 1.5)).toThrow(RangeError);
    expect(() => addDays(r, 0.5)).toThrow(RangeError);
    expect(() => addMinutes(r, Number.NaN)).toThrow(RangeError);
  });
});
