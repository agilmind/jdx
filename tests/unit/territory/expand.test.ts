/**
 * Países (ISO 3166-1, values/countries.json), territorios TIS (values/tis.json)
 * y su expansión a países (src/territory/expand.ts). En sadaic/0.1 solo se
 * expanden 2136 (todos los países) y el código TIS de cada país, su numérico
 * ISO en 4 dígitos; otro código queda en `unknown`. Países y TIS salen de
 * schema/src/countries.source.json con scripts/gen-values.mjs, que copia los
 * nombres de la fuente sin recalcularlos.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateCountries, generateTis } from '../../../scripts/gen-values.mjs';
import { PATTERNS } from '../../../src/conventions/patterns.js';
import { files } from '../../../src/generated/data.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import { territoryExpander } from '../../../src/territory/expand.js';
import type { CountryEntry, JsonValue, TisEntry } from '../../../src/types.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

interface Source { generatedWith: Record<string, string>; countries: CountryEntry[] }
const SOURCE = JSON.parse(read('schema/src/countries.source.json')) as Source;
const COUNTRIES = JSON.parse(files['values/countries.json'] as string) as { list: string; version: string; entries: CountryEntry[] };
const TIS = JSON.parse(files['values/tis.json'] as string) as { list: string; version: string; entries: TisEntry[] };
const SCHEMAS = {
  countries: JSON.parse(files['schema/values/countries.schema.json'] as string) as object,
  tis: JSON.parse(files['schema/values/tis.schema.json'] as string) as object,
};
const errorsOf = (name: keyof typeof SCHEMAS, value: unknown) =>
  defaultValidators().validateWith(SCHEMAS[name], value as JsonValue).map((e) => [e.instanceLocation, e.keyword]);
const expander = territoryExpander(TIS.entries);
const sorted = (set: ReadonlySet<string>): string[] => [...set].sort();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('países', () => {
  it('249 countries with unique iso2 and numeric', () => {
    expect(COUNTRIES.list).toBe('countries');
    expect(COUNTRIES.version).toBe('2026-10');
    expect(COUNTRIES.entries).toHaveLength(249);
    expect(new Set(COUNTRIES.entries.map((c) => c.iso2)).size).toBe(249);
    expect(new Set(COUNTRIES.entries.map((c) => c.numeric)).size).toBe(249);
    const iso2 = COUNTRIES.entries.map((c) => c.iso2);
    expect(iso2).toEqual([...iso2].sort());
    expect(errorsOf('countries', COUNTRIES)).toEqual([]);
    expect(errorsOf('countries', { ...COUNTRIES, entries: [{ iso2: 'ARG', numeric: '32', name: { es: 'x', pt: 'x', en: 'x' } }] })).toEqual([
      ['/entries/0/iso2', 'pattern'],
      ['/entries/0/numeric', 'pattern'],
    ]);
  });

  it('each country has name es, pt and en from the committed source', () => {
    const bySource = new Map(SOURCE.countries.map((c) => [c.iso2, c]));
    for (const country of COUNTRIES.entries) {
      expect(Object.keys(country.name), country.iso2).toEqual(['es', 'pt', 'en']);
      expect(country, country.iso2).toEqual(bySource.get(country.iso2));
    }
    expect(COUNTRIES.entries.find((c) => c.iso2 === 'ES')?.name).toEqual({ es: 'España', pt: 'Espanha', en: 'Spain' });
    expect(errorsOf('countries', { ...COUNTRIES, entries: [{ iso2: 'AR', numeric: '032', name: { es: 'Argentina', en: 'Argentina' } }] })).toEqual([
      ['/entries/0/name', 'required'],
    ]);
    // Una fuente sin un nombre no genera: el generador no lo completa.
    const broken = { countries: [{ iso2: 'AR', numeric: '032', name: { es: 'Argentina', pt: '', en: 'Argentina' } }] };
    expect(() => generateCountries(broken, '2026-10')).toThrow('AR sin nombre pt en la fuente');
  });

  it('countries.source.json records the ICU version it was generated with', () => {
    expect(SOURCE.generatedWith).toEqual({
      method: "Intl.DisplayNames([lang], { type: 'region' })",
      node: '22.23.2',
      icu: '78.2',
      unicode: '17.0',
      cldr: '48.0',
    });
    expect(SOURCE.countries).toHaveLength(249);
  });

  it('gen-values does not call Intl', () => {
    const INTL = /\bIntl\b/;
    for (const line of ["new Intl.DisplayNames(['es'], { type: 'region' })", 'globalThis.Intl', "globalThis['Intl']"]) {
      expect(INTL.test(line), line).toBe(true);
    }
    for (const line of ['International', "const intl = 'es';", 'INTL']) expect(INTL.test(line), line).toBe(false);
    for (const rel of ['scripts/gen-values.mjs', 'scripts/gen.ts']) expect(INTL.test(read(rel)), rel).toBe(false);
    // Sin la API de internacionalización, el generador da los mismos bytes.
    vi.stubGlobal('Intl', undefined);
    expect(`${JSON.stringify(generateCountries(SOURCE, '2026-10'), null, 2)}\n`).toBe(files['values/countries.json']);
    expect(`${JSON.stringify(generateTis(SOURCE, '2026-10'), null, 2)}\n`).toBe(files['values/tis.json']);
  });

  it('AR is 032', () => {
    expect(COUNTRIES.entries.find((c) => c.iso2 === 'AR')).toEqual({
      iso2: 'AR',
      numeric: '032',
      name: { es: 'Argentina', pt: 'Argentina', en: 'Argentina' },
    });
  });
});

describe('TIS', () => {
  it('tis has group 2136 and 249 country entries', () => {
    expect(TIS.list).toBe('tis');
    expect(TIS.version).toBe('2026-10');
    expect(TIS.entries).toHaveLength(250);
    expect(TIS.entries.filter((e) => e.kind === 'group').map((e) => e.code)).toEqual(['2136']);
    expect(TIS.entries.filter((e) => e.kind === 'country')).toHaveLength(249);
    const codes = TIS.entries.map((e) => e.code);
    expect(codes).toEqual([...codes].sort());
    expect(errorsOf('tis', TIS)).toEqual([]);
  });

  it('2136 members are the 249 iso2 codes', () => {
    const world = TIS.entries.find((e) => e.code === '2136');
    expect(world?.members).toEqual(COUNTRIES.entries.map((c) => c.iso2));
    expect(world?.iso2).toBeUndefined();
  });

  it('country code is numeric padded to 4 (0032, 0724)', () => {
    const byIso2 = new Map(TIS.entries.filter((e) => e.kind === 'country').map((e) => [e.iso2, e]));
    expect(byIso2.get('AR')).toEqual({ code: '0032', kind: 'country', iso2: 'AR' });
    expect(byIso2.get('ES')).toEqual({ code: '0724', kind: 'country', iso2: 'ES' });
    for (const country of COUNTRIES.entries) expect(byIso2.get(country.iso2)?.code, country.iso2).toBe(`0${country.numeric}`);
    for (const entry of TIS.entries) expect(PATTERNS.tis.test(entry.code), entry.code).toBe(true);
    // Un país lleva iso2 y no members; un grupo, members y no iso2.
    const tisWith = (entry: JsonValue) => ({ list: 'tis', version: '2026-10', entries: [entry] });
    expect(errorsOf('tis', tisWith({ code: '0032', kind: 'country' }))).toEqual([['/entries/0', 'required']]);
    expect(errorsOf('tis', tisWith({ code: '0032', kind: 'country', iso2: 'AR', members: ['AR'] }))).toEqual([['/entries/0/members', 'not']]);
    expect(errorsOf('tis', tisWith({ code: '2136', kind: 'group', iso2: 'AR', members: ['AR'] }))).toEqual([['/entries/0/iso2', 'not']]);
    expect(errorsOf('tis', tisWith({ code: '32', kind: 'country', iso2: 'AR' }))).toEqual([['/entries/0/code', 'pattern']]);
  });
});

describe('expansión', () => {
  it('expand include 2136 → 249', () => {
    const { countries, unknown } = expander.expand({ include: ['2136'] });
    expect(countries.size).toBe(249);
    expect(sorted(countries)).toEqual(COUNTRIES.entries.map((c) => c.iso2));
    expect(unknown).toEqual([]);
    expect(sorted(expander.expand({ include: ['0032'] }).countries)).toEqual(['AR']);
    expect(sorted(expander.expand({ include: ['0724', '0032', '0724'] }).countries)).toEqual(['AR', 'ES']);
  });

  it('expand 2136 minus 0724 → 248 without ES', () => {
    const { countries, unknown } = expander.expand({ include: ['2136'], exclude: ['0724'] });
    expect(countries.size).toBe(248);
    expect(countries.has('ES')).toBe(false);
    expect(countries.has('AR')).toBe(true);
    expect(unknown).toEqual([]);
    expect(expander.expand({ include: ['0724'], exclude: ['2136'] }).countries.size).toBe(0);
  });

  it('unknown group 2100 → unknown', () => {
    expect(expander.expand({ include: ['2100'] })).toEqual({ countries: new Set(), unknown: ['2100'] });
    const mixed = expander.expand({ include: ['2100', '0032'] });
    expect(sorted(mixed.countries)).toEqual(['AR']);
    expect(mixed.unknown).toEqual(['2100']);
  });

  it('unknown code in exclude also reported', () => {
    const { countries, unknown } = expander.expand({ include: ['2136', '2100'], exclude: ['0999', '2100', '0724'] });
    expect(countries.size).toBe(248);
    // Una vez cada uno, en el orden en que aparecen: primero include, después exclude.
    expect(unknown).toEqual(['2100', '0999']);
  });
});
