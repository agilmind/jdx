/**
 * El renombre del temporal sobre state.json. En Windows otro programa (un
 * antivirus, un indexador) puede tener abierto state.json un instante y el
 * renombre da EPERM, EACCES o EBUSY: fileStateStore lo reintenta unas veces,
 * en menos de medio segundo. Si sigue, o con otra falla, lanza, borra el
 * temporal y suelta el bloqueo, y state.json queda como estaba.
 */
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState, fileStateStore } from '../../../src/state/fileStateStore.js';
import { DECLARATION, withReceipt } from '../../helpers/stateWorker.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const rename = vi.mocked(fsPromises.rename);
const failing = (code: string) => Object.assign(new Error(`${code}: rename`), { code });

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(realpathSync(tmpdir()), 'jdx-rename-'));
  writeFileSync(join(dir, 'state.json'), `${JSON.stringify(withReceipt(emptyState('production'), 1), null, 2)}\n`);
  rename.mockClear();
  rename.mockImplementation(actual.rename);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('renombre del estado', () => {
  it('rename is retried briefly on EPERM, EACCES and EBUSY', async () => {
    rename.mockRejectedValueOnce(failing('EPERM')).mockRejectedValueOnce(failing('EACCES')).mockRejectedValueOnce(failing('EBUSY'));
    const written = await fileStateStore(dir).update(async (state) => withReceipt(state, 2));
    expect(rename).toHaveBeenCalledTimes(4);
    expect(written.declarations[DECLARATION]?.receipts.map((r) => r.revision)).toEqual([1, 2]);
    expect(readdirSync(dir)).toEqual(['state.json']);
  });

  it('after the retries, or with another error, update fails and leaves state.json as it was', async () => {
    const before = readFileSync(join(dir, 'state.json'), 'utf8');
    const store = fileStateStore(dir);
    rename.mockRejectedValue(failing('EPERM'));
    const started = Date.now();
    await expect(store.update(async (state) => withReceipt(state, 2))).rejects.toThrow('EPERM: rename');
    // Cinco reintentos, con esperas de 10, 20, 40, 80 y 160 ms.
    expect(rename).toHaveBeenCalledTimes(6);
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);
    expect(Date.now() - started).toBeLessThan(5_000);
    // Sin temporal y sin bloqueo.
    expect(readdirSync(dir)).toEqual(['state.json']);
    expect(readFileSync(join(dir, 'state.json'), 'utf8')).toBe(before);
    // Otra falla no se reintenta.
    rename.mockClear();
    rename.mockRejectedValueOnce(failing('ENOSPC'));
    await expect(store.update(async (state) => withReceipt(state, 2))).rejects.toThrow('ENOSPC: rename');
    expect(rename).toHaveBeenCalledTimes(1);
    expect(readdirSync(dir)).toEqual(['state.json']);
    rename.mockImplementation(actual.rename);
    expect((await store.update(async (state) => withReceipt(state, 2))).declarations[DECLARATION]?.receipts).toHaveLength(2);
  });
});
