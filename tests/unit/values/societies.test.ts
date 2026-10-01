/**
 * Sociedades (values/societies.json): por defecto, SADAIC
 * con su código CISAC verificado (061) y los cinco códigos de JDX para las
 * sociedades sin código CISAC (X_JDX_<SIGLA>). Si CISAC asigna después un
 * código, la entrada de JDX gana `replacedBy` y su código sigue valiendo.
 */
import { describe, expect, it } from 'vitest';
import { PATTERNS } from '../../../src/conventions/patterns.js';
import { files } from '../../../src/generated/data.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { JsonValue, SocietyEntry } from '../../../src/types.js';

const SOCIETIES = JSON.parse(files['values/societies.json'] as string) as { list: string; version: string; entries: SocietyEntry[] };
const SCHEMA = JSON.parse(files['schema/values/societies.schema.json'] as string) as object;
const errorsOf = (value: unknown) => defaultValidators().validateWith(SCHEMA, value as JsonValue).map((e) => [e.instanceLocation, e.keyword]);
const withEntries = (entries: JsonValue[]) => ({ list: 'societies', version: '2026-10', entries });
const byCode = (code: string) => SOCIETIES.entries.find((s) => s.code === code);

describe('sociedades', () => {
  it('061 SADAIC with cisac true', () => {
    expect(byCode('061')).toEqual({ code: '061', name: 'SADAIC', country: 'AR', cisac: true });
    expect(SOCIETIES.entries.filter((s) => s.cisac).map((s) => s.code)).toEqual(['061']);
  });

  it('five X_JDX_ codes with cisac false', () => {
    const jdx = SOCIETIES.entries.filter((s) => s.code.startsWith('X_JDX_'));
    expect(jdx.map((s) => s.code)).toEqual(['X_JDX_AADI', 'X_JDX_ACINPRO', 'X_JDX_CAPIF', 'X_JDX_SONIEM', 'X_JDX_SUDEI']);
    for (const society of jdx) {
      expect(society.cisac, society.code).toBe(false);
      expect(society.name, society.code).toBe(society.code.slice('X_JDX_'.length));
      expect(society.replacedBy, society.code).toBeUndefined();
    }
  });

  it('society codes match the pattern', () => {
    for (const society of SOCIETIES.entries) expect(PATTERNS.society.test(society.code), society.code).toBe(true);
    expect(errorsOf(SOCIETIES)).toEqual([]);
    // Un código CISAC tiene 3 dígitos, y uno de JDX lleva X_JDX_.
    expect(errorsOf(withEntries([{ code: 'X_JDX_FOO', name: 'FOO', cisac: true }]))).toEqual([['/entries/0/code', 'pattern']]);
    expect(errorsOf(withEntries([{ code: '123', name: 'FOO', cisac: false }]))).toEqual([['/entries/0/code', 'pattern']]);
    expect(errorsOf(withEntries([{ code: 'X_OTHER_FOO', name: 'FOO', cisac: false }]))).toEqual([
      ['/entries/0/code', 'pattern'],
      ['/entries/0/code', 'pattern'],
    ]);
    expect(errorsOf(withEntries([{ code: 'X_JDX_AADI', name: 'AADI', cisac: 'no' }]))).toEqual([['/entries/0/cisac', 'type']]);
  });

  it('a replacedBy entry keeps its code valid', () => {
    // CISAC le asigna el 123 a AADI: la entrada de JDX gana replacedBy y sigue en la lista, al lado de la nueva.
    const entries = [
      ...SOCIETIES.entries.map((s) => (s.code === 'X_JDX_AADI' ? { ...s, replacedBy: '123' } : s)),
      { code: '123', name: 'AADI', country: 'AR', cisac: true },
    ] as unknown as JsonValue[];
    expect(errorsOf(withEntries(entries))).toEqual([]);
    expect(entries.map((s) => (s as { code: string }).code)).toContain('X_JDX_AADI');
    // replacedBy es un código CISAC, y solo lo lleva una entrada de JDX.
    expect(errorsOf(withEntries([{ code: 'X_JDX_AADI', name: 'AADI', cisac: false, replacedBy: 'X_JDX_OTHER' }]))).toEqual([
      ['/entries/0/replacedBy', 'pattern'],
    ]);
    expect(errorsOf(withEntries([{ code: '061', name: 'SADAIC', cisac: true, replacedBy: '062' }]))).toEqual([['/entries/0/replacedBy', 'not']]);
  });

  it('six entries by default', () => {
    expect(SOCIETIES.list).toBe('societies');
    expect(SOCIETIES.version).toBe('2026-10');
    expect(SOCIETIES.entries.map((s) => s.code)).toEqual(['061', 'X_JDX_AADI', 'X_JDX_ACINPRO', 'X_JDX_CAPIF', 'X_JDX_SONIEM', 'X_JDX_SUDEI']);
    expect(new Set(SOCIETIES.entries.map((s) => s.code)).size).toBe(6);
  });
});
