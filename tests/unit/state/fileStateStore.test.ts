/**
 * El estado del receptor en una carpeta: state.json y su bloqueo, state.lock.
 * `update` toma el bloqueo exclusivo (crear state.lock solo si no existe),
 * relee el estado, aplica la función y escribe en un temporal que después
 * renombra: state.json siempre está entero, aunque maten al proceso. `read`
 * espera mientras exista el bloqueo y trabaja sobre lo que leyó, sin poder
 * escribirlo. Quien no consigue el bloqueo a tiempo recibe StateError locked,
 * con desde cuándo está. Varios procesos sobre la misma carpeta no pierden
 * escrituras.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parseInstant } from '../../../src/conventions/time.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import { StateError } from '../../../src/state/errors.js';
import { emptyState, fileStateStore } from '../../../src/state/fileStateStore.js';
import type { JsonValue, State } from '../../../src/types.js';
import { DECLARATION, SHA256, withReceipt } from '../../helpers/stateWorker.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORKER = fileURLToPath(new URL('../../helpers/stateWorker.ts', import.meta.url));

const dirs: string[] = [];
function stateDir(): string {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'jdx-state-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Un estado de producción con un recibo y maxSeq 3. */
function seeded(): State {
  return { ...withReceipt(emptyState('production'), 1), trust: { maxSeq: 3 } };
}
function writeState(dir: string, value: unknown): void {
  writeFileSync(join(dir, 'state.json'), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}
const stateBytes = (dir: string): string => readFileSync(join(dir, 'state.json'), 'utf8');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** El StateError con que rechaza una promesa. */
async function stateError(promise: Promise<unknown>): Promise<StateError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(StateError);
    return error as StateError;
  }
  throw new Error('no rechazó');
}

/** Corre stateWorker.ts en otro proceso; termina con su stdout. */
function worker(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', WORKER, ...args], { cwd: ROOT });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`stateWorker ${args.join(' ')} salió con ${String(code)}: ${err}`))));
  });
}

