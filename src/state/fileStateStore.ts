/**
 * El estado del receptor en una carpeta: `state.json` y su bloqueo,
 * `state.lock`.
 *
 * - `update` toma el bloqueo exclusivo: crea `state.lock` solo si no existe
 *   (apertura exclusiva) y anota adentro desde cuándo lo tiene. Con el
 *   bloqueo, relee el estado, aplica la función y escribe el resultado en un
 *   temporal oculto de la misma carpeta, que después renombra sobre
 *   `state.json`; al final borra el bloqueo, también si la función lanza.
 *   Así `state.json` siempre está entero: el de antes o el nuevo.
 * - `read` espera mientras exista `state.lock` y trabaja sobre lo que leyó,
 *   congelado: no puede escribirlo.
 * - Quien no consigue el bloqueo (o no ve la carpeta libre) en
 *   `lockTimeoutMs` (30 s) recibe `StateError('locked')` con `lockedSince`:
 *   lo que anotó quien lo tomó o, si no se puede leer, la hora del archivo.
 *   Un bloqueo que quedó de un proceso que murió no se borra solo: el
 *   receptor lo borra después de ver que no corre ninguna validación.
 * - Sin `state.json` el estado es `emptyState()`, sin entorno: lo fija la
 *   primera escritura. `update` no escribe un estado sin `env` ni uno que no
 *   cumple jdx-state.schema.json, y no pisa uno que no se puede leer.
 * - Un `state.json` que no es I-JSON o no cumple su schema da
 *   `StateError('unreadable')`; uno de otra `stateVersion`,
 *   `StateError('version')`. Una carpeta que no existe no es un estado
 *   vacío: también da `unreadable`.
 * - Los temporales que dejó una escritura interrumpida no se leen nunca.
 */
import { randomUUID } from 'node:crypto';
import { open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { parseInstant } from '../conventions/time.js';
import { parseJson } from '../json/parse.js';
import { defaultValidators } from '../schema/validators.js';
import type { Env, JsonValue, SchemaValidators, State, StateStore } from '../types.js';
import { StateError } from './errors.js';

export const STATE_FILE = 'state.json';
export const LOCK_FILE = 'state.lock';
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const POLL_MS = 25;

export interface FileStateStoreOptions { lockTimeoutMs?: number; validators?: SchemaValidators }

/** Un estado nuevo; sin `env`, el de una carpeta donde nunca se escribió. */
export function emptyState(env?: Env): State {
  return env === undefined
    ? { stateVersion: 1, trust: { maxSeq: 0 }, declarations: {} }
    : { stateVersion: 1, env, trust: { maxSeq: 0 }, declarations: {} };
}

export function fileStateStore(dir: string, opts: FileStateStoreOptions = {}): StateStore {
  const timeout = opts.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const validators = (): SchemaValidators => opts.validators ?? defaultValidators();
  const lockPath = join(dir, LOCK_FILE);
  return {
    async read<T>(fn: (state: State) => Promise<T>): Promise<T> {
      await waitWhileLocked(lockPath, timeout);
      return fn(deepFreeze(await load(dir, validators())));
    },
    async update(fn: (state: State) => Promise<State>): Promise<State> {
      await acquire(lockPath, timeout);
      try {
        const next = await fn(await load(dir, validators()));
        const text = checked(next, validators());
        await writeAtomically(dir, text);
        return deepFreeze(JSON.parse(text) as State);
      } finally {
        await unlink(lockPath).catch(() => {});
      }
    },
  };
}

/** El estado de la carpeta, controlado; sin state.json, emptyState(). */
async function load(dir: string, validators: SchemaValidators): Promise<State> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(join(dir, STATE_FILE));
  } catch (error) {
    if (codeOf(error) === 'ENOENT' && (await isDirectory(dir))) return emptyState();
    throw new StateError('unreadable', { cause: (await isDirectory(dir)) ? (codeOf(error) ?? 'read') : 'missingDir' });
  }
  const parsed = parseJson(bytes);
  if (!parsed.ok) throw new StateError('unreadable', { cause: parsed.failures[0]?.reason ?? 'syntax' });
  const value = parsed.json.value;
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.hasOwn(value, 'stateVersion') && value.stateVersion !== 1) {
    throw new StateError('version', { stateVersion: value.stateVersion as JsonValue });
  }
  const errors = validators.validateAux('state', value);
  const first = errors[0];
  if (first !== undefined) throw new StateError('unreadable', { cause: 'schema', at: first.instanceLocation, keyword: first.keyword });
  return value as unknown as State;
}

