/**
 * La carpeta local de la entrega como MediaResolver: dirMediaResolver(dir,
 * { ignore }). `dir` es la raíz de la entrega, tal como la da quien llama.
 *
 * - list() recorre la carpeta entera y da cada entrada que no es una carpeta,
 *   con su ruta desde la raíz (`/` entre segmentos, cada nombre como lo
 *   muestra shownName: un byte que no es UTF-8 válido va como `\xHH`) y su
 *   tipo: `file` (un archivo regular), `symlink` (un enlace, que nunca se
 *   sigue, tampoco el que apunta a una carpeta) u `other` (un fifo, un socket
 *   o un dispositivo), en orden de nombre y en profundidad. Omite las que
 *   cumplen un patrón de `ignore` (matchDeliveryGlob).
 * - stat y sha256 buscan el path segmento por segmento en los nombres de cada
 *   carpeta: el nombre exacto y, si no está, el único que coincide sin
 *   distinguir mayúsculas de A a Z (caseVariant). Así dan lo mismo en
 *   cualquier sistema de archivos, distinga o no mayúsculas o formas de
 *   Unicode. Un enlace en cualquier segmento da `symlink` y no se sigue. Un
 *   path con un segmento vacío, `.` o `..`, o con `\`, `:` o NUL no se busca:
 *   stat da null. stat dice también dónde terminó: la ruta de esa entrada,
 *   con los nombres de la carpeta. `ignore` no los cambia.
 * - sha256 lee el archivo de a partes, abierto sin seguir enlaces y sin
 *   esperar (O_NOFOLLOW, O_NONBLOCK): nunca abre un fifo, un socket ni un
 *   dispositivo, ni lee un enlace que apareció después.
 *
 * Un resolver es una foto de la carpeta para una validación: cada carpeta se
 * lista una vez, cada entrada se mira una vez y cada archivo se lee una vez,
 * así el costo de buscar un path es el de sus segmentos. La carpeta no tiene
 * que cambiar mientras tanto; si cambia, lo que se lee no sale de ella:
 *
 * - Cada entrada se mira desde la carpeta que la listó, ya identificada por
 *   su dev e ino: en macOS por /.vol/<dev>/<ino>/<nombre>; en Linux, con la
 *   carpeta abierta y controlada (fstat y /proc/self/fd/N contra su ruta real
 *   desde la de la raíz); si no, por su ruta.
 * - Una carpeta es la misma antes y después de listarla, un archivo abierto es
 *   el que se vio (dev, ino, tamaño y fecha, y en Linux su ruta real) y se lee
 *   entero con ese tamaño, y cada entrada es del tipo que dio su listado.
 *
 * Una carpeta que no se puede usar es un MediaFolderError: la raíz que no
 * existe o no es una carpeta, algo de adentro que no se puede leer, o una
 * entrada que cambió. check() controla la raíz.
 */
import { createHash } from 'node:crypto';
import { type BigIntStats, constants, type Dirent } from 'node:fs';
import { type FileHandle, lstat, open, readdir, readlink, realpath, stat } from 'node:fs/promises';
import type { MediaResolver } from '../types.js';
import { folderFailure, MediaFolderError } from './errors.js';
import { matchDeliveryGlob } from './glob.js';
import { foldCase, shownName } from './path.js';

type EntryType = 'file' | 'symlink' | 'other';
type Kind = 'dir' | EntryType;

/** Lo que se lee de un archivo de una vez. */
const CHUNK_BYTES = 1 << 20;

const UNSAFE = /[\\:\u0000]/u;

/** Cuántas entradas se miran a la vez. */
const AT_ONCE = 64;

const SLASH = Buffer.from('/');
const FILE_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const FOLDER_FLAGS = constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0);

/** Las operaciones del sistema de archivos que usa el resolver; FOLDER_OPS son las de node:fs. */
export interface FolderOps {
  stat(path: Buffer): Promise<BigIntStats>;
  lstat(path: Buffer): Promise<BigIntStats>;
  realpath(path: Buffer): Promise<Buffer>;
  readdir(path: Buffer): Promise<Dirent<Buffer>[]>;
  open(path: Buffer, flags: number): Promise<FileHandle>;
  readlink(path: string): Promise<Buffer>;
}

export const FOLDER_OPS: FolderOps = Object.freeze({
  stat: (path: Buffer) => stat(path, { bigint: true }),
  lstat: (path: Buffer) => lstat(path, { bigint: true }),
  realpath: (path: Buffer) => realpath(path, { encoding: 'buffer' }),
  readdir: (path: Buffer) => readdir(path, { withFileTypes: true, encoding: 'buffer' }),
  open: (path: Buffer, flags: number) => open(path, flags),
  readlink: (path: string) => readlink(path, { encoding: 'buffer' }),
});

