/**
 * La carpeta local de la entrega como MediaResolver: dirMediaResolver(dir,
 * { ignore }). `dir` es la raíz de la entrega, tal como la da quien llama.
 *
 * - list() recorre la carpeta entera y da cada entrada que no es una carpeta,
 *   con su ruta desde la raíz (`/` entre segmentos, cada nombre como lo
 *   muestra shownName: un byte que no es UTF-8 válido va como `\xHH`) y su
 *   tipo: `file` (un archivo regular), `symlink` (un enlace, que nunca se
 *   sigue, tampoco el que apunta a una carpeta) u `other` (un fifo, un socket
 *   o un dispositivo), en profundidad y en el orden en que las da el sistema.
 *   Omite las que cumplen un patrón de `ignore` (matchDeliveryGlob). No guarda
 *   lo que ya dio.
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
 * Un resolver es una foto de la carpeta para una validación: cada carpeta en la
 * que se busca se lista una vez, cada entrada se mira una vez y cada archivo
 * se lee una vez, así el costo de buscar un path es el de sus segmentos. Lee a
 * lo sumo MAX_FOLDER_ENTRIES entradas: con más, la carpeta no se puede usar. La carpeta no tiene
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
import { type FileHandle, lstat, open, opendir, readdir, readlink, realpath, stat } from 'node:fs/promises';
import type { MediaResolver } from '../types.js';
import { folderFailure, MediaFolderError } from './errors.js';
import { matchDeliveryGlob } from './glob.js';
import { settleAll } from './settle.js';
import { foldCase, shownName } from './path.js';

type EntryType = 'file' | 'symlink' | 'other';
type Kind = 'dir' | EntryType;

/** Lo que se lee de un archivo de una vez. */
const CHUNK_BYTES = 1 << 20;

const UNSAFE = /[\\:\u0000]/u;

/** Cuántas entradas se miran, y cuántas carpetas se leen, a la vez. */
const AT_ONCE = 64;
const FOLDERS_AT_ONCE = 32;

/**
 * El tamaño (st_size) de una carpeta que se lee de una vez: crece con sus
 * entradas (unos 20 bytes cada una en tmpfs, 32 en APFS, 2 por letra en btrfs),
 * así una de hasta 64 KiB tiene a lo sumo unas pocas decenas de miles.
 */
const SMALL_FOLDER_BYTES = 64n * 1024n;

const SLASH = Buffer.from('/');
const FILE_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const FOLDER_FLAGS = constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0);

/** Las operaciones del sistema de archivos que usa el resolver; FOLDER_OPS son las de node:fs. */
export interface FolderOps {
  stat(path: Buffer): Promise<BigIntStats>;
  lstat(path: Buffer): Promise<BigIntStats>;
  realpath(path: Buffer): Promise<Buffer>;
  readdir(path: Buffer): Promise<Dirent<Buffer>[]>;
  opendir(path: Buffer): Promise<AsyncIterable<Dirent<Buffer>>>;
  open(path: Buffer, flags: number): Promise<FileHandle>;
  readlink(path: string): Promise<Buffer>;
}

export const FOLDER_OPS: FolderOps = Object.freeze({
  stat: (path: Buffer) => stat(path, { bigint: true }),
  lstat: (path: Buffer) => lstat(path, { bigint: true }),
  realpath: (path: Buffer) => realpath(path, { encoding: 'buffer' }),
  readdir: (path: Buffer) => readdir(path, { withFileTypes: true, encoding: 'buffer' }),
  // Con encoding buffer, los nombres son Buffer (los tipos de node:fs no lo dicen).
  opendir: (path: Buffer) => opendir(path, { encoding: 'buffer' as BufferEncoding, bufferSize: 128 }) as unknown as Promise<AsyncIterable<Dirent<Buffer>>>,
  open: (path: Buffer, flags: number) => open(path, flags),
  readlink: (path: string) => readlink(path, { encoding: 'buffer' }),
});

/** Cómo se llega a una entrada desde la carpeta que la listó: por su id (macOS), por la carpeta abierta (Linux) o por la ruta (una copia privada). */
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
  /** El del listado; una carpeta de otro dispositivo que la suya (un punto de montaje) pasa a other al mirarla. */
  kind: Kind;
  /** La ruta desde la raíz ('' es la raíz) y la del sistema, armadas una vez. */
  path?: string;
  real?: Buffer;
  stats?: Promise<Seen>;
  listing?: Promise<Listing>;
  hash?: Promise<string>;
  /** En Linux, la carpeta abierta mientras alguien la usa. */
  opened?: { users: number; readonly handle: Promise<FileHandle> } | undefined;
}

