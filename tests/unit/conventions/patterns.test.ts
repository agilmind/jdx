/**
 * Formatos de JDX (src/conventions/patterns.ts): las 26 expresiones exactas,
 * sus ejemplos y casi aciertos, y el mapa escalar → patrón que usa el
 * generador de schemas.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import { PATTERNS, SCALAR_PATTERN } from '../../../src/conventions/patterns.js';
import type { PatternName, ScalarName } from '../../../src/types.js';

/** El texto exacto de cada expresión, como lo publican el schema y docs/campos.md. */
const SOURCES: Record<PatternName, string> = {
  instant: String.raw`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$`,
  date: String.raw`^\d{4}-\d{2}-\d{2}$`,
  duration: String.raw`^P(?!$)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$`,
  percent: String.raw`^(100(\.0{1,4})?|[1-9]?[0-9](\.[0-9]{1,4})?)$`,
  amount: String.raw`^\d+(\.\d{1,4})?$`,
  currency: String.raw`^[A-Z]{3}$`,
  sha256: String.raw`^[0-9a-f]{64}$`,
  uuid: String.raw`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
  localId: String.raw`^[a-z][a-z0-9-]{0,63}$`,
  issuerId: String.raw`^[a-z][a-z0-9-]{0,63}$`,
  kid: String.raw`^[A-Za-z0-9_-]{43}$`,
  country: String.raw`^[A-Z]{2}$`,
  subdivision: String.raw`^[A-Z]{2}-[A-Z0-9]{1,3}$`,
  tis: String.raw`^\d{4}$`,
  society: String.raw`^(\d{3}|X_JDX_[A-Z0-9_]+)$`,
  language: String.raw`^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$`,
  url: String.raw`^https?://\S+$`,
  uri: String.raw`^https://\S+$`,
  email: String.raw`^[^@\s]+@[^@\s]+\.[^@\s]+$`,
  phone: String.raw`^\+[1-9]\d{6,14}$`,
  mediaType: String.raw`^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$`,
  fraction: String.raw`^[1-9]\d*/[1-9]\d*$`,
  schemaVersion: String.raw`^\d+\.\d+$`,
  enumValue: String.raw`^([a-z][A-Za-z0-9]*|X_[A-Z0-9]+(_[A-Z0-9]+)*)$`,
  schemeValue: String.raw`^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`,
  extensionKey: String.raw`^[a-z0-9-]+(\.[a-z0-9-]+)+$`,
};

/** Ejemplos válidos de cada formato (el porcentaje, como texto del número). */
const EXAMPLES: Record<PatternName, readonly string[]> = {
  instant: ['2026-09-12T15:40:00-03:00'],
  date: ['2026-09-12'],
  duration: ['PT3M25S', 'P10Y'],
  percent: ['33.3333'],
  amount: ['1500.00'],
  currency: ['ARS'],
  sha256: ['5052e13da2537321f8129e83df50a6722ff02084c20d40f488f4a05a5a6fd2c3'],
  uuid: ['3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13'],
  localId: ['p1', 'w1', 'a1', 'm1'],
  issuerId: ['jupiter'],
  kid: ['3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E'],
  country: ['AR'],
  subdivision: ['AR-B'],
  tis: ['2136', '0032'],
  society: ['061', 'X_JDX_AADI'],
  language: ['es', 'pt-BR'],
  url: ['https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp'],
  uri: ['https://jdx.jupiter.ar/profiles/sadaic/0.1'],
  email: ['ana@example.com'],
  phone: ['+5492215550000'],
  mediaType: ['application/pdf'],
  fraction: ['1/3'],
  schemaVersion: ['1.0'],
  enumValue: ['originalPublisher', 'X_JUPITER_STEM'],
  schemeValue: ['SADAIC_GENRE'],
  extensionKey: ['ar.sadaic.x', 'ar.example.dato'],
};

