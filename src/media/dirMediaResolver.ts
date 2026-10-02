/**
 * La carpeta local de la entrega como MediaResolver: dirMediaResolver(dir,
 * { ignore }). `dir` es la raíz de la entrega, tal como la da quien llama.
 *
 * - list() recorre la carpeta entera y da cada entrada que no es una carpeta,
 *   con su ruta desde la raíz (`/` entre segmentos) y su tipo: `file` (un
 *   archivo regular), `symlink` (un enlace, que nunca se sigue, tampoco el
 *   que apunta a una carpeta) u `other` (un fifo, un socket, un dispositivo,
 *   o una carpeta que no se puede leer), en orden de nombre y en profundidad.
 *   Omite las que cumplen un patrón de `ignore` (matchDeliveryGlob).
 * - stat y sha256 buscan el path segmento por segmento en los nombres de cada
 *   carpeta: el nombre exacto y, si no está, el único que coincide sin
 *   distinguir mayúsculas de A a Z (caseVariant). Así dan lo mismo en
 *   cualquier sistema de archivos, distinga o no mayúsculas o formas de
 *   Unicode. Un enlace en cualquier segmento da `symlink` y no se sigue; una
 *   carpeta que no se puede leer, `other`. Un path con un segmento vacío, `.`
 *   o `..`, o con `\`, `:` o NUL no se busca: stat da null. `ignore` no los
 *   cambia.
 * - sha256 lee el archivo de a partes, abierto sin seguir enlaces y sin
 *   esperar (O_NOFOLLOW, O_NONBLOCK), y controla con fstat que es un archivo
 *   regular y el mismo que encontró: nunca abre un fifo, un socket ni un
 *   dispositivo, ni lee un enlace que apareció después. Cada archivo se lee
 *   una vez por resolver.
 *
 * Un resolver es una foto de la carpeta para una validación: los nombres de
 * cada carpeta se leen una vez.
 */
import { createHash } from 'node:crypto';
import { type BigIntStats, constants, type Dirent } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { MediaResolver } from '../types.js';
import { matchDeliveryGlob } from './glob.js';
import { foldCase } from './path.js';

type EntryType = 'file' | 'symlink' | 'other';

/** Lo que se lee de un archivo de una vez. */
const CHUNK_BYTES = 1 << 20;

/** Los nombres de una carpeta, exactos y plegados; null si no se puede leer. */
interface Listing { readonly entries: readonly Dirent[]; readonly exact: ReadonlySet<string>; readonly folded: ReadonlyMap<string, string[]> }

/** Una carpeta que no se puede leer cuenta como una entrada `other`: no se entra. */
const UNREADABLE = new Set(['EACCES', 'EPERM', 'ENAMETOOLONG', 'ELOOP']);
/** Lo que no está, o dejó de estar, en el camino. */
const MISSING = new Set(['ENOENT', 'ENOTDIR', 'ENAMETOOLONG']);

const UNSAFE = /[\\:\u0000]/u;