/** Lo que se guarda del lstat de una entrada: su tipo, quién es y, de un archivo, su tamaño y su fecha. */
interface Seen { readonly kind: Kind; readonly dev: bigint; readonly ino: bigint; readonly size: bigint; readonly mtimeNs: bigint }

/** Las entradas de una carpeta, por nombre exacto y plegado. */
interface Listing { readonly entries: readonly Entry[]; readonly exact: ReadonlyMap<string, Entry>; readonly folded: ReadonlyMap<string, Entry[]> }

/**
 * Las entradas que se leen de la carpeta de la entrega, como mucho, en una
 * validación (contando las carpetas, cada una una vez): con más, la carpeta
 * no se puede usar (tooManyEntries). En 2 MiB entran unos 33 000 archivos
 * declarados.
 */
export const MAX_FOLDER_ENTRIES = 100_000;

export function dirMediaResolver(dir: string, opts: { ignore?: readonly string[] } = {}): MediaResolver {
  return folderResolver(dir, opts, FOLDER_OPS);
}

/** dirMediaResolver con otras operaciones del sistema de archivos y otro tope de entradas (los de los tests). */
export function folderResolver(dir: string, opts: { ignore?: readonly string[] }, ops: FolderOps, maxEntries = MAX_FOLDER_ENTRIES): MediaResolver {
  const ignore = [...(opts.ignore ?? [])];
  let entriesRead = 0;
  /** Las carpetas cuyas entradas ya se cuentan, por su dev e ino: cada una cuenta una vez, aunque se lea de nuevo. */
  const counted = new Set<string>();
  const root: Entry = { parent: null, bytes: Buffer.alloc(0), name: '', kind: 'dir', path: '' };
  let anchor: Anchor = 'path';
  /** El receptor dijo que la carpeta es una copia privada (check): sin anclaje, se busca por la ruta. */
  let privateCopy = false;

  /**
   * La raíz: tiene que existir y ser una carpeta (se sigue si es un enlace: la eligió quien llama). Si el sistema la
   * deja anclar, se identifica por el anclaje; si no, sin copia privada no se usa (unanchored). Cualquier falla al
   * identificarla es una falla de la carpeta, nunca la búsqueda por la ruta.
   */
  const rooted = async (): Promise<Seen> => {
    const given = Buffer.from(dir);
    let stats: BigIntStats;
    try {
      stats = await ops.stat(given);
      if (!stats.isDirectory()) throw new MediaFolderError('notDirectory', '');
      root.real = await ops.realpath(given);
    } catch (error) {
      throw folderFailure(error, '', false);
    }
    const seen = seenOf(stats);
    const system = await anchorOf(seen);
    if (system === null && !privateCopy) throw new MediaFolderError('unanchored', '');
    anchor = system ?? 'path';
    try {
      if (anchor === 'vol') {
        const byId = await ops.lstat(volPath(seen));
        if (!byId.isDirectory() || !same(byId, seen)) throw new MediaFolderError('modified', '');
      } else if (anchor === 'proc') {
        await (await openRoot(seen)).close();
      } else {
        const now = await ops.lstat(root.real);
        if (!now.isDirectory() || !same(now, seen)) throw new MediaFolderError('modified', '');
      }
    } catch (error) {
      throw folderFailure(error, '', true);
    }
    return seen;
  };

  /**
   * Cómo deja el sistema llegar a cada entrada desde su carpeta ya identificada, o null. Lo deciden el proceso y el
   * volumen, nunca la carpeta: en macOS, la raíz del volumen por su id (/.vol/<dev>/2; un volumen exFAT, FAT, SMB o
   * NFS no la da); en Linux, / abierta y vista por /proc/self/fd/N. Demasiados archivos abiertos es esa falla.
   */
  async function anchorOf(seen: Seen): Promise<Anchor | null> {
    try {
      if (process.platform === 'darwin') {
        const volume = await ops.lstat(Buffer.from(`/.vol/${seen.dev}/2`));
        return volume.isDirectory() && volume.dev === seen.dev && volume.ino === 2n ? 'vol' : null;
      }
      if (process.platform === 'linux' && constants.O_DIRECTORY !== undefined) {
        const handle = await ops.open(SLASH, FOLDER_FLAGS);
        try {
          return (await ops.readlink(procPath(handle.fd))).equals(SLASH) ? 'proc' : null;
        } finally {
          await handle.close();
        }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EMFILE' || code === 'ENFILE') throw folderFailure(error, '', true);
    }
    return null;
  }

  /** La raíz abierta (Linux): la que se vio (dev e ino) y en su ruta real (/proc/self/fd/N). */
  async function openRoot(seen: Seen): Promise<FileHandle> {
    const real = root.real as Buffer;
    const handle = await ops.open(real, FOLDER_FLAGS);
    try {
      const opened = await handle.stat({ bigint: true });
      if (!opened.isDirectory() || !same(opened, seen) || !(await ops.readlink(procPath(handle.fd))).equals(real)) throw new MediaFolderError('modified', '');
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  /** Las entradas de una carpeta, leídas una vez. */
  const listingOf = (folder: Entry): Promise<Listing> => (folder.listing ??= readListing(folder));

  /** El lstat de una entrada, una vez, desde su carpeta; tiene que ser del tipo que dio su listado. La raíz, al empezar. */
  const statsOf = (entry: Entry): Promise<Seen> => (entry.stats ??= entry === root ? rooted() : lstatOf(entry));

  /**
   * El lstat de una entrada ahora, desde la carpeta que la listó, del tipo que dio su listado. Una carpeta de otro
   * dispositivo que la suya (un punto de montaje) es otra entrada (other): no se entra.
   */
  async function lstatOf(entry: Entry, at?: Buffer): Promise<Seen> {
    const parent = entry.parent as Entry;
    const folder = await statsOf(parent);
    let stats: BigIntStats;
    try {
      if (at !== undefined) stats = await ops.lstat(Buffer.concat([at, SLASH, entry.bytes]));
      else if (anchor === 'vol') stats = await ops.lstat(Buffer.concat([volPath(folder), SLASH, entry.bytes]));
      else if (anchor === 'proc') stats = await withFolder(parent, (open) => ops.lstat(Buffer.concat([open, SLASH, entry.bytes])));
      else stats = await ops.lstat(realOf(entry));
    } catch (error) {
      // Sin permiso para recorrer la carpeta, la que no se puede leer es ella.
      const code = (error as NodeJS.ErrnoException).code;
      throw folderFailure(error, code === 'EACCES' || code === 'EPERM' ? pathOf(parent) : pathOf(entry), true);
    }
    if (kindOf(stats) !== entry.kind) throw new MediaFolderError('modified', pathOf(entry));
    if (entry.kind === 'dir' && stats.dev !== folder.dev) {
      entry.kind = 'other';
      return { ...seenOf(stats), kind: 'other' };
    }
    return seenOf(stats);
  }

  /** El lstat de una carpeta ahora: la raíz por su ruta real, las demás desde la suya. */
  async function lstatNow(folder: Entry): Promise<Seen> {
    if (folder.parent !== null) return lstatOf(folder);
    try {
      return seenOf(await ops.lstat(realOf(root)));
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
    const lease = await leaseFolder(folder);
    try {
      return await use(lease.at);
    } finally {
      await lease.release();
    }
  }

  async function leaseFolder(folder: Entry): Promise<{ at: Buffer; release: () => Promise<void> }> {
    const shared = (folder.opened ??= { users: 0, handle: openFolder(folder) });
    shared.users++;
    const release = async (): Promise<void> => {
      if (--shared.users === 0) {
        folder.opened = undefined;
        await shared.handle.then((h) => h.close(), () => undefined);
      }
    };
    try {
      return { at: Buffer.from(procPath((await shared.handle).fd)), release };
    } catch (error) {
      await release();
      throw error;
    }
  }

  async function openFolder(folder: Entry): Promise<FileHandle> {
    const seen = await statsOf(folder);
    let handle: FileHandle;
    try {
      handle = folder.parent === null ? await openRoot(seen) : await ops.open(realOf(folder), FOLDER_FLAGS);
    } catch (error) {
      throw folderFailure(error, pathOf(folder), true);
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

  /** Las entradas de una carpeta, todas, para buscar paths en ella. */
  async function readListing(folder: Entry): Promise<Listing> {
    return listingFrom(await collect(readEntries(folder)));
  }

  /**
   * Las entradas de una carpeta, de a una, que tiene que ser la misma antes y
   * después de leerla: en Linux se leen de la carpeta abierta y controlada; en
   * macOS, de la carpeta por su id, con el lstat antes y después; por la ruta
   * (una copia privada), igual (quien las usa las junta todas antes: una
   * carpeta que cambió falla después de la última). Las carpetas de adentro se
   * identifican desde ella antes de darlas: una de otro dispositivo sale como
   * other. Cuenta cada entrada contra el tope, una vez por carpeta.
   */
  async function* readEntries(folder: Entry): AsyncGenerator<Entry> {
    const seen = await statsOf(folder);
    const key = `${seen.dev}:${seen.ino}`;
    const counts = !counted.has(key);
    if (counts) counted.add(key);
    const lease = anchor === 'proc' ? await leaseFolder(folder) : null;
    try {
      // Una carpeta chica se lee de una vez; una grande, de a partes, así se deja de leer en el tope.
      let dir: Iterable<Dirent<Buffer>> | AsyncIterable<Dirent<Buffer>>;
      const at = lease !== null ? lease.at : anchor === 'vol' ? volPath(seen) : realOf(folder);
      try {
        dir = seen.size > 0n && seen.size <= SMALL_FOLDER_BYTES ? await ops.readdir(at) : await ops.opendir(at);
      } catch (error) {
        throw folderFailure(error, pathOf(folder), folder.parent !== null);
      }
      const inner: Entry[] = [];
      const names = new Set<string>();
      try {
        for await (const d of dir) {
          if (counts && ++entriesRead > maxEntries) throw new MediaFolderError('tooManyEntries', pathOf(folder));
          const entry: Entry = { parent: folder, bytes: d.name, name: shownName(d.name), kind: d.isDirectory() ? 'dir' : typeOf(d) };
          // Un nombre que el listado da dos veces: la carpeta cambió mientras se leía.
          if (names.has(entry.name)) throw new MediaFolderError('modified', pathOf(folder));
          names.add(entry.name);
          if (entry.kind === 'dir') {
            inner.push(entry);
            if (inner.length >= AT_ONCE) yield* identified(inner.splice(0), lease?.at);
          } else {
            yield entry;
          }
        }
      } catch (error) {
        throw folderFailure(error, pathOf(folder), true);
      }
      yield* identified(inner, lease?.at);
      if (lease === null) {
        const after = await lstatNow(folder);
        if (after.kind !== 'dir' || !same(after, seen)) throw new MediaFolderError('modified', pathOf(folder));
      }
    } finally {
      await lease?.release();
    }
  }

  /** Las carpetas de adentro, con su dev e ino mirados desde la carpeta (en Linux, la abierta). */
  async function* identified(folders: readonly Entry[], at: Buffer | undefined): AsyncGenerator<Entry> {
    await settleAll(folders.map((e) => (e.stats ??= lstatOf(e, at))));
    yield* folders;
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
      if (anchor === 'proc' && !(await ops.readlink(procPath(handle.fd))).equals(realOf(entry))) throw new MediaFolderError('modified', pathOf(entry));
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
      // En profundidad, de a varias carpetas a la vez, sin guardar lo que ya dio: quedan pendientes solo las carpetas
      // de adentro. Cada carpeta se lee entera, y controlada, antes de dar sus entradas: lo que se leyó por la ruta de
      // una carpeta que cambió no se da. Una carpeta que ya se listó para buscar paths no se vuelve a leer.
      const pending: Entry[] = [root];
      while (pending.length > 0) {
        const wave = pending.splice(Math.max(0, pending.length - FOLDERS_AT_ONCE));
        const read = await settleAll(wave.map(async (folder) => (folder.listing === undefined ? collect(readEntries(folder)) : (await folder.listing).entries)));
        for (const entries of read) {
          for (const entry of entries) {
            // Una carpeta se recorre; un enlace nunca se sigue.
            if (entry.kind === 'dir') pending.push(entry);
            else if (!ignored(pathOf(entry))) yield { path: pathOf(entry), type: entry.kind };
          }
        }
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

    async check(opts = {}) {
      privateCopy = opts.privateCopy === true;
      await listingOf(root);
      return anchor === 'path' ? 'path' : 'anchored';
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

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
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

/** La ruta de una entrada en el sistema, con los bytes de cada nombre, desde la ruta real de la raíz (con la raíz /, /nombre). */
function realOf(entry: Entry): Buffer {
  if (entry.real === undefined) {
    const parent = realOf(entry.parent as Entry);
    entry.real = parent.at(-1) === SLASH[0] ? Buffer.concat([parent, entry.bytes]) : Buffer.concat([parent, SLASH, entry.bytes]);
  }
  return entry.real;
}

/** La carpeta por su id en macOS. */
function volPath(stats: { dev: bigint; ino: bigint }): Buffer {
  return Buffer.from(`/.vol/${stats.dev}/${stats.ino}`);
}

/** Lo que tiene abierto el proceso en ese descriptor (Linux). */
function procPath(fd: number): string {
  return `/proc/self/fd/${fd}`;
}

function same(a: { dev: bigint; ino: bigint }, b: { dev: bigint; ino: bigint }): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

function seenOf(stats: BigIntStats): Seen {
  return { kind: kindOf(stats), dev: stats.dev, ino: stats.ino, size: stats.size, mtimeNs: stats.mtimeNs };
}

function kindOf(stats: BigIntStats): Kind {
  return stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : stats.isSymbolicLink() ? 'symlink' : 'other';
}

/** El tipo de una entrada que no es una carpeta. */
function typeOf(entry: Dirent<Buffer>): EntryType {
  return entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'symlink' : 'other';
}
