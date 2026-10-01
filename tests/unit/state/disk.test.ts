/**
 * Las fallas del disco, simuladas sobre node:fs/promises.
 *
 * - El renombre del temporal sobre state.json: en Windows otro programa (un
 *   antivirus, un indexador) puede tener abierto state.json un instante y el
 *   renombre da EPERM, EACCES o EBUSY. fileStateStore lo reintenta unas
 *   veces, en menos de medio segundo; si sigue, o con otra falla, lanza,
 *   borra el temporal y suelta el bloqueo, y state.json queda como estaba.
 * - Un estado que no se puede leer dice por qué: falta permiso (`permission`,
 *   también con un disco de solo lectura), state.lock no se puede crear
 *   (`lock`) u otra falla al leer state.json (`io`), con el código.
 */
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateError } from '../../../src/state/errors.js';
import { emptyState, fileStateStore } from '../../../src/state/fileStateStore.js';
import { DECLARATION, withReceipt } from '../../helpers/stateWorker.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename), open: vi.fn(actual.open), readFile: vi.fn(actual.readFile) };
});

const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const rename = vi.mocked(fsPromises.rename);
const open = vi.mocked(fsPromises.open);
const readFile = vi.mocked(fsPromises.readFile);
const failing = (code: string, what = 'rename') => Object.assign(new Error(`${code}: ${what}`), { code });

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(realpathSync(tmpdir()), 'jdx-rename-'));
  writeFileSync(join(dir, 'state.json'), `${JSON.stringify(withReceipt(emptyState('production'), 1), null, 2)}\n`);
  rename.mockClear();
  rename.mockImplementation(actual.rename);
  open.mockImplementation(actual.open);
  readFile.mockImplementation(actual.readFile);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('fallas del disco', () => {
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

  it('an unreadable state says why: permission, lock or another disk failure, with its code', async () => {
    const store = fileStateStore(dir);
    const details = async (attempt: () => Promise<unknown>) => {
      const error = await attempt().then(() => null, (e: unknown) => e as StateError);
      expect(error).toBeInstanceOf(StateError);
      return [error?.reason, error?.details];
    };
    const onFile = (name: string, code: string) => (path: unknown, ...rest: unknown[]) =>
      String(path).endsWith(name) ? Promise.reject(failing(code, name)) : (actual.readFile as (...a: unknown[]) => Promise<never>)(path, ...rest);
    // Leer state.json sin permiso, o de un disco que falla.
    readFile.mockImplementation(onFile('state.json', 'EACCES') as typeof actual.readFile);
    expect(await details(() => store.read(async (state) => state))).toEqual(['unreadable', { cause: 'permission', code: 'EACCES' }]);
    readFile.mockImplementation(onFile('state.json', 'EIO') as typeof actual.readFile);
    expect(await details(() => store.read(async (state) => state))).toEqual(['unreadable', { cause: 'io', code: 'EIO' }]);
    readFile.mockImplementation(actual.readFile);
    // Crear state.lock en un disco de solo lectura, o sin lugar.
    const openLock = (code: string) => ((path: unknown, ...rest: unknown[]) =>
      String(path).endsWith('state.lock') ? Promise.reject(failing(code, 'open')) : (actual.open as (...a: unknown[]) => Promise<never>)(path, ...rest)) as typeof actual.open;
    open.mockImplementation(openLock('EROFS'));
    expect(await details(() => store.update(async (state) => state))).toEqual(['unreadable', { cause: 'permission', code: 'EROFS' }]);
    open.mockImplementation(openLock('ENOSPC'));
    expect(await details(() => store.update(async (state) => state))).toEqual(['unreadable', { cause: 'lock', code: 'ENOSPC' }]);
    open.mockImplementation(actual.open);
    expect(readdirSync(dir)).toEqual(['state.json']);
  });
});