describe('fileStateStore', () => {
  it('fileStateStore(dir) works without options', async () => {
    const dir = stateDir();
    const store = fileStateStore(dir);
    const written = await store.update(async (state) => withReceipt(state, 1));
    expect(written.env).toBe('production');
    expect(await store.read(async (state) => state)).toEqual(written);
    // Lo escrito cumple jdx-state.schema.json, con dos espacios y salto final.
    const text = stateBytes(dir);
    expect(text).toBe(`${JSON.stringify(written, null, 2)}\n`);
    expect(defaultValidators().validateAux('state', JSON.parse(text) as JsonValue)).toEqual([]);
    // read devuelve lo que devuelve la función.
    expect(await store.read(async (state) => state.declarations[DECLARATION]?.receipts.length)).toBe(1);
  });

  it('missing state.json reads as emptyState() without env', async () => {
    const dir = stateDir();
    const state = await fileStateStore(dir).read(async (s) => s);
    expect(state).toEqual({ stateVersion: 1, trust: { maxSeq: 0 }, declarations: {} });
    expect(state).toEqual(emptyState());
    expect(Object.hasOwn(state, 'env')).toBe(false);
    expect(emptyState('sandbox')).toEqual({ stateVersion: 1, env: 'sandbox', trust: { maxSeq: 0 }, declarations: {} });
    // Leer no escribe nada.
    expect(readdirSync(dir)).toEqual([]);
  });

  it('update writes via temp and rename', async () => {
    const dir = stateDir();
    writeState(dir, seeded());
    const before = statSync(join(dir, 'state.json')).ino;
    const store = fileStateStore(dir);
    const written = await store.update(async (state) => {
      // Adentro de la actualización, el bloqueo existe y state.json sigue siendo el anterior.
      expect(existsSync(join(dir, 'state.lock'))).toBe(true);
      expect(JSON.parse(stateBytes(dir))).toEqual(seeded());
      return withReceipt(state, 2);
    });
    // Un archivo nuevo en el lugar del anterior (otro inodo), sin el bloqueo ni temporales.
    expect(statSync(join(dir, 'state.json')).ino).not.toBe(before);
    expect(readdirSync(dir)).toEqual(['state.json']);
    expect(JSON.parse(stateBytes(dir))).toEqual(written);
    expect(written.declarations[DECLARATION]?.receipts.map((r) => r.revision)).toEqual([1, 2]);
    // update relee: lo que escribió otro antes de tomar el bloqueo no se pierde.
    writeState(dir, withReceipt(JSON.parse(stateBytes(dir)) as State, 3));
    const again = await store.update(async (state) => withReceipt(state, 4));
    expect(again.declarations[DECLARATION]?.receipts.map((r) => r.revision)).toEqual([1, 2, 3, 4]);
  });

  it('update refuses to write a state without env', async () => {
    const dir = stateDir();
    const store = fileStateStore(dir);
    await expect(store.update(async (state) => state)).rejects.toThrow('el estado a escribir no tiene env');
    expect(readdirSync(dir)).toEqual([]);
    // Tampoco escribe un estado que no cumple su schema, y el anterior queda.
    writeState(dir, seeded());
    const before = stateBytes(dir);
    await expect(store.update(async (state) => ({ ...state, trust: { maxSeq: -1 } }))).rejects.toThrow(
      'el estado a escribir no cumple jdx-state.schema.json: /trust/maxSeq minimum',
    );
    expect(stateBytes(dir)).toBe(before);
    // Una función que lanza no escribe y suelta el bloqueo.
    await expect(store.update(async () => {
      throw new Error('falla adentro');
    })).rejects.toThrow('falla adentro');
    expect(readdirSync(dir)).toEqual(['state.json']);
    expect((await store.update(async (state) => withReceipt(state, 2))).declarations[DECLARATION]?.receipts).toHaveLength(2);
  });

  it('two processes updating concurrently lose no receipt', async () => {
    const dir = stateDir();
    const store = fileStateStore(dir);
    // Tres procesos de 15 recibos cada uno y diez actualizaciones de este, todas a la vez.
    await Promise.all([
      worker(['receipts', dir, '1', '15']),
      worker(['receipts', dir, '101', '15']),
      worker(['receipts', dir, '201', '15']),
      ...Array.from({ length: 10 }, (_, i) => store.update(async (state) => withReceipt(state, 1001 + i))),
    ]);
    const revisions = await store.read(async (state) => state.declarations[DECLARATION]?.receipts.map((r) => r.revision) ?? []);
    const expected = [
      ...Array.from({ length: 15 }, (_, i) => [1 + i, 101 + i, 201 + i]).flat(),
      ...Array.from({ length: 10 }, (_, i) => 1001 + i),
    ];
    expect(revisions).toHaveLength(55);
    expect([...revisions].sort((a, b) => a - b)).toEqual(expected.sort((a, b) => a - b));
    expect(readdirSync(dir)).toEqual(['state.json']);
  }, 60_000);

  it('concurrent max updates of maxSeq never decrease', async () => {
    const dir = stateDir();
    const sequences = ['5,3,9,1,2', '7,2,8,4', '4,6,10,0,3'];
    const outputs = await Promise.all(sequences.map((seqs) => worker(['maxSeq', dir, seqs])));
    // Cada proceso ve un maxSeq que nunca baja, y al final queda el mayor de todos.
    for (const out of outputs) {
      const seen = JSON.parse(out) as number[];
      expect(seen).toEqual([...seen].sort((a, b) => a - b));
    }
    expect(await fileStateStore(dir).read(async (state) => state.trust.maxSeq)).toBe(10);
  }, 60_000);

  it('read waits while the writer lock exists', async () => {
    const dir = stateDir();
    writeState(dir, seeded());
    writeFileSync(join(dir, 'state.lock'), '');
    const store = fileStateStore(dir, { lockTimeoutMs: 5_000 });
    let done = false;
    const started = Date.now();
    const reading = store.read(async (state) => {
      done = true;
      return state.trust.maxSeq;
    });
    await sleep(200);
    expect(done).toBe(false);
    // El que tiene el bloqueo escribe y lo suelta: read lee lo nuevo.
    writeState(dir, { ...seeded(), trust: { maxSeq: 4 } });
    unlinkSync(join(dir, 'state.lock'));
    expect(await reading).toBe(4);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    // update también espera.
    writeFileSync(join(dir, 'state.lock'), '');
    const updating = store.update(async (state) => ({ ...state, trust: { maxSeq: 5 } }));
    await sleep(100);
    expect(JSON.parse(stateBytes(dir)).trust.maxSeq).toBe(4);
    unlinkSync(join(dir, 'state.lock'));
    expect((await updating).trust.maxSeq).toBe(5);
  });

  it('lock held past the timeout → StateError locked with lockedSince', async () => {
    const dir = stateDir();
    writeState(dir, seeded());
    // El bloqueo dice desde cuándo está.
    writeFileSync(join(dir, 'state.lock'), `${JSON.stringify({ since: '2026-09-30T12:11:00.250Z', pid: 4242 })}\n`);
    const store = fileStateStore(dir, { lockTimeoutMs: 100 });
    const started = Date.now();
    const locked = await stateError(store.update(async (state) => state));
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
    expect([locked.reason, locked.details]).toEqual(['locked', { lockedSince: '2026-09-30T12:11:00.250Z' }]);
    expect(locked.message).toBe('el estado del receptor está bloqueado ({"lockedSince":"2026-09-30T12:11:00.250Z"})');
    expect((await stateError(store.read(async (state) => state))).details).toEqual({ lockedSince: '2026-09-30T12:11:00.250Z' });
    // Un bloqueo sin ese dato (vacío, a medio escribir) da la hora del archivo.
    writeFileSync(join(dir, 'state.lock'), '');
    utimesSync(join(dir, 'state.lock'), new Date('2026-09-30T12:00:00.500Z'), new Date('2026-09-30T12:00:00.500Z'));
    expect((await stateError(store.read(async (state) => state))).details).toEqual({ lockedSince: '2026-09-30T12:00:00.500Z' });
    // Nadie lo borra solo, y el estado queda como estaba.
    expect(existsSync(join(dir, 'state.lock'))).toBe(true);
    expect(JSON.parse(stateBytes(dir))).toEqual(seeded());
  });

  it('a writer killed with SIGKILL leaves state.json intact and the lock reported as locked', async () => {
    const dir = stateDir();
    writeState(dir, seeded());
    const before = stateBytes(dir);
    const started = new Date();
    // Otro proceso toma el bloqueo y lo matan adentro de la actualización.
    const child = spawn(process.execPath, ['--import', 'tsx', WORKER, 'hold', dir], { cwd: ROOT });
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('locked')) resolve();
      });
      child.on('error', reject);
      child.on('exit', (code) => reject(new Error(`stateWorker hold salió con ${String(code)}`)));
    });
    const exited = new Promise((resolve) => child.on('exit', (_code, signal) => resolve(signal)));
    child.kill('SIGKILL');
    expect(await exited).toBe('SIGKILL');
    // state.json quedó entero, sin cambios; el bloqueo quedó huérfano.
    expect(stateBytes(dir)).toBe(before);
    expect(defaultValidators().validateAux('state', JSON.parse(before) as JsonValue)).toEqual([]);
    expect(existsSync(join(dir, 'state.lock'))).toBe(true);
    // Desde ahí, leer y escribir dan locked, con la hora en que el proceso tomó el bloqueo.
    const store = fileStateStore(dir, { lockTimeoutMs: 100 });
    for (const attempt of [() => store.update(async (state) => state), () => store.read(async (state) => state)]) {
      const locked = await stateError(attempt());
      expect(locked.reason).toBe('locked');
      const since = parseInstant(String(locked.details?.lockedSince));
      expect(since).not.toBeNull();
      expect(since!.epochNanos).toBeGreaterThanOrEqual(BigInt(started.getTime() - 1000) * 1_000_000n);
      expect(since!.epochNanos).toBeLessThanOrEqual(BigInt(Date.now()) * 1_000_000n);
    }
    // Borrar el bloqueo huérfano es la recuperación: el estado sigue entero.
    unlinkSync(join(dir, 'state.lock'));
    const written = await store.update(async (state) => withReceipt(state, 2));
    expect(written.declarations[DECLARATION]?.receipts.map((r) => r.revision)).toEqual([1, 2]);
    expect(written.trust.maxSeq).toBe(3);
  }, 30_000);

  it('leftover temp files are ignored', async () => {
    const dir = stateDir();
    writeState(dir, seeded());
    // El temporal de una escritura que no llegó a renombrar, a medio escribir.
    const leftover = '.state.json.0c6f1d3e-8a4b-4f2e-9d71-5b3a2c1e0f9d.tmp';
    writeFileSync(join(dir, leftover), '{ "stateVersion": 1, "env": "produc');
    const store = fileStateStore(dir);
    expect(await store.read(async (state) => state)).toEqual(seeded());
    const written = await store.update(async (state) => withReceipt(state, 2));
    expect(JSON.parse(stateBytes(dir))).toEqual(written);
    expect(readdirSync(dir).sort()).toEqual([leftover, 'state.json']);
  });

  it('stateVersion 2 → version', async () => {
    const dir = stateDir();
    writeState(dir, { ...seeded(), stateVersion: 2 });
    const before = stateBytes(dir);
    const store = fileStateStore(dir);
    for (const attempt of [() => store.read(async (state) => state), () => store.update(async (state) => state)]) {
      const error = await stateError(attempt());
      expect([error.reason, error.details]).toEqual(['version', { stateVersion: 2 }]);
    }
    expect(stateBytes(dir)).toBe(before);
    expect(readdirSync(dir)).toEqual(['state.json']);
  });

  it('bad JSON or schema → unreadable', async () => {
    const dir = stateDir();
    const store = fileStateStore(dir);
    const unreadable = async (text: string) => {
      writeState(dir, text);
      const errors = [await stateError(store.read(async (state) => state)), await stateError(store.update(async (state) => state))];
      // update no pisa un estado que no se puede leer.
      expect(stateBytes(dir)).toBe(text);
      return errors.map((e) => [e.reason, e.details]);
    };
    expect(await unreadable('{ "stateVersion": 1,')).toEqual([['unreadable', { cause: 'syntax' }], ['unreadable', { cause: 'syntax' }]]);
    expect(await unreadable('﻿{}')).toEqual([['unreadable', { cause: 'bom' }], ['unreadable', { cause: 'bom' }]]);
    const duplicated = '{ "stateVersion": 1, "env": "production", "env": "sandbox", "trust": { "maxSeq": 0 }, "declarations": {} }';
    expect((await unreadable(duplicated))[0]).toEqual(['unreadable', { cause: 'duplicateKey' }]);
    // Sin env, con una propiedad de más o con un recibo incompleto: no cumple jdx-state.schema.json.
    const { env: _env, ...noEnv } = seeded();
    expect((await unreadable(JSON.stringify(noEnv)))[0]).toEqual(['unreadable', { cause: 'schema', at: '', keyword: 'required' }]);
    expect((await unreadable(JSON.stringify({ ...seeded(), extra: true })))[0]).toEqual(['unreadable', { cause: 'schema', at: '/extra', keyword: 'additionalProperties' }]);
    const partial = seeded();
    delete (partial.declarations[DECLARATION]?.receipts[0] as { sha256?: string }).sha256;
    expect((await unreadable(JSON.stringify(partial)))[0]).toEqual([
      'unreadable', { cause: 'schema', at: `/declarations/${DECLARATION}/receipts/0`, keyword: 'required' },
    ]);
    // Una carpeta que no existe no es un estado vacío: el receptor la crea una vez.
    const missing = join(stateDir(), 'no-existe');
    const gone = fileStateStore(missing);
    for (const attempt of [() => gone.read(async (state) => state), () => gone.update(async (state) => withReceipt(state, 1))]) {
      const error = await stateError(attempt());
      expect([error.reason, error.details]).toEqual(['unreadable', { cause: 'missingDir' }]);
    }
    expect(existsSync(missing)).toBe(false);
    // Una carpeta que es un archivo, tampoco.
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'state.json'), 'x');
    expect((await stateError(fileStateStore(join(dir, 'sub', 'state.json')).read(async (state) => state))).reason).toBe('unreadable');
  });

  it('read cannot persist mutations', async () => {
    const dir = stateDir();
    writeState(dir, seeded());
    const before = stateBytes(dir);
    const store = fileStateStore(dir);
    // Lo leído está congelado: cambiarlo lanza, y nada llega al archivo.
    await expect(store.read(async (state) => {
      (state.trust as { maxSeq: number }).maxSeq = 9;
    })).rejects.toThrow(TypeError);
    await expect(store.read(async (state) => {
      state.declarations[DECLARATION]?.receipts.push({ revision: 9, sha256: SHA256, receivedAt: '2026-09-30T09:12:00-03:00', ackStatus: 'ingested' });
    })).rejects.toThrow(TypeError);
    expect(stateBytes(dir)).toBe(before);
    // Cada lectura da su propio objeto; lo que devuelve update tampoco se puede cambiar.
    const a = await store.read(async (state) => state);
    const b = await store.read(async (state) => state);
    expect(a).not.toBe(b);
    expect(a).toEqual(seeded());
    const written = await store.update(async (state) => state);
    expect(Object.isFrozen(written.trust)).toBe(true);
    expect(Object.isFrozen(emptyState())).toBe(false);
  });
});
