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
import { lstat, open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { MediaResolver } from '../types.js';
import { folderFailure, MediaFolderError } from './errors.js';
import { matchDeliveryGlob } from './glob.js';
import { foldCase } from './path.js';

type EntryType = 'file' | 'symlink' | 'other';

/** Lo que se lee de un archivo de una vez. */
const CHUNK_BYTES = 1 << 20;

/** Los nombres de una carpeta, exactos y plegados. */
interface Listing { readonly entries: readonly Dirent[]; readonly exact: ReadonlySet<string>; readonly folded: ReadonlyMap<string, string[]> }


const UNSAFE = /[\\:\u0000]/u;

export function dirMediaResolver(dir: string, opts: { ignore?: readonly string[] } = {}): MediaResolver {
  const ignore = [...(opts.ignore ?? [])];
  const listings = new Map<string, Promise<Listing>>();
  const hashes = new Map<string, Promise<string>>();
  const real = (path: string) => (path === '' ? dir : join(dir, ...path.split('/')));

  /** Los nombres de la carpeta de la entrega `path` ('' es la raíz), leídos una vez. */
  const listingOf = (path: string): Promise<Listing> => {
    let listing = listings.get(path);
    if (listing === undefined) {
      listing = (path === '' ? checked() : Promise.resolve()).then(() => readListing(real(path), path));
      listings.set(path, listing);
    }
    return listing;
  };
  let root: Promise<void> | undefined;
  /** La raíz: tiene que existir y ser una carpeta (se sigue si es un enlace: la eligió quien llama). */
  const checked = (): Promise<void> => (root ??= stat(dir).then(
    (stats) => {
      if (!stats.isDirectory()) throw new MediaFolderError('notDirectory', '');
    },
    (error: unknown) => {
      throw folderFailure(error, '', false);
    },
  ));

  /** Dónde termina un path de la entrega: la ruta real hasta ahí y su lstat, o null si no está. */
  const resolve = async (path: string): Promise<{ path: string; stats: BigIntStats } | null> => {
    const segments = path.split('/');
    if (path === '' || segments.some((s) => s === '' || s === '.' || s === '..' || UNSAFE.test(s))) return null;
    let at = '';
    for (let i = 0; i < segments.length; i++) {
      const listing = await listingOf(at);
      const name = pick(listing, segments[i] as string);
      if (name === null) return null;
      const parent = at;
      at = at === '' ? name : `${at}/${name}`;
      const stats = await lstatListed(real(at), at, parent);
      if (stats.isSymbolicLink() || i === segments.length - 1) return { path: at, stats };
      if (!stats.isDirectory()) return null;
    }
    return null;
  };

  return {
    async *list() {
      // En profundidad y en orden de nombre, con una pila (cada carpeta, sus entradas de atrás hacia adelante).
      const stack: { prefix: string; entries: Dirent[] }[] = [];
      const enter = async (prefix: string): Promise<void> => {
        const listing = await listingOf(prefix);
        stack.push({ prefix, entries: [...listing.entries].sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0)) });
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
        // Una carpeta se recorre; un enlace nunca se sigue.
        if (entry.isDirectory()) await enter(path);
        else if (!ignored(path)) yield { path, type: typeOf(entry) };
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
        hash = hashFile(real(found.path), stats, found.path);
        hashes.set(key, hash);
      }
      return hash;
    },

    async check() {
      await listingOf('');
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

/** Los nombres de la carpeta `shown` de la entrega; si no se puede leer, la falla de la carpeta. */
async function readListing(path: string, shown: string): Promise<Listing> {
  try {
    return listingFrom(await readdir(path, { withFileTypes: true }));
  } catch (error) {
    throw folderFailure(error, shown, shown !== '');
  }
}

/** El tipo de una entrada que no es una carpeta. */
function typeOf(entry: Dirent): EntryType {
  return entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'symlink' : 'other';
}

/**
 * El lstat de una entrada que la carpeta `parent` listó: si dejó de estar, la
 * carpeta cambió; sin permiso, la carpeta que no se puede recorrer es `parent`.
 */
async function lstatListed(path: string, shown: string, parent: string): Promise<BigIntStats> {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw folderFailure(error, code === 'EACCES' || code === 'EPERM' ? parent : shown, true);
  }
}

/** El sha256 del archivo, de a partes, si al abrirlo es el mismo archivo regular que se encontró. */
async function hashFile(path: string, found: BigIntStats, shown: string): Promise<string> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    throw folderFailure(error, shown, true);
  }
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.dev !== found.dev || opened.ino !== found.ino) throw new MediaFolderError('modified', shown);
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
