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
 *   stat da null. `ignore` no los cambia.
 * - sha256 lee el archivo de a partes, abierto sin seguir enlaces y sin
 *   esperar (O_NOFOLLOW, O_NONBLOCK), y controla con fstat que es un archivo
 *   regular y el mismo que encontró: nunca abre un fifo, un socket ni un
 *   dispositivo, ni lee un enlace que apareció después.
 * - Una carpeta que no se puede usar es un MediaFolderError: la raíz que no
 *   existe o no es una carpeta, algo de adentro que no se puede leer, o una
 *   entrada que cambió desde que se listó. check() controla la raíz.
 *
 * Un resolver es una foto de la carpeta para una validación: cada carpeta se
 * lista una vez, cada entrada se mira una vez y cada archivo se lee una vez,
 * así el costo de buscar un path es el de sus segmentos.
 */
import { createHash } from 'node:crypto';
import { type BigIntStats, constants, type Dirent } from 'node:fs';
import { lstat, open, readdir, stat } from 'node:fs/promises';
import type { MediaResolver } from '../types.js';
import { folderFailure, MediaFolderError } from './errors.js';
import { matchDeliveryGlob } from './glob.js';
import { foldCase, shownName } from './path.js';

type EntryType = 'file' | 'symlink' | 'other';
type Kind = 'dir' | EntryType;

/** Lo que se lee de un archivo de una vez. */
const CHUNK_BYTES = 1 << 20;

const UNSAFE = /[\\:\u0000]/u;

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
}

/** Las entradas de una carpeta, por nombre exacto y plegado. */
interface Listing { readonly entries: readonly Entry[]; readonly exact: ReadonlyMap<string, Entry>; readonly folded: ReadonlyMap<string, Entry[]> }

export function dirMediaResolver(dir: string, opts: { ignore?: readonly string[] } = {}): MediaResolver {
  const ignore = [...(opts.ignore ?? [])];
  const root: Entry = { parent: null, bytes: Buffer.alloc(0), name: '', kind: 'dir', path: '', real: Buffer.from(dir) };
  let rootChecked: Promise<void> | undefined;
  /** La raíz: tiene que existir y ser una carpeta (se sigue si es un enlace: la eligió quien llama). */
  const checked = (): Promise<void> => (rootChecked ??= stat(dir).then(
    (stats) => {
      if (!stats.isDirectory()) throw new MediaFolderError('notDirectory', '');
    },
    (error: unknown) => {
      throw folderFailure(error, '', false);
    },
  ));

  /** Las entradas de una carpeta, leídas una vez. */
  const listingOf = (folder: Entry): Promise<Listing> =>
    (folder.listing ??= (folder === root ? checked() : Promise.resolve()).then(() => readListing(folder)));

  /** Dónde termina un path de la entrega: la entrada, o null si no está. */
  const resolve = async (path: string): Promise<Entry | null> => {
    const segments = path.split('/');
    if (path === '' || segments.some((s) => s === '' || s === '.' || s === '..' || UNSAFE.test(s))) return null;
    let folder = root;
    for (let i = 0; i < segments.length; i++) {
      const entry = pick(await listingOf(folder), segments[i] as string);
      if (entry === null) return null;
      // El tipo de una carpeta del camino sale de su listado; el enlace, donde se detiene, y la última, se miran.
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
      return { type: stats.isSymbolicLink() ? 'symlink' : stats.isFile() ? 'file' : 'other', size: Number(stats.size) };
    },

    async sha256(path) {
      const entry = await resolve(path);
      if (entry === null || !(await statsOf(entry)).isFile()) throw new Error(`${path}: no es un archivo regular de la entrega`);
      return (entry.hash ??= statsOf(entry).then((stats) => hashFile(realOf(entry), stats, pathOf(entry))));
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

const SLASH = Buffer.from('/');

/** La ruta de una entrada en el sistema, con los bytes de cada nombre, armada una vez desde la de su carpeta. */
function realOf(entry: Entry): Buffer {
  return (entry.real ??= Buffer.concat([realOf(entry.parent as Entry), SLASH, entry.bytes]));
}

/** Las entradas de una carpeta; si no se puede leer, la falla de la carpeta. */
async function readListing(folder: Entry): Promise<Listing> {
  let dirents: Dirent<Buffer>[];
  try {
    dirents = await readdir(realOf(folder), { withFileTypes: true, encoding: 'buffer' });
  } catch (error) {
    throw folderFailure(error, pathOf(folder), folder.parent !== null);
  }
  return listingFrom(dirents.map((d) => ({ parent: folder, bytes: d.name, name: shownName(d.name), kind: d.isDirectory() ? 'dir' : typeOf(d) })));
}

/** El tipo de una entrada que no es una carpeta. */
function typeOf(entry: Dirent<Buffer>): EntryType {
  return entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'symlink' : 'other';
}

/**
 * El lstat de una entrada que su carpeta listó, una vez: si dejó de estar, la
 * carpeta cambió; sin permiso, la carpeta que no se puede recorrer es la suya.
 */
function statsOf(entry: Entry): Promise<BigIntStats> {
  return (entry.stats ??= lstat(realOf(entry), { bigint: true }).catch((error: unknown) => {
    const code = (error as NodeJS.ErrnoException).code;
    throw folderFailure(error, code === 'EACCES' || code === 'EPERM' ? pathOf(entry.parent as Entry) : pathOf(entry), true);
  }));
}

/** El sha256 del archivo, de a partes, si al abrirlo es el mismo archivo regular que se encontró. */
async function hashFile(path: Buffer, found: BigIntStats, shown: string): Promise<string> {
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