export function dirMediaResolver(dir: string, opts: { ignore?: readonly string[] } = {}): MediaResolver {
  const ignore = [...(opts.ignore ?? [])];
  const listings = new Map<string, Promise<Listing | null>>();
  const hashes = new Map<string, Promise<string>>();
  const real = (path: string) => (path === '' ? dir : join(dir, ...path.split('/')));

  /** Los nombres de la carpeta de la entrega `path` ('' es la raíz), leídos una vez. */
  const listingOf = (path: string): Promise<Listing | null> => {
    let listing = listings.get(path);
    if (listing === undefined) {
      listing = readListing(real(path), path === '');
      listings.set(path, listing);
    }
    return listing;
  };

  /** Dónde termina un path de la entrega: la ruta real hasta ahí y su lstat, o null si no está. */
  const resolve = async (path: string): Promise<{ path: string; stats: BigIntStats } | null> => {
    const segments = path.split('/');
    if (path === '' || segments.some((s) => s === '' || s === '.' || s === '..' || UNSAFE.test(s))) return null;
    let at = '';
    for (let i = 0; i < segments.length; i++) {
      const listing = await listingOf(at);
      // Una carpeta que no se puede leer: el path se detiene en ella.
      if (listing === null) return { path: at, stats: await lstat(real(at), { bigint: true }) };
      const name = pick(listing, segments[i] as string);
      if (name === null) return null;
      at = at === '' ? name : `${at}/${name}`;
      const stats = await lstatOrNull(real(at));
      if (stats === null) return null;
      if (stats.isSymbolicLink() || i === segments.length - 1) return { path: at, stats };
      if (!stats.isDirectory()) return null;
    }
    return null;
  };

  return {
    async *list() {
      // En profundidad y en orden de nombre, con una pila (cada carpeta, sus entradas de atrás hacia adelante).
      const stack: { prefix: string; entries: Dirent[] }[] = [];
      const enter = async (prefix: string): Promise<boolean> => {
        const listing = await listingOf(prefix);
        if (listing === null) return false;
        stack.push({ prefix, entries: [...listing.entries].sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0)) });
        return true;
      };
      await enter('');
      while (stack.length > 0) {
        const top = stack[stack.length - 1] as { prefix: string; entries: Dirent[] };
        const entry = top.entries.pop();
        if (entry === undefined) {
          stack.pop();
          continue;
        }
        const path = top.prefix === '' ? entry.name : `${top.prefix}/${entry.name}`;
        // Una carpeta se recorre; una que no se puede leer es una entrada más. Un enlace nunca se sigue.
        const type = entry.isDirectory() ? ((await enter(path)) ? null : 'other') : typeOf(entry);
        if (type !== null && !ignored(path)) yield { path, type };
      }
    },

    async stat(path) {
      const found = await resolve(path);
      if (found === null) return null;
      const { stats } = found;
      return { type: stats.isSymbolicLink() ? 'symlink' : stats.isFile() ? 'file' : 'other', size: Number(stats.size) };
    },

    async sha256(path) {
      const found = await resolve(path);
      if (found === null || !found.stats.isFile()) throw new Error(`${path}: no es un archivo regular de la entrega`);
      const { stats } = found;
      const key = `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}`;
      let hash = hashes.get(key);
      if (hash === undefined) {
        hash = hashFile(real(found.path), stats, path);
        hashes.set(key, hash);
      }
      return hash;
    },
  };

  function ignored(path: string): boolean {
    return ignore.some((pattern) => matchDeliveryGlob(pattern, path));
  }
}

/**
 * El nombre de una carpeta para un segmento: el exacto, o el único que
 * coincide sin distinguir mayúsculas de A a Z, o ninguno.
 */
export function caseVariant(names: readonly string[], segment: string): string | null {
  return pick(listingFrom(names.map((name) => ({ name }) as Dirent)), segment);
}

function pick(listing: Listing, segment: string): string | null {
  if (listing.exact.has(segment)) return segment;
  const variants = listing.folded.get(foldCase(segment));
  return variants?.length === 1 ? (variants[0] as string) : null;
}

function listingFrom(entries: readonly Dirent[]): Listing {
  const exact = new Set<string>();
  const folded = new Map<string, string[]>();
  for (const { name } of entries) {
    exact.add(name);
    const key = foldCase(name);
    const same = folded.get(key);
    if (same === undefined) folded.set(key, [name]);
    else same.push(name);
  }
  return { entries, exact, folded };
}

/** Los nombres de una carpeta; null si no se puede leer y no es la raíz (la raíz que falta es un error de quien llama). */
async function readListing(path: string, root: boolean): Promise<Listing | null> {
  try {
    return listingFrom(await readdir(path, { withFileTypes: true }));
  } catch (error) {
    if (!root && UNREADABLE.has((error as NodeJS.ErrnoException).code ?? '')) return null;
    throw error;
  }
}

/** El tipo de una entrada que no es una carpeta. */
function typeOf(entry: Dirent): EntryType {
  return entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'symlink' : 'other';
}

async function lstatOrNull(path: string): Promise<BigIntStats | null> {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    if (MISSING.has((error as NodeJS.ErrnoException).code ?? '')) return null;
    throw error;
  }
}

/** El sha256 del archivo, de a partes, si al abrirlo es el mismo archivo regular que se encontró. */
async function hashFile(path: string, found: BigIntStats, shown: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.dev !== found.dev || opened.ino !== found.ino) throw new Error(`${shown}: no es un archivo regular de la entrega`);
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, CHUNK_BYTES, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}