/** Cómo se llega a una entrada desde la carpeta que la listó: por su id (macOS), por la carpeta abierta (Linux) o por la ruta. */
type Anchor = 'vol' | 'proc' | 'path';

/**
 * Una entrada de la carpeta, como la listó su carpeta, con lo que se va
 * sabiendo de ella. El sistema de archivos se usa siempre con los bytes del
 * nombre; `name` es como se muestra.
 */
interface Entry {
  readonly parent: Entry | null;
  readonly bytes: Buffer;
  readonly name: string;
  readonly kind: Kind;
  /** La ruta desde la raíz ('' es la raíz) y la del sistema, armadas una vez. */
  path?: string;
  real?: Buffer;
  stats?: Promise<BigIntStats>;
  listing?: Promise<Listing>;
  hash?: Promise<string>;
  /** En Linux, la carpeta abierta mientras alguien la usa. */
  opened?: { users: number; readonly handle: Promise<FileHandle> } | undefined;
}

/** Las entradas de una carpeta, por nombre exacto y plegado. */
interface Listing { readonly entries: readonly Entry[]; readonly exact: ReadonlyMap<string, Entry>; readonly folded: ReadonlyMap<string, Entry[]> }

export function dirMediaResolver(dir: string, opts: { ignore?: readonly string[] } = {}): MediaResolver {
  return folderResolver(dir, opts, FOLDER_OPS);
}