/** El texto del estado a escribir; lanza si no tiene env o no cumple su schema (un error de quien llama). */
function checked(next: State, validators: SchemaValidators): string {
  if (typeof next !== 'object' || next === null || next.env === undefined) {
    throw new Error('el estado a escribir no tiene env: lo fija quien escribe (validate con su env, ack con el del reporte)');
  }
  const errors = validators.validateAux('state', next as unknown as JsonValue);
  if (errors.length > 0) {
    throw new Error(`el estado a escribir no cumple jdx-state.schema.json: ${errors.map((e) => `${e.instanceLocation || '/'} ${e.keyword}`).join('; ')}`);
  }
  return `${JSON.stringify(next, null, 2)}\n`;
}

/** Temporal oculto en la misma carpeta, a disco, y renombre sobre state.json. */
async function writeAtomically(dir: string, text: string): Promise<void> {
  const temp = join(dir, `.${STATE_FILE}.${randomUUID()}.tmp`);
  try {
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, join(dir, STATE_FILE));
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
  // Que el renombre también quede en disco; no todos los sistemas abren una carpeta.
  try {
    const folder = await open(dir, 'r');
    await folder.sync().finally(() => folder.close());
  } catch {
    // Sin sync de la carpeta, el renombre igual es atómico.
  }
}

/** Toma el bloqueo exclusivo: crea state.lock con desde cuándo, o espera a que lo suelten. */
async function acquire(lockPath: string, timeout: number): Promise<void> {
  const started = Date.now();
  for (;;) {
    let handle;
    try {
      handle = await open(lockPath, 'wx');
    } catch (error) {
      if (codeOf(error) !== 'EEXIST') throw new StateError('unreadable', { cause: (await isDirectory(join(lockPath, '..'))) ? (codeOf(error) ?? 'lock') : 'missingDir' });
      await waitOrGiveUp(lockPath, started, timeout);
      continue;
    }
    try {
      await handle.writeFile(`${JSON.stringify({ since: new Date().toISOString(), pid: process.pid })}\n`, 'utf8');
    } finally {
      await handle.close();
    }
    return;
  }
}

/** Espera mientras exista state.lock. */
async function waitWhileLocked(lockPath: string, timeout: number): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      await stat(lockPath);
    } catch (error) {
      if (codeOf(error) === 'ENOENT') return;
      throw new StateError('unreadable', { cause: codeOf(error) ?? 'lock' });
    }
    await waitOrGiveUp(lockPath, started, timeout);
  }
}

/** Una pausa corta, o StateError('locked') si ya pasó el tiempo. */
async function waitOrGiveUp(lockPath: string, started: number, timeout: number): Promise<void> {
  const left = timeout - (Date.now() - started);
  if (left <= 0) {
    const since = await lockedSince(lockPath);
    // Si el bloqueo se soltó justo ahora, se intenta una vez más.
    if (since !== null) throw new StateError('locked', { lockedSince: since });
    return;
  }
  // Con algo de azar, para que dos procesos que esperan no se turnen siempre igual.
  await new Promise((resolve) => setTimeout(resolve, Math.min(left, POLL_MS + Math.floor(Math.random() * POLL_MS))));
}

/** Desde cuándo está el bloqueo: lo que anotó quien lo tomó o la hora del archivo; null si ya no está. */
async function lockedSince(lockPath: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(lockPath, 'utf8')) as { since?: unknown };
    if (typeof parsed.since === 'string' && parseInstant(parsed.since) !== null) return parsed.since;
  } catch {
    // Vacío, a medio escribir o ilegible: vale la hora del archivo.
  }
  try {
    return new Date((await stat(lockPath)).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function codeOf(error: unknown): string | undefined {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : undefined;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
