/**
 * Un proceso aparte que usa el estado de una carpeta, para los tests de
 * fileStateStore con varios procesos. Se corre con
 * `node --import tsx tests/helpers/stateWorker.ts <modo> <carpeta> [args]`:
 *
 * - `receipts <carpeta> <revisión inicial> <cantidad> [largada]`: suma esa
 *   cantidad de recibos, uno por actualización, con revisiones consecutivas.
 * - `maxSeq <carpeta> <seq,seq,…> [largada]`: por cada seq, una actualización
 *   que guarda el máximo entre el guardado y el visto; al final escribe en
 *   stdout, como JSON, el maxSeq que encontró en cada una.
 * - `hold <carpeta>`: toma el bloqueo exclusivo, escribe `locked` en stdout y
 *   se queda adentro de la función de la actualización, sin terminarla, hasta
 *   que lo maten.
 *
 * Con un archivo de largada, el proceso escribe `ready` en stdout y espera a
 * que ese archivo exista para empezar: así los procesos de un test arrancan a
 * la vez, aunque cada uno tarde distinto en cargar.
 */
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileStateStore } from '../../src/state/fileStateStore.js';
import type { State } from '../../src/types.js';

export const DECLARATION = '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13';
export const SHA256 = 'ebe77bbafaa7d8a95de2419ad78150792f412050751f6a3d8e7821c2eac9954a';

/** El estado con un recibo más de DECLARATION, en producción. */
export function withReceipt(state: State, revision: number): State {
  const declaration = state.declarations[DECLARATION] ?? { receipts: [], media: [] };
  declaration.receipts.push({ revision, sha256: SHA256, receivedAt: '2026-09-30T09:12:00-03:00', ackStatus: 'rejected' });
  return { ...state, env: state.env ?? 'production', declarations: { ...state.declarations, [DECLARATION]: declaration } };
}

/** Escribe `ready` y espera a que exista el archivo de largada, si hay uno. */
async function waitForStart(start: string | undefined): Promise<void> {
  if (start === undefined) return;
  process.stdout.write('ready\n');
  while (!existsSync(start)) await new Promise((resolve) => setTimeout(resolve, 2));
}

async function main(argv: readonly string[]): Promise<void> {
  const [mode, dir, ...args] = argv;
  if (dir === undefined) throw new Error('falta la carpeta del estado');
  const store = fileStateStore(dir);
  if (mode === 'receipts') {
    const first = Number(args[0]);
    const count = Number(args[1]);
    await waitForStart(args[2]);
    for (let i = 0; i < count; i++) await store.update(async (state) => withReceipt(state, first + i));
  } else if (mode === 'maxSeq') {
    const seqs = (args[0] ?? '').split(',').map(Number);
    await waitForStart(args[1]);
    const seen: number[] = [];
    for (const seq of seqs) {
      await store.update(async (state) => {
        seen.push(state.trust.maxSeq);
        return { ...state, env: state.env ?? 'production', trust: { maxSeq: Math.max(state.trust.maxSeq, seq) } };
      });
    }
    process.stdout.write(`${JSON.stringify(seen)}\n`);
  } else if (mode === 'hold') {
    // Un intervalo mantiene vivo el proceso: una promesa sola no lo hace.
    setInterval(() => {}, 1000);
    await store.update(async () => {
      process.stdout.write('locked\n');
      return new Promise<State>(() => {});
    });
  } else {
    throw new Error(`modo desconocido: ${String(mode)}`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