/** dirMediaResolver con otras operaciones del sistema de archivos (las de los tests). */
export function folderResolver(dir: string, opts: { ignore?: readonly string[] }, ops: FolderOps): MediaResolver {
  const ignore = [...(opts.ignore ?? [])];
  const root: Entry = { parent: null, bytes: Buffer.alloc(0), name: '', kind: 'dir', path: '' };
  let anchor: Anchor = 'path';

  /** La raíz: tiene que existir y ser una carpeta (se sigue si es un enlace: la eligió quien llama). */
  const rooted = async (): Promise<BigIntStats> => {
    const given = Buffer.from(dir);
    let stats: BigIntStats;
    try {
      stats = await ops.stat(given);
      if (!stats.isDirectory()) throw new MediaFolderError('notDirectory', '');
      root.real = await ops.realpath(given);
    } catch (error) {
      throw folderFailure(error, '', false);
    }
    anchor = await anchorOf(root.real, stats);
    return stats;
  };

  /** Si se puede llegar a las entradas desde su carpeta ya identificada. */
  async function anchorOf(real: Buffer, stats: BigIntStats): Promise<Anchor> {
    if (process.platform === 'darwin') {
      try {
        const byId = await ops.lstat(volPath(stats));
        if (byId.isDirectory() && byId.dev === stats.dev && byId.ino === stats.ino) return 'vol';
      } catch {
        // Un volumen sin /.vol: por la ruta.
      }
    } else if (process.platform === 'linux' && constants.O_DIRECTORY !== undefined) {
      let handle: FileHandle | undefined;
      try {
        handle = await ops.open(real, FOLDER_FLAGS);
        if ((await ops.readlink(`/proc/self/fd/${handle.fd}`)).equals(real)) return 'proc';
      } catch {
        // Sin /proc: por la ruta.
      } finally {
        await handle?.close();
      }
    }
    return 'path';
  }

  /** Las entradas de una carpeta, leídas una vez. */
  const listingOf = (folder: Entry): Promise<Listing> => (folder.listing ??= readListing(folder));

  /** El lstat de una entrada, una vez, desde su carpeta; tiene que ser del tipo que dio su listado. La raíz, al empezar. */
  const statsOf = (entry: Entry): Promise<BigIntStats> => (entry.stats ??= entry === root ? rooted() : lstatOf(entry));

  /** El lstat de una entrada ahora, desde la carpeta que la listó, del tipo que dio su listado. */
  async function lstatOf(entry: Entry, at?: Buffer): Promise<BigIntStats> {
    const parent = entry.parent as Entry;
    let stats: BigIntStats;
    try {
      if (at !== undefined) stats = await ops.lstat(Buffer.concat([at, SLASH, entry.bytes]));
      else if (anchor === 'vol') stats = await ops.lstat(Buffer.concat([volPath(await statsOf(parent)), SLASH, entry.bytes]));
      else if (anchor === 'proc') stats = await withFolder(parent, (open) => ops.lstat(Buffer.concat([open, SLASH, entry.bytes])));
      else stats = await ops.lstat(realOf(entry));
    } catch (error) {
      // Sin permiso para recorrer la carpeta, la que no se puede leer es ella.
      const code = (error as NodeJS.ErrnoException).code;
      throw folderFailure(error, code === 'EACCES' || code === 'EPERM' ? pathOf(parent) : pathOf(entry), true);
    }
    if (kindOf(stats) !== entry.kind) throw new MediaFolderError('modified', pathOf(entry));
    return stats;
  }

  /** El lstat de una carpeta ahora: la raíz por su ruta real, las demás desde la suya. */
  async function lstatNow(folder: Entry): Promise<BigIntStats> {
    if (folder.parent !== null) return lstatOf(folder);
    try {
      return await ops.lstat(realOf(root));
    } catch (error) {
      throw folderFailure(error, '', true);
    }
  }

  /**
   * Corre `use` con la carpeta abierta (Linux): la abre por su ruta real sin
   * seguir un enlace y controla que sea la carpeta que ya se vio (dev e ino,
   * desde la carpeta que la listó, también abierta). `use` recibe
   * /proc/self/fd/N. Los que la piden a la vez comparten la apertura, y la
   * cierra el último.
   */
  async function withFolder<T>(folder: Entry, use: (at: Buffer) => Promise<T>): Promise<T> {
    const shared = (folder.opened ??= { users: 0, handle: openFolder(folder) });
    shared.users++;
    try {
      const handle = await shared.handle;
      return await use(Buffer.from(`/proc/self/fd/${handle.fd}`));
    } finally {
      if (--shared.users === 0) {
        folder.opened = undefined;
        await shared.handle.then((h) => h.close(), () => undefined);
      }
    }
  }

  async function openFolder(folder: Entry): Promise<FileHandle> {
    const seen = await statsOf(folder);
    let handle: FileHandle;
    try {
      handle = await ops.open(realOf(folder), FOLDER_FLAGS);
    } catch (error) {
      throw folderFailure(error, pathOf(folder), folder.parent !== null);
    }
    try {
      const opened = await handle.stat({ bigint: true });
      if (!opened.isDirectory() || !same(opened, seen)) throw new MediaFolderError('modified', pathOf(folder));
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  /**
   * Las entradas de una carpeta, que tiene que ser la misma antes y después de
   * leerla. En Linux se leen de la carpeta abierta y controlada, y las
   * carpetas de adentro se miran desde ella, así se identifican sin volver a
   * recorrer su ruta.
   */
  async function readListing(folder: Entry): Promise<Listing> {
    const seen = await statsOf(folder);
    try {
      if (anchor === 'proc') {
        return await withFolder(folder, async (at) => {
          const listing = listingRead(folder, await ops.readdir(at));
          const inner = listing.entries.filter((e) => e.kind === 'dir');
          for (let start = 0; start < inner.length; start += AT_ONCE) {
            await Promise.all(inner.slice(start, start + AT_ONCE).map((e) => (e.stats ??= lstatOf(e, at))));
          }
          return listing;
        });
      }
      const dirents = await ops.readdir(anchor === 'vol' ? volPath(seen) : realOf(folder));
      const after = await lstatNow(folder);
      if (!after.isDirectory() || !same(after, seen)) throw new MediaFolderError('modified', pathOf(folder));
      return listingRead(folder, dirents);
    } catch (error) {
      throw folderFailure(error, pathOf(folder), folder.parent !== null);
    }
  }

  /** Abre el archivo desde su carpeta, sin seguir un enlace ni esperar. */
  async function openFile(entry: Entry): Promise<FileHandle> {
    const parent = entry.parent as Entry;
    try {
      if (anchor === 'vol') return await ops.open(Buffer.concat([volPath(await statsOf(parent)), SLASH, entry.bytes]), FILE_FLAGS);
      if (anchor === 'proc') return await withFolder(parent, (at) => ops.open(Buffer.concat([at, SLASH, entry.bytes]), FILE_FLAGS));
      return await ops.open(realOf(entry), FILE_FLAGS);
    } catch (error) {
      throw folderFailure(error, pathOf(entry), true);
    }
  }

  /** El sha256 del archivo, de a partes, si al abrirlo es el mismo archivo regular que se vio y se lee entero. */
  async function hashFile(entry: Entry): Promise<string> {
    const seen = await statsOf(entry);
    const handle = await openFile(entry);
    try {
      const opened = await handle.stat({ bigint: true });
      if (!opened.isFile() || !same(opened, seen) || opened.size !== seen.size || opened.mtimeNs !== seen.mtimeNs) throw new MediaFolderError('modified', pathOf(entry));
      if (anchor === 'proc' && !(await ops.readlink(`/proc/self/fd/${handle.fd}`)).equals(realOf(entry))) throw new MediaFolderError('modified', pathOf(entry));
      const hash = createHash('sha256');
      const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
      let read = 0n;
      for (;;) {
        const { bytesRead } = await handle.read(buffer, 0, CHUNK_BYTES, null);
        if (bytesRead === 0) break;
        read += BigInt(bytesRead);
        hash.update(buffer.subarray(0, bytesRead));
      }
      if (read !== seen.size) throw new MediaFolderError('modified', pathOf(entry));
      return hash.digest('hex');
    } catch (error) {
      throw folderFailure(error, pathOf(entry), true);
    } finally {
      await handle.close();
    }
  }

  /** Dónde termina un path de la entrega: la entrada, o null si no está. */
  const resolve = async (path: string): Promise<Entry | null> => {
    const segments = path.split('/');
    if (path === '' || segments.some((s) => s === '' || s === '.' || s === '..' || UNSAFE.test(s))) return null;
    let folder = root;
    for (let i = 0; i < segments.length; i++) {
      const entry = pick(await listingOf(folder), segments[i] as string);
      if (entry === null) return null;
      if (entry.kind === 'symlink' || i === segments.length - 1) {
        await statsOf(entry);
        return entry;
      }
      if (entry.kind !== 'dir') return null;
      folder = entry;
    }
    return null;
  };

  return {
    async *list() {
      // En profundidad y en orden de nombre, con una pila (cada carpeta, sus entradas de atrás hacia adelante).
      const stack: Entry[][] = [];
      const enter = async (folder: Entry): Promise<void> => {
        const { entries } = await listingOf(folder);
        stack.push([...entries].sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0)));
      };
      await enter(root);
      while (stack.length > 0) {
        const entry = (stack[stack.length - 1] as Entry[]).pop();
        if (entry === undefined) {
          stack.pop();
          continue;
        }
        // Una carpeta se recorre; un enlace nunca se sigue.
        if (entry.kind === 'dir') await enter(entry);
        else if (!ignored(pathOf(entry))) yield { path: pathOf(entry), type: entry.kind };
      }
    },

    async stat(path) {
      const entry = await resolve(path);
      if (entry === null) return null;
      const stats = await statsOf(entry);
      return { type: entry.kind === 'dir' ? 'other' : entry.kind, size: Number(stats.size), path: pathOf(entry) };
    },

    async sha256(path) {
      const entry = await resolve(path);
      if (entry === null || entry.kind !== 'file') throw new Error(`${path}: no es un archivo regular de la entrega`);
      return (entry.hash ??= hashFile(entry));
    },

    async check() {
      await listingOf(root);
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
  const parent: Entry = { parent: null, bytes: Buffer.alloc(0), name: '', kind: 'dir' };
  return pick(listingFrom(names.map((name) => ({ parent, bytes: Buffer.from(name), name, kind: 'file' }))), segment)?.name ?? null;
}

function pick(listing: Listing, segment: string): Entry | null {
  const exact = listing.exact.get(segment);
  if (exact !== undefined) return exact;
  const variants = listing.folded.get(foldCase(segment));
  return variants?.length === 1 ? (variants[0] as Entry) : null;
}

/** Las entradas de una carpeta desde lo que dio readdir. */
function listingRead(folder: Entry, dirents: readonly Dirent<Buffer>[]): Listing {
  return listingFrom(dirents.map((d) => ({ parent: folder, bytes: d.name, name: shownName(d.name), kind: d.isDirectory() ? 'dir' : typeOf(d) })));
}

function listingFrom(entries: readonly Entry[]): Listing {
  const exact = new Map<string, Entry>();
  const folded = new Map<string, Entry[]>();
  for (const entry of entries) {
    exact.set(entry.name, entry);
    const key = foldCase(entry.name);
    const same = folded.get(key);
    if (same === undefined) folded.set(key, [entry]);
    else same.push(entry);
  }
  return { entries, exact, folded };
}

/** La ruta de una entrada desde la raíz, armada una vez. */
function pathOf(entry: Entry): string {
  if (entry.path === undefined) {
    const parent = pathOf(entry.parent as Entry);
    entry.path = parent === '' ? entry.name : `${parent}/${entry.name}`;
  }
  return entry.path;
}

/** La ruta de una entrada en el sistema, con los bytes de cada nombre, desde la ruta real de la raíz. */
function realOf(entry: Entry): Buffer {
  return (entry.real ??= Buffer.concat([realOf(entry.parent as Entry), SLASH, entry.bytes]));
}

/** La carpeta por su id en macOS. */
function volPath(stats: BigIntStats): Buffer {
  return Buffer.from(`/.vol/${stats.dev}/${stats.ino}`);
}

function same(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

function kindOf(stats: BigIntStats): Kind {
  return stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : stats.isSymbolicLink() ? 'symlink' : 'other';
}

/** El tipo de una entrada que no es una carpeta. */
function typeOf(entry: Dirent<Buffer>): EntryType {
  return entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'symlink' : 'other';
}