/** Casi aciertos: al menos uno por patrón. Ningún patrón acepta un salto de línea final. */
const NEAR_MISSES: Record<PatternName, readonly string[]> = {
  instant: ['2026-09-12T15:40:00', '2026-09-12 15:40:00Z', '2026-09-12T15:40Z', '2026-09-12T15:40:00.1234567890Z',
    '2026-09-12T15:40:00-0300', '2026-09-12T15:40:00z'],
  date: ['2026-9-1', '20260912', '2026-09-12T00:00:00Z'],
  duration: ['P', 'PT', 'P1W', 'P1.5Y', 'P1YT', 'PT1H1D', 'p1y', 'P-1Y'],
  percent: ['100.00001', '05', '1e2', '-0', '100.5', '101', '33.33333', '.5', '1.', '+1'],
  amount: ['1500.00000', '-1', '1,5', '.5', '1e3'],
  currency: ['ars', 'ARSX', 'AR'],
  sha256: ['5052E13DA2537321F8129E83DF50A6722FF02084C20D40F488F4A05A5A6FD2C3',
    '5052e13da2537321f8129e83df50a6722ff02084c20d40f488f4a05a5a6fd2c'],
  uuid: ['3F2C9A1E-5B7D-4C21-9E0A-7D4B2F8C6A13', '3f2c9a1e5b7d4c219e0a7d4b2f8c6a13'],
  localId: ['1p', 'a'.repeat(65), 'P1', 'p_1', ''],
  issuerId: ['1jupiter', 'j'.repeat(65), 'Jupiter'],
  kid: ['3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6', '3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E=',
    '3ifADueZaLjFGBgto+xCbTohNZKhf7ziQ8gS/yx6r6E'],
  country: ['ar', 'ARG', 'A'],
  subdivision: ['AR-', 'AR-ABCD', 'ar-b', 'ARB'],
  tis: ['213', '21360', '2136a'],
  society: ['61', '0610', 'X_JDX_', 'X_OTHER_A', 'x_jdx_aadi'],
  language: ['ES', 'e', 'es_AR', 'pt-'],
  url: ['ws://example.com/a', 'https://a b', 'www.example.com'],
  uri: ['http://jdx.jupiter.ar/profiles/sadaic/0.1', 'https://', 'urn:jdx:1'],
  email: ['ana@example', 'ana example.com', 'ana@@example.com'],
  phone: ['5492215550000', '+0549221555', '+54 9 221 555 0000', '+12345'],
  mediaType: ['Application/pdf', 'application', 'application/PDF', 'application/ pdf'],
  fraction: ['0/3', '1/0', '1/03', '1/3.0'],
  schemaVersion: ['1', '1.0.0', 'v1.0'],
  enumValue: ['X_jupiter', 'Original', 'X_', 'X_JUPITER_', 'original_publisher'],
  schemeValue: ['sadaic_GENRE', 'SADAIC__GENRE', '_SADAIC', 'SADAIC_', 'SADAIC-GENRE'],
  extensionKey: ['sadaic', 'ar.Sadaic.x', 'ar..x', '.ar.x'],
};

/** Los escalares de types.json que no tienen patrón: los controla `type` (y `minimum`/`maximum`) del schema. */
const UNPATTERNED = ['text', 'boolean', 'integer', 'integer>=0', 'integer>=1', 'year', 'percent'] as const;
const PATTERNED = ['instant', 'date', 'duration', 'amount', 'currency', 'sha256', 'uuid', 'localId', 'issuerId',
  'kid', 'country', 'subdivision', 'tis', 'society', 'language', 'url', 'uri', 'email', 'phone', 'mediaType',
  'fraction', 'schemaVersion'] as const;

describe('PATTERNS', () => {
  it('every pattern is the exact expression and accepts its examples', () => {
    expect(Object.keys(PATTERNS).sort()).toEqual(Object.keys(EXAMPLES).sort());
    expect(Object.keys(PATTERNS)).toHaveLength(26);
    // `source` escribe "/" como "\/".
    for (const [name, source] of Object.entries(SOURCES)) {
      expect(PATTERNS[name as PatternName].source.replaceAll('\\/', '/'), name).toBe(source);
    }
    for (const [name, examples] of Object.entries(EXAMPLES)) {
      const re = PATTERNS[name as PatternName];
      // Ajv compila `pattern` con la bandera u: la fuente tiene que valer igual así.
      expect(re.flags, name).toBe('u');
      expect(re.source.startsWith('^') && re.source.endsWith('$'), name).toBe(true);
      for (const example of examples) expect(re.test(example), `${name}: ${example}`).toBe(true);
    }
  });

  it('every pattern rejects near-misses', () => {
    for (const [name, misses] of Object.entries(NEAR_MISSES)) {
      const re = PATTERNS[name as PatternName];
      expect(misses.length, name).toBeGreaterThan(0);
      for (const miss of misses) expect(re.test(miss), `${name}: ${JSON.stringify(miss)}`).toBe(false);
      for (const example of EXAMPLES[name as PatternName]) {
        expect(re.test(`${example}\n`), `${name}: salto de línea final`).toBe(false);
      }
    }
  });

  it('enum pattern accepts X_JUPITER_STEM and rejects X_jupiter', () => {
    for (const v of ['X_JUPITER_STEM', 'X_A', 'X_A1_B2', 'originalPublisher', 'musicAndText', 'a1']) {
      expect(PATTERNS.enumValue.test(v), v).toBe(true);
    }
    for (const v of ['X_jupiter', 'X_Jupiter_Stem', 'X_JUPITER__STEM', 'SADAIC_GENRE']) {
      expect(PATTERNS.enumValue.test(v), v).toBe(false);
    }
  });

  it('scheme pattern accepts X_SADAIC_LEGACY_ID', () => {
    for (const v of ['X_SADAIC_LEGACY_ID', 'SADAIC_GENRE', 'SADAIC_ART8', 'ISWC', 'IPI_NAME', 'TAX_ID', 'DNDA_AR']) {
      expect(PATTERNS.schemeValue.test(v), v).toBe(true);
    }
    expect(PATTERNS.schemeValue.test('originalPublisher')).toBe(false);
  });

  it('SCALAR_PATTERN maps every patterned scalar and leaves text, boolean, integers, year and percent out', () => {
    // Los dos grupos cubren todo ScalarName (lo controla el typecheck).
    expectTypeOf<Exclude<ScalarName, (typeof UNPATTERNED)[number] | (typeof PATTERNED)[number]>>().toBeNever();
    expect(Object.keys(SCALAR_PATTERN).sort()).toEqual([...PATTERNED].sort());
    for (const scalar of PATTERNED) expect(SCALAR_PATTERN[scalar], scalar).toBe(scalar);
    for (const scalar of UNPATTERNED) expect(SCALAR_PATTERN, scalar).not.toHaveProperty(scalar);
  });
});
