/**
 * Porcentajes en diezmilésimos enteros (src/conventions/decimal.ts): las sumas
 * de porcentajes se hacen desde el texto del número, nunca en punto flotante.
 */
import { describe, expect, it } from 'vitest';
import { paramToTenK, percentTextToTenK, tenKToNumber } from '../../../src/conventions/decimal.js';

describe('percentTextToTenK', () => {
  it('25 → 250000', () => {
    expect(percentTextToTenK('25')).toBe(250_000);
  });

  it('12.5 → 125000', () => {
    expect(percentTextToTenK('12.5')).toBe(125_000);
    expect(percentTextToTenK('12.50')).toBe(125_000);
  });

  it('33.3333 → 333333', () => {
    expect(percentTextToTenK('33.3333')).toBe(333_333);
    expect(percentTextToTenK('0.0001')).toBe(1);
  });

  it('100.0000 → 1000000', () => {
    expect(percentTextToTenK('100.0000')).toBe(1_000_000);
    expect(percentTextToTenK('100')).toBe(1_000_000);
  });

  it('0 → 0', () => {
    expect(percentTextToTenK('0')).toBe(0);
    expect(percentTextToTenK('0.0')).toBe(0);
  });

  it('invalid texts (1e1, -0, 33.33333, 100.5) → null', () => {
    for (const text of ['1e1', '1E1', '-0', '33.33333', '100.5', '100.00001', '101', '05', '-5', '', ' 5']) {
      expect(percentTextToTenK(text), text).toBeNull();
    }
  });

  it('16.6667 + 16.6666 = 333333 exactly', () => {
    const sum = percentTextToTenK('16.6667')! + percentTextToTenK('16.6666')!;
    expect(sum).toBe(333_333);
    expect(sum).toBe(paramToTenK(33.3333));
    // En punto flotante la misma suma no da el tope.
    expect(16.6667 + 16.6666).not.toBe(33.3333);
  });
});

describe('tenKToNumber and paramToTenK', () => {
  it('tenKToNumber(375000) is 37.5', () => {
    expect(tenKToNumber(375_000)).toBe(37.5);
    expect(tenKToNumber(333_333)).toBe(33.3333);
    expect(tenKToNumber(1_000_000)).toBe(100);
  });

  it('paramToTenK(33.3333) is 333333', () => {
    expect(paramToTenK(33.3333)).toBe(333_333);
    expect(paramToTenK(25)).toBe(250_000);
    expect(paramToTenK(0)).toBe(0);
    expect(paramToTenK(100)).toBe(1_000_000);
  });

  it('paramToTenK(33.33335) is null', () => {
    for (const v of [33.33335, 100.0001, -1, 1e-7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(paramToTenK(v), String(v)).toBeNull();
    }
  });
});
