/**
 * La carpeta local de la entrega como MediaResolver (dirMediaResolver), sobre
 * carpetas temporales que arma y borra cada test. Nada sale de la carpeta:
 * ningún enlace se sigue, ningún fifo, socket ni dispositivo se abre, y un
 * path con `..`, absoluto o con `\` no se busca. Las mayúsculas se prueban en
 * el sistema de archivos que haya: en uno que no las distingue (el de macOS
 * por defecto) dos variantes de un nombre no pueden convivir, y el test lo
 * mira así.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, type BigIntStats, chmodSync, closeSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { caseVariant, dirMediaResolver, FOLDER_HANDLES, FOLDER_OPS, type FolderOps, folderResolver, MAX_FOLDER_ENTRIES } from '../../../src/media/dirMediaResolver.js';
import { MediaFolderError } from '../../../src/media/errors.js';
import { shownName } from '../../../src/media/path.js';
import type { MediaResolver } from '../../../src/types.js';

const made: string[] = [];
/** Las carpetas con rutas más largas que las del sistema: se borran con rm, que las recorre de a una. */
const deep: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) {
    chmodTree(dir);
    rmSync(dir, { recursive: true, force: true });
  }
  for (const dir of deep.splice(0)) execFileSync('rm', ['-rf', dir]);
});

/** Una carpeta temporal nueva con esos archivos (el texto de cada uno), que el test borra al terminar. */
function delivery(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'jdx-media-'));
  made.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
/** Si la carpeta distingue mayúsculas: dos nombres que solo difieren en eso son dos archivos. */
function caseSensitive(dir: string): boolean {
  writeFileSync(join(dir, 'probe-case'), '');
  const sensitive = !existsSync(join(dir, 'PROBE-CASE'));
  rmSync(join(dir, 'probe-case'));
  return sensitive;
}
/** Devuelve los permisos que un test sacó, para poder borrar la carpeta. */
function chmodTree(dir: string): void {
  if (!existsSync(dir)) return;
  chmodSync(dir, 0o755);
  for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) chmodTree(join(dir, entry.name));
}
/** Lo que da list(), en orden de ruta (list da el orden del sistema de archivos). */
async function listed(resolver: MediaResolver): Promise<[string, string][]> {
  const out: [string, string][] = [];
  for await (const entry of resolver.list()) out.push([entry.path, entry.type]);
  return out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
const sha = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
/** La causa y el lugar de la falla de la carpeta con que termina la promesa. */
async function folderFailure(work: Promise<unknown>): Promise<[string, string]> {
  const error = await work.then(() => null, (e: unknown) => e);
  if (!(error instanceof MediaFolderError)) throw new Error(`no es una falla de la carpeta: ${String(error)}`);
  return [error.reason, error.path];
}
/** Los bytes de un nombre mostrado con shownName: cada \xHH es un byte y lo demás, su UTF-8. */
function bytesOf(shown: string): Buffer {
  const parts: Buffer[] = [];
  for (const [, hex, text] of shown.matchAll(/\\x([0-9A-F]{2})|([^\\]+)/gu)) parts.push(hex === undefined ? Buffer.from(text as string) : Buffer.from([parseInt(hex, 16)]));
  return Buffer.concat(parts);
}
/** Si el sistema de archivos admite nombres que no son UTF-8 válido (Linux sí; el de macOS no). */
const INVALID_NAMES = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'jdx-media-'));
  try {
    writeFileSync(Buffer.concat([Buffer.from(`${dir}/`), Buffer.from([0x62, 0xfe])]), '');
    return readdirSync(dir, { encoding: 'buffer' }).some((name) => name.equals(Buffer.from([0x62, 0xfe])));
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();
const mkfifo = (path: string) => execFileSync('mkfifo', [path]);
/**
 * Las operaciones de base con cada archivo abierto anotado: cuántos siguen abiertos, y cuántas veces se abrió cada
 * carpeta (por su ino; no cuenta / ni la raíz, que se abre para identificarla).
 */
function trackedOps(base: FolderOps): { ops: FolderOps; open: () => number; folderOpens: Map<string, number>; reopened: () => string[] } {
  let open = 0;
  const folderOpens = new Map<string, number>();
  const ops: FolderOps = {
    ...base,
    open: async (path, flags) => {
      const handle = await base.open(path, flags);
      open++;
      if ((flags & (constants.O_DIRECTORY ?? 0)) !== 0 && path.toString() !== '/') {
        const ino = (await handle.stat({ bigint: true })).ino.toString();
        folderOpens.set(ino, (folderOpens.get(ino) ?? 0) + 1);
      }
      const close = handle.close.bind(handle);
      let closed = false;
      return Object.assign(handle, {
        close: async () => {
          if (!closed) {
            closed = true;
            open--;
          }
          return close();
        },
      });
    },
  };
  return { ops, open: () => open, folderOpens, reopened: () => [...folderOpens].filter(([, n]) => n > 1).map(([ino]) => ino) };
}
/** Si quien corre los tests puede leer lo que no tiene permiso (root): entonces no hay nada ilegible. */
const READS_EVERYTHING = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'jdx-media-'));
  try {
    writeFileSync(join(dir, 'probe-perm'), '');
    chmodSync(join(dir, 'probe-perm'), 0o000);
    readFileSync(join(dir, 'probe-perm'));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();
/** El largo máximo de una ruta absoluta, en bytes y sin el NUL final, más uno. */
const PATH_MAX = process.platform === 'darwin' ? 1024 : 4096;
/**
 * Una cadena de carpetas `pad/segment/segment/…` en una carpeta nueva, que pasa PATH_MAX, con x.pdf al fondo. `pad`
 * se elige para que una de las carpetas tenga una ruta absoluta de exactamente PATH_MAX bytes: la primera que no entra.
 * Se arma de a tramos relativos (mkdir -p desde la carpeta del tramo anterior). Da esa ruta relativa.
 */
function chainPastPathMax(segment: string): { dir: string; first: string } {
  const dir = mkdtempSync(join(tmpdir(), 'jdx-media-'));
  deep.push(dir);
  const base = Buffer.byteLength(realpathSync(dir));
  const step = segment.length + 1;
  const pad = 'p'.repeat(((PATH_MAX - base - 1 - 1) % step) + 1);
  const depth = 1 + (PATH_MAX - base - 1 - pad.length) / step;
  const segments = [pad, ...Array<string>(depth + 10).fill(segment)];
  let cwd = realpathSync(dir);
  for (let at = 0; ; ) {
    const rest = segments.slice(at).join('/');
    if (rest.length < PATH_MAX - 200) {
      execFileSync('mkdir', ['-p', rest], { cwd });
      execFileSync('touch', [`${rest}/x.pdf`], { cwd });
      break;
    }
    let rel = segments[at++] as string;
    while (cwd.length + rel.length + step + 1 < PATH_MAX - 200 && rel.length < 600) rel += `/${segments[at++] as string}`;
    execFileSync('mkdir', ['-p', rel], { cwd });
    cwd = `${cwd}/${rel}`;
  }
  return { dir, first: segments.slice(0, depth).join('/') };
}
/** Las de node:fs sin las rutas ancladas del sistema (ni /.vol ni /proc): todo por la ruta de cada entrada. */
const BY_PATH: FolderOps = {
  ...FOLDER_OPS,
  lstat: (path) => (path.toString().startsWith('/.vol/') ? Promise.reject(Object.assign(new Error('sin rutas por id'), { code: 'ENOENT' })) : FOLDER_OPS.lstat(path)),
  readlink: (path) => (path.startsWith('/proc/') ? Promise.reject(Object.assign(new Error('sin /proc'), { code: 'ENOENT' })) : FOLDER_OPS.readlink(path)),
};
/** Si este sistema ancla la carpeta (macOS con /.vol en el volumen de las carpetas temporales, Linux con /proc). */
const ANCHORED = process.platform === 'darwin' || process.platform === 'linux';
/** Los stats con otro dev, como los de un punto de montaje. */
const onAnotherDevice = (stats: BigIntStats): BigIntStats => Object.assign(Object.create(Object.getPrototypeOf(stats) as object) as BigIntStats, stats, { dev: stats.dev + 1n });
/** Un archivo regular que se puede leer justo debajo de / (en un contenedor, /.dockerenv), o null. */
const ROOT_FILE = readdirSync('/').find((name) => {
  try {
    if (!lstatSync(`/${name}`).isFile()) return false;
    readFileSync(`/${name}`);
    return true;
  } catch {
    return false;
  }
}) ?? null;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Si una ruta que da el resolver es la de ese nombre (por ruta, o la última parte de una anclada). */
const named = (path: Buffer | string, name: string): boolean => path.toString().endsWith(`/${name}`);

describe('dirMediaResolver', () => {
  it('list is recursive with / and does not follow symlinked dirs', async () => {
    const outside = delivery({ 'secreto.txt': 'no', 'otra/x.pdf': 'no' });
    const dir = delivery({ 'a.pdf': 'a', 'sub/b.pdf': 'bb', 'sub/c/d.pdf': 'ddd', '.oculto': 'h' });
    symlinkSync(join(outside, 'otra'), join(dir, 'enlace'));
    symlinkSync(join(outside, 'secreto.txt'), join(dir, 'sub/secreto.txt'));
    mkdirSync(join(dir, 'vacia'));
    // En orden de nombre, en profundidad; las carpetas no se listan, y el enlace a una carpeta es un enlace.
    expect(await listed(dirMediaResolver(dir))).toEqual([
      ['.oculto', 'file'], ['a.pdf', 'file'], ['enlace', 'symlink'], ['sub/b.pdf', 'file'], ['sub/c/d.pdf', 'file'], ['sub/secreto.txt', 'symlink'],
    ]);
  });

  it('regular file', async () => {
    const dir = delivery({ 'sub/b.pdf': 'bb' });
    const resolver = dirMediaResolver(dir);
    expect(await resolver.stat('sub/b.pdf')).toMatchObject({ type: 'file', size: 2 });
    expect(await resolver.sha256('sub/b.pdf')).toBe(sha('bb'));
    // Una carpeta no es un archivo regular.
    expect(await resolver.stat('sub')).toMatchObject({ type: 'other' });
  });

  it('symlink file is symlink', async () => {
    const dir = delivery({ 'a.pdf': 'a' });
    symlinkSync('a.pdf', join(dir, 'b.pdf'));
    symlinkSync('no-existe.pdf', join(dir, 'roto.pdf'));
    const resolver = dirMediaResolver(dir);
    expect([(await resolver.stat('b.pdf'))?.type, (await resolver.stat('roto.pdf'))?.type]).toEqual(['symlink', 'symlink']);
    await expect(resolver.sha256('b.pdf')).rejects.toThrow('b.pdf: no es un archivo regular de la entrega');
  });

  it('file below a symlinked dir is symlink', async () => {
    const outside = delivery({ 'x/secreto.txt': 'no' });
    const dir = delivery();
    symlinkSync(join(outside, 'x'), join(dir, 'x'));
    const resolver = dirMediaResolver(dir);
    expect((await resolver.stat('x/secreto.txt'))?.type).toBe('symlink');
    await expect(resolver.sha256('x/secreto.txt')).rejects.toThrow('no es un archivo regular de la entrega');
  });

  it.skipIf(process.platform === 'win32')('fifo is other', async () => {
    const dir = delivery({ 'sub/a.pdf': 'a' });
    mkfifo(join(dir, 'sub/tubo'));
    const resolver = dirMediaResolver(dir);
    // Ni stat, ni list, ni sha256 lo abren: abrir un fifo para leer espera para siempre a quien escriba.
    expect(await resolver.stat('sub/tubo')).toMatchObject({ type: 'other' });
    expect(await listed(resolver)).toEqual([['sub/a.pdf', 'file'], ['sub/tubo', 'other']]);
    await expect(resolver.sha256('sub/tubo')).rejects.toThrow('no es un archivo regular de la entrega');
  });

  it.skipIf(process.platform === 'win32')('a socket is other and is never opened', async () => {
    const dir = delivery();
    const server: Server = createServer();
    await new Promise<void>((resolve) => server.listen(join(dir, 's.sock'), resolve));
    try {
      const resolver = dirMediaResolver(dir);
      expect(await resolver.stat('s.sock')).toMatchObject({ type: 'other' });
      expect(await listed(resolver)).toEqual([['s.sock', 'other']]);
      await expect(resolver.sha256('s.sock')).rejects.toThrow('no es un archivo regular de la entrega');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('missing is null', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'sub/b.pdf': 'b' });
    const resolver = dirMediaResolver(dir);
    for (const path of ['b.pdf', 'sub/a.pdf', 'otra/a.pdf', 'a.pdf/b', `${'n'.repeat(300)}.pdf`]) expect(await resolver.stat(path), path).toBeNull();
    await expect(resolver.sha256('b.pdf')).rejects.toThrow('b.pdf: no es un archivo regular de la entrega');
  });

  it('unique case-insensitive fallback', async () => {
    // En cualquier sistema de archivos: sin el nombre exacto, el único que coincide sin mayúsculas, segmento por segmento.
    const dir = delivery({ 'Audios/Tema.MP3': 'mp3' });
    const resolver = dirMediaResolver(dir);
    for (const path of ['audios/tema.mp3', 'AUDIOS/TEMA.mp3', 'Audios/Tema.MP3']) {
      expect(await resolver.stat(path), path).toMatchObject({ type: 'file', size: 3 });
      expect(await resolver.sha256(path), path).toBe(sha('mp3'));
    }
    // Solo de A a Z, y por los nombres de la carpeta: una letra con tilde no es otra en mayúscula, ni una
    // forma NFD es la NFC, aunque el sistema de archivos los tome por iguales.
    writeFileSync(join(dir, 'Ñandú.pdf'), 'x');
    writeFileSync(join(dir, 'Cancio\u0301n.pdf'), 'x');
    const other = dirMediaResolver(dir);
    expect([await other.stat('ñandú.pdf'), await other.stat('Canción.pdf'), (await other.stat('Ñandú.pdf'))?.type]).toEqual([null, null, 'file']);
  });

  it('stat says where the path ended, with the names of the folder', async () => {
    const outside = delivery({ 'x/secreto.txt': 'no' });
    const dir = delivery({ 'Audios/Tema.MP3': 'mp3' });
    symlinkSync(join(outside, 'x'), join(dir, 'Enlace'));
    const resolver = dirMediaResolver(dir);
    expect(await resolver.stat('audios/tema.mp3')).toEqual({ type: 'file', size: 3, path: 'Audios/Tema.MP3' });
    // Un enlace en el camino: el path se detiene en él.
    expect(await resolver.stat('enlace/secreto.txt')).toMatchObject({ type: 'symlink', path: 'Enlace' });
    expect(await resolver.stat('AUDIOS')).toMatchObject({ type: 'other', path: 'Audios' });
  });

  it('exact match wins over case variants', async () => {
    const dir = delivery({ 'a.pdf': 'minúscula' });
    writeFileSync(join(dir, 'A.pdf'), 'MAYÚSCULA, otro tamaño');
    const resolver = dirMediaResolver(dir);
    if (caseSensitive(dir)) {
      // Dos archivos: cada nombre exacto da el suyo, y una tercera variante no elige entre los dos.
      expect(await listed(resolver)).toEqual([['A.pdf', 'file'], ['a.pdf', 'file']]);
      expect(await resolver.sha256('a.pdf')).toBe(sha('minúscula'));
      expect(await resolver.sha256('A.pdf')).toBe(sha('MAYÚSCULA, otro tamaño'));
      expect(await resolver.stat('A.PDF')).toBeNull();
    } else {
      // Un solo archivo: el segundo nombre escribió en el primero, y cualquier variante lo encuentra.
      expect(await listed(resolver)).toEqual([['a.pdf', 'file']]);
      for (const path of ['a.pdf', 'A.pdf', 'A.PDF']) expect(await resolver.sha256(path), path).toBe(sha('MAYÚSCULA, otro tamaño'));
    }
  });

  it('caseVariant: the exact name, or the only one that matches from A to Z, or none', () => {
    // La elección de cada segmento, sin sistema de archivos: vale igual en uno que no distingue mayúsculas.
    expect(caseVariant(['a.pdf', 'A.pdf'], 'a.pdf')).toBe('a.pdf');
    expect(caseVariant(['a.pdf', 'A.pdf'], 'A.pdf')).toBe('A.pdf');
    expect(caseVariant(['a.pdf', 'A.pdf'], 'A.PDF')).toBeNull();
    expect(caseVariant(['Tema.MP3', 'otro.mp3'], 'tema.mp3')).toBe('Tema.MP3');
    expect(caseVariant(['Ñ.pdf'], 'ñ.pdf')).toBeNull();
    expect(caseVariant(['K.pdf'], 'k.pdf')).toBeNull();
    expect(caseVariant([], 'a.pdf')).toBeNull();
  });

  it('sha256 streams a 50 MB file', async () => {
    const dir = delivery();
    const chunk = Buffer.alloc(1 << 20);
    const hash = createHash('sha256');
    const parts: Buffer[] = [];
    for (let i = 0; i < 50; i++) {
      chunk.fill(i);
      hash.update(chunk);
      parts.push(Buffer.from(chunk));
    }
    writeFileSync(join(dir, 'grande.bin'), Buffer.concat(parts));
    parts.length = 0;
    const resolver = dirMediaResolver(dir);
    // Mientras calcula, la memoria de buffers crece de a una parte, no con el archivo entero.
    const start = process.memoryUsage().arrayBuffers;
    let peak = start;
    const timer = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().arrayBuffers);
    }, 1);
    try {
      expect(await resolver.sha256('grande.bin')).toBe(hash.digest('hex'));
    } finally {
      clearInterval(timer);
    }
    expect(await resolver.stat('grande.bin')).toMatchObject({ type: 'file', size: 50 << 20 });
    expect(peak - start).toBeLessThan(16 << 20);
  });

  it('paths never escape the dir', async () => {
    const outside = delivery({ 'secreto.txt': 'no' });
    const dir = delivery({ 'sub/a.pdf': 'a' });
    symlinkSync(join(outside, 'secreto.txt'), join(dir, 'secreto.txt'));
    const resolver = dirMediaResolver(dir);
    const escapes = [
      '../secreto.txt', `../${outside.split('/').pop() as string}/secreto.txt`, 'sub/../../secreto.txt', '/etc/passwd', join(outside, 'secreto.txt'),
      'sub/..', '.', '', 'sub//a.pdf', 'sub/', 'sub\\a.pdf', '..\\secreto.txt', 'C:secreto.txt', 'sub/a.pdf\u0000',
    ];
    for (const path of escapes) {
      expect(await resolver.stat(path), path).toBeNull();
      await expect(resolver.sha256(path), path).rejects.toThrow('no es un archivo regular de la entrega');
    }
    // El enlace que sale de la carpeta es un enlace, y no se lee.
    expect((await resolver.stat('secreto.txt'))?.type).toBe('symlink');
    await expect(resolver.sha256('secreto.txt')).rejects.toThrow('no es un archivo regular de la entrega');
  });

  it('a file named with : or \\ in the folder is never found by a path, and is listed with its name', async () => {
    const dir = delivery({ 'a:b': 'dos puntos', 'c\\d': 'barra' });
    const resolver = dirMediaResolver(dir);
    // Un path con esos caracteres no se busca; el nombre con la barra se muestra con \x5C.
    expect(await resolver.stat('a:b')).toBeNull();
    expect(await resolver.stat('c\\d')).toBeNull();
    await expect(resolver.sha256('a:b')).rejects.toThrow('no es un archivo regular de la entrega');
    expect(await listed(resolver)).toEqual([['a:b', 'file'], ['c\\x5Cd', 'file']]);
  });

  it('a file replaced by a link between stat and sha256 is never read: the folder changed', async () => {
    const outside = delivery({ 'secreto.txt': 'no' });
    const dir = delivery({ 'a.pdf': 'a' });
    const resolver = dirMediaResolver(dir);
    expect(await resolver.stat('a.pdf')).toMatchObject({ type: 'file', size: 1 });
    rmSync(join(dir, 'a.pdf'));
    symlinkSync(join(outside, 'secreto.txt'), join(dir, 'a.pdf'));
    // El resolver ya vio un archivo regular: abre sin seguir el enlace, y la falla es que la carpeta cambió.
    expect(await folderFailure(resolver.sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
  });

  it('a file put in the place of one already looked up is a change of the folder, and a file is read once', async () => {
    const dir = delivery({ 'a.pdf': 'uno', 'b.pdf': 'dos', 'c.pdf': 'tres' });
    const resolver = dirMediaResolver(dir);
    expect(await resolver.stat('a.pdf')).toMatchObject({ type: 'file', size: 3 });
    renameSync(join(dir, 'b.pdf'), join(dir, 'a.pdf'));
    expect(await folderFailure(resolver.sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
    // Uno que ya se leyó no se vuelve a leer: el resolver es una foto de la carpeta.
    expect(await resolver.sha256('c.pdf')).toBe(sha('tres'));
    rmSync(join(dir, 'c.pdf'));
    expect(await resolver.sha256('C.PDF')).toBe(sha('tres'));
  });

  it('shownName keeps valid UTF-8 and writes each byte that is not, and the backslash, as \\xHH', () => {
    const b = (...bytes: number[]) => Uint8Array.from(bytes);
    expect(shownName(Buffer.from('Canción.pdf'))).toBe('Canción.pdf');
    expect(shownName(Buffer.from('Cancio\u0301n €'))).toBe('Cancio\u0301n €');
    expect(shownName(b(0x61, 0xff, 0x64))).toBe('a\\xFFd');
    expect([shownName(b(0x62, 0xfe)), shownName(b(0x62, 0xfd))]).toEqual(['b\\xFE', 'b\\xFD']);
    // La barra invertida también: el texto "b\xFE" no es el byte 0xFE.
    expect(shownName(Buffer.from('a\\b'))).toBe('a\\x5Cb');
    expect(shownName(Buffer.from('b\\xFE'))).toBe('b\\x5CxFE');
    // Secuencias largas de más, sustitutos, más allá de U+10FFFF y cortadas: cada byte.
    expect(shownName(b(0xc0, 0xaf))).toBe('\\xC0\\xAF');
    expect(shownName(b(0xed, 0xa0, 0x80))).toBe('\\xED\\xA0\\x80');
    expect(shownName(b(0xf4, 0x90, 0x80, 0x80))).toBe('\\xF4\\x90\\x80\\x80');
    expect(shownName(b(0x61, 0xe2, 0x82))).toBe('a\\xE2\\x82');
    expect(shownName(b(0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x8e, 0xb5))).toBe('€🎵');
    // Un U+FEFF al principio de un tramo es parte del nombre: no se pierde.
    expect(shownName(b(0xef, 0xbb, 0xbf, 0x61))).toBe('\uFEFFa');
    expect(shownName(b(0xef, 0xbb, 0xbf))).toBe('\uFEFF');
    expect(shownName(b(0x5c, 0xef, 0xbb, 0xbf, 0x78))).toBe('\\x5C\uFEFFx');
    expect(shownName(b(0xff, 0xef, 0xbb, 0xbf, 0x61))).toBe('\\xFF\uFEFFa');
    // Dos nombres distintos nunca se muestran igual: de lo mostrado vuelven los bytes. Los tramos empiezan a menudo
    // con lo que más se presta a confundir: un U+FEFF, una barra invertida o un byte que no es UTF-8.
    const piece = fc.oneof(
      fc.constant([0xef, 0xbb, 0xbf]), fc.constant([0x5c]), fc.constant([0x5c, 0x78, 0x46, 0x46]), fc.integer({ min: 0x80, max: 0xff }).map((x) => [x]),
      fc.string({ unit: 'grapheme', maxLength: 3 }).map((text) => [...Buffer.from(text)]), fc.uint8Array({ maxLength: 4 }).map((bytes) => [...bytes]),
    );
    const names = fc.array(piece, { maxLength: 12 }).map((pieces) => Uint8Array.from(pieces.flat()));
    fc.assert(fc.property(names, (bytes) => bytesOf(shownName(bytes)).equals(Buffer.from(bytes))), { numRuns: 4000 });
    fc.assert(fc.property(fc.uint8Array({ maxLength: 40 }), (bytes) => bytesOf(shownName(bytes)).equals(Buffer.from(bytes))), { numRuns: 2000 });
  });

  it('a name that starts with U+FEFF is its own name: it hides nothing and takes the place of nothing', async () => {
    const BOM = '\uFEFF';
    const dir = delivery({ 'a.pdf': 'el declarado', [`${BOM}a.pdf`]: 'otro', 'b.pdf': 'b', [`${BOM}/b.pdf`]: 'otro b' });
    const resolver = dirMediaResolver(dir);
    expect((await listed(resolver)).map(([path]) => path)).toEqual(['a.pdf', 'b.pdf', `${BOM}/b.pdf`, `${BOM}a.pdf`]);
    expect(await resolver.stat('a.pdf')).toEqual({ type: 'file', size: Buffer.byteLength('el declarado'), path: 'a.pdf' });
    expect(await resolver.sha256('a.pdf')).toBe(sha('el declarado'));
    // Una carpeta que se llama U+FEFF es una carpeta más: cuenta sus entradas para el tope.
    const counted = delivery({ 'a': '1', [`${BOM}/1`]: '1', [`${BOM}/2`]: '2', [`${BOM}/3`]: '3' });
    expect(await folderFailure(listed(folderResolver(counted, {}, FOLDER_OPS, 4)))).toEqual(['tooManyEntries', '']);
    expect(await listed(folderResolver(counted, {}, FOLDER_OPS, 5))).toHaveLength(4);
  });

  it('a listing that gives a name twice is a change of the folder', async () => {
    const dir = delivery({ 'sub/a.pdf': 'a', 'sub/b.pdf': 'b' });
    const twice: FolderOps = {
      ...FOLDER_OPS,
      readdir: async (path) => {
        const entries = await FOLDER_OPS.readdir(path);
        const a = entries.find((e) => e.name.equals(Buffer.from('a.pdf')));
        return a === undefined ? entries : [...entries, a];
      },
    };
    expect(await folderFailure(listed(folderResolver(dir, {}, twice)))).toEqual(['modified', 'sub']);
  });

  it.skipIf(!INVALID_NAMES)('names that are not valid UTF-8 are listed with \\xHH, entered, and never confused', async () => {
    const dir = delivery();
    const at = (...bytes: number[]) => Buffer.concat([Buffer.from(`${dir}/`), Buffer.from(bytes)]);
    mkdirSync(at(0x61, 0xff, 0x64));
    writeFileSync(Buffer.concat([at(0x61, 0xff, 0x64), Buffer.from('/x.pdf')]), 'x');
    writeFileSync(at(0x62, 0xfe, 0x2e, 0x70), '1');
    writeFileSync(at(0x62, 0xfd, 0x2e, 0x70), '22');
    writeFileSync(join(dir, 'b\\xFE.p'), '333');
    const resolver = dirMediaResolver(dir);
    expect(await listed(resolver)).toEqual([['a\\xFFd/x.pdf', 'file'], ['b\\x5CxFE.p', 'file'], ['b\\xFD.p', 'file'], ['b\\xFE.p', 'file']]);
    // Un path con \\ no se busca: lo que se muestra con escapes nunca es un path declarado.
    for (const path of ['a\\xFFd/x.pdf', 'b\\xFE.p', 'b\\x5CxFE.p']) expect(await resolver.stat(path), path).toBeNull();
  });

  it('check refuses a root that is missing, is not a folder or cannot be read', async () => {
    const dir = delivery({ 'a.pdf': 'a' });
    expect(await dirMediaResolver(dir).check?.()).toBe('anchored');
    expect(await folderFailure(dirMediaResolver(join(dir, 'no-existe')).check?.() as Promise<void>)).toEqual(['missingDir', '']);
    expect(await folderFailure(dirMediaResolver(join(dir, 'a.pdf', 'x')).check?.() as Promise<void>)).toEqual(['missingDir', '']);
    expect(await folderFailure(dirMediaResolver(join(dir, 'a.pdf')).check?.() as Promise<void>)).toEqual(['notDirectory', '']);
    // Lo mismo si se usa sin check: list, stat y sha256 dan la misma falla.
    expect(await folderFailure(dirMediaResolver(join(dir, 'no-existe')).stat('a.pdf'))).toEqual(['missingDir', '']);
    expect(await folderFailure(listed(dirMediaResolver(join(dir, 'a.pdf'))))).toEqual(['notDirectory', '']);
  });

  // Quien lo lee todo (root) no tiene nada ilegible: estos tests se saltan.
  it.skipIf(READS_EVERYTHING)('check refuses a root that cannot be read, also one that can be searched but not listed', async () => {
    const closed = delivery({ 'a.pdf': 'a' });
    chmodSync(closed, 0o000);
    expect(await folderFailure(dirMediaResolver(closed).check?.() as Promise<void>)).toEqual(['permission', '']);
    const searchable = delivery({ 'a.pdf': 'a' });
    chmodSync(searchable, 0o300);
    expect(await folderFailure(dirMediaResolver(searchable).check?.() as Promise<void>)).toEqual(['permission', '']);
  });

  it.skipIf(READS_EVERYTHING)('an unreadable file is a folder failure when it has to be read', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'b.pdf': 'b' });
    chmodSync(join(dir, 'a.pdf'), 0o000);
    const resolver = dirMediaResolver(dir);
    // Se lista y se ve su tamaño sin leerlo; leerlo es lo que falla.
    expect(await listed(resolver)).toEqual([['a.pdf', 'file'], ['b.pdf', 'file']]);
    expect(await resolver.stat('a.pdf')).toMatchObject({ type: 'file', size: 1 });
    expect(await folderFailure(resolver.sha256('a.pdf'))).toEqual(['permission', 'a.pdf']);
    expect(await resolver.sha256('b.pdf')).toBe(sha('b'));
  });

  it.skipIf(READS_EVERYTHING)('a folder that can be listed but not searched is a folder failure at that folder', async () => {
    const dir = delivery({ 'rx/a.pdf': 'a' });
    chmodSync(join(dir, 'rx'), 0o444);
    expect(await folderFailure(dirMediaResolver(dir).stat('rx/a.pdf'))).toEqual(['permission', 'rx']);
  });

  it.skipIf(READS_EVERYTHING)('an unreadable folder in the delivery is a folder failure, never an entry', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'cerrada/b.pdf': 'b' });
    chmodSync(join(dir, 'cerrada'), 0o000);
    // Lo que no se puede leer podría esconder archivos no declarados: ni se lista ni se busca adentro.
    expect(await folderFailure(listed(dirMediaResolver(dir)))).toEqual(['permission', 'cerrada']);
    expect(await folderFailure(dirMediaResolver(dir).stat('cerrada/b.pdf'))).toEqual(['permission', 'cerrada']);
    // Un path que no pasa por ella no la mira.
    expect(await dirMediaResolver(dir).stat('a.pdf')).toMatchObject({ type: 'file' });
  });

  it('a folder removed after it was listed is a folder failure: the folder changed', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'sub/b.pdf': 'b' });
    const resolver = dirMediaResolver(dir);
    expect(await resolver.stat('a.pdf')).toMatchObject({ type: 'file' });
    rmSync(join(dir, 'sub'), { recursive: true });
    expect(await folderFailure(resolver.stat('sub/b.pdf'))).toEqual(['modified', 'sub']);
  });

  it('a folder with more entries than the limit is a folder failure, and each folder counts once', async () => {
    // Siete entradas: a, b, c y sub en la raíz, y d, e y f en sub.
    const dir = delivery({ 'a': '1', 'b': '2', 'c': '3', 'sub/d': '4', 'sub/e': '5', 'sub/f': '6' });
    expect(MAX_FOLDER_ENTRIES).toBe(100_000);
    const atSeven = folderResolver(dir, {}, FOLDER_OPS, 7);
    // Listar dos veces y buscar paths leen las mismas carpetas: se cuentan una vez.
    expect(await listed(atSeven)).toHaveLength(6);
    expect(await listed(atSeven)).toHaveLength(6);
    expect(await atSeven.stat('sub/d')).toMatchObject({ type: 'file' });
    expect(await folderFailure(listed(folderResolver(dir, {}, FOLDER_OPS, 6)))).toEqual(['tooManyEntries', '']);
    expect(await folderFailure(folderResolver(dir, {}, FOLDER_OPS, 3).stat('a'))).toEqual(['tooManyEntries', '']);
    // Lo que no se lee no cuenta: buscar un path de la raíz no lee sub.
    expect(await folderResolver(dir, {}, FOLDER_OPS, 4).stat('a')).toMatchObject({ type: 'file' });
  });

  it('what the declared paths need (each path and its folders) never counts toward the limit; the rest does, by exact name', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 20; i++) files[`p${i}/a/f`] = String(i);
    const dir = delivery(files);
    const paths = Object.keys(files);
    // Sesenta entradas, todas pedidas: con un tope de cinco, ni buscarlas ni listar todo lo pasa.
    const quiet = folderResolver(dir, {}, FOLDER_OPS, 5);
    quiet.declare?.(paths);
    for (const path of paths) expect(await quiet.stat(path), path).toMatchObject({ type: 'file' });
    expect(await listed(quiet)).toHaveLength(20);
    // Seis que no se piden pasan el tope, estén donde estén.
    for (let i = 0; i < 6; i++) writeFileSync(join(dir, `p${i}`, `extra${i}`), 'x');
    const extra = folderResolver(dir, {}, FOLDER_OPS, 5);
    extra.declare?.(paths);
    expect(await folderFailure(listed(extra))).toEqual(['tooManyEntries', '']);
    // Sin decir los paths, todo cuenta; y un nombre que solo coincide sin mayúsculas no es el declarado.
    expect(await folderFailure(listed(folderResolver(delivery(files), {}, FOLDER_OPS, 5)))).toEqual(['tooManyEntries', '']);
    const variant = folderResolver(delivery({ 'A.pdf': 'a' }), {}, FOLDER_OPS, 0);
    variant.declare?.(['a.pdf']);
    expect(await folderFailure(variant.stat('a.pdf'))).toEqual(['tooManyEntries', '']);
    const exact = folderResolver(delivery({ 'a.pdf': 'a' }), {}, FOLDER_OPS, 0);
    exact.declare?.(['a.pdf']);
    expect(await exact.stat('a.pdf')).toMatchObject({ type: 'file' });
  });

  it('the limit is global: it is reported at the folder root, the same in every run', async () => {
    const files: Record<string, string> = {};
    for (let c = 0; c < 8; c++) for (let f = 0; f < 20; f++) files[`c${c}/f${f}`] = '';
    const dir = delivery(files);
    const seen = new Set<string>();
    for (let run = 0; run < 10; run++) seen.add(JSON.stringify(await folderFailure(listed(folderResolver(dir, {}, FOLDER_OPS, 50)))));
    expect([...seen]).toEqual([JSON.stringify(['tooManyEntries', ''])]);
  });

  it('check controls the root without reading all of it, so the limit waits for the declared paths', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) files[`f${i}`] = String(i);
    const dir = delivery(files);
    const resolver = folderResolver(dir, {}, FOLDER_OPS, 2);
    await resolver.check?.();
    resolver.declare?.(Object.keys(files));
    expect(await listed(resolver)).toHaveLength(10);
  });

  it('a folder is opened once while it is used: never again per declared path, and at most FOLDER_HANDLES stay open without use', async () => {
    for (const count of [20, 150]) {
      const files: Record<string, string> = {};
      for (let i = 0; i < count; i++) files[`p${i}/a/f.pdf`] = String(i);
      const dir = delivery(files);
      const tracking = trackedOps(FOLDER_OPS);
      const resolver = folderResolver(dir, {}, tracking.ops);
      await resolver.check?.();
      resolver.declare?.(Object.keys(files));
      // Buscar cada path abre cada carpeta una vez (en Linux; con /.vol no se abre ninguna).
      for (const path of Object.keys(files)) expect(await resolver.stat(path), path).toMatchObject({ type: 'file' });
      expect(tracking.reopened(), `${count} stat`).toEqual([]);
      for (const path of Object.keys(files)) expect(await resolver.sha256(path), path).toBe(sha(files[path] as string));
      expect(await listed(resolver)).toHaveLength(count);
      // Con más carpetas que FOLDER_HANDLES, una que se cerró sin usar se puede volver a abrir en otra vuelta, una vez.
      if (2 * count < FOLDER_HANDLES) expect(tracking.reopened(), `${count}`).toEqual([]);
      else expect(Math.max(0, ...tracking.folderOpens.values()), `${count}`).toBeLessThanOrEqual(2);
      expect(tracking.open(), `${count} abiertas sin usar`).toBeLessThanOrEqual(FOLDER_HANDLES + 1);
      await resolver.close?.();
      expect(tracking.open(), `${count} después de close`).toBe(0);
    }
  });

  it('a folder of a wave that fails is reported after the other reads of the wave end, also the lstat that identifies one', async () => {
    const dir = delivery({ 'c0/a': '1', 'c1/a': '1', 'c2/a': '1', 'c3/a': '1' });
    for (const op of ['readdir', 'lstat'] as const) {
      let running = 0;
      let calls = 0;
      let failed = false;
      let startedAfter = 0;
      const slow: FolderOps = {
        ...FOLDER_OPS,
        [op]: async (path: Buffer) => {
          // Una carpeta de adentro falla enseguida (la primera que se lee, o c1 al identificarla); las otras tardan.
          const n = ++calls;
          const fails = op === 'readdir' ? n === 2 : named(path, 'c1');
          const slowly = op === 'readdir' ? n > 2 : ['c0', 'c2', 'c3'].some((c) => named(path, c));
          running++;
          if (failed) startedAfter++;
          try {
            if (fails) throw Object.assign(new Error('falla del disco'), { code: 'EIO' });
            if (slowly) await sleep(30);
            return await (FOLDER_OPS[op] as (p: Buffer) => Promise<unknown>)(path);
          } finally {
            running--;
          }
        },
      };
      let atFailure = -1;
      const failure = await listed(folderResolver(dir, {}, slow)).then(() => null, (error: unknown) => {
        atFailure = running;
        failed = true;
        return error;
      });
      await sleep(60);
      // Cuando list() falla no queda nada corriendo, ni empieza nada después.
      expect(failure, op).toMatchObject({ name: 'MediaFolderError', reason: 'io' });
      expect([atFailure, startedAfter], op).toEqual([0, 0]);
    }
  });

  it('too many open files is a folder failure of its own, wherever it happens', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'sub/b.pdf': 'b' });
    const fail = (code: string) => Promise.reject(Object.assign(new Error('demasiados archivos abiertos'), { code }));
    for (const code of ['EMFILE', 'ENFILE']) {
      // Al abrir el archivo, al identificar una entrada y al leer una carpeta de adentro (la segunda que se lee).
      let reads = 0;
      const opening: FolderOps = { ...FOLDER_OPS, open: (path, flags) => (named(path, 'b.pdf') ? fail(code) : FOLDER_OPS.open(path, flags)) };
      const looking: FolderOps = { ...FOLDER_OPS, lstat: (path) => (named(path, 'b.pdf') ? fail(code) : FOLDER_OPS.lstat(path)) };
      const reading: FolderOps = { ...FOLDER_OPS, readdir: (path) => (++reads === 2 ? fail(code) : FOLDER_OPS.readdir(path)) };
      expect(await folderFailure(folderResolver(dir, {}, opening).sha256('sub/b.pdf')), code).toEqual(['tooManyOpenFiles', 'sub/b.pdf']);
      expect(await folderFailure(folderResolver(dir, {}, looking).stat('sub/b.pdf')), code).toEqual(['tooManyOpenFiles', 'sub/b.pdf']);
      expect(await folderFailure(folderResolver(dir, {}, reading).stat('sub/b.pdf')), code).toEqual(['tooManyOpenFiles', 'sub']);
    }
    // Otra falla del disco sigue siendo io.
    const broken: FolderOps = { ...FOLDER_OPS, open: (path, flags) => (named(path, 'b.pdf') ? fail('EIO') : FOLDER_OPS.open(path, flags)) };
    expect(await folderFailure(folderResolver(dir, {}, broken).sha256('sub/b.pdf'))).toEqual(['io', 'sub/b.pdf']);
  });

  it('a resolver at / builds the paths of its entries as /name', async () => {
    // Por la ruta, cada operación usa la ruta real de la entrada: con la raíz /, /usr y no //usr.
    const used: string[] = [];
    const spy: FolderOps = {
      ...FOLDER_OPS,
      lstat: (path) => (used.push(path.toString()), path.toString().startsWith('/.vol/') ? Promise.reject(Object.assign(new Error('sin rutas por id'), { code: 'ENOENT' })) : FOLDER_OPS.lstat(path)),
      readlink: (path) => (path.startsWith('/proc/') ? Promise.reject(Object.assign(new Error('sin /proc'), { code: 'ENOENT' })) : FOLDER_OPS.readlink(path)),
      open: (path, flags) => (used.push(path.toString()), FOLDER_OPS.open(path, flags)),
    };
    const name = readdirSync('/').find((n) => lstatSync(`/${n}`).isDirectory()) as string;
    const resolver = folderResolver('/', {}, spy);
    await resolver.check?.({ privateCopy: true });
    expect(await resolver.stat(name)).toMatchObject({ type: 'other', path: name });
    expect(used.filter((path) => path.startsWith('//'))).toEqual([]);
  });

  it.skipIf(ROOT_FILE === null)('a file right below / is read whole: its real path is /name', async () => {
    const name = ROOT_FILE as string;
    expect(await dirMediaResolver('/').sha256(name)).toBe(sha(readFileSync(`/${name}`)));
  });

  it.skipIf(!ANCHORED)('a failure while the root is anchored is a folder failure, never a lookup by path', async () => {
    const dir = delivery({ 'sub/a.pdf': 'a' });
    const real = realpathSync(dir);
    const seen = lstatSync(real, { bigint: true });
    const byId = `/.vol/${seen.dev}/${seen.ino}`;
    const reject = (code: string) => Promise.reject(Object.assign(new Error('falla al anclar la raíz'), { code }));
    // En macOS, la raíz por su id falla; en Linux, la raíz abierta está en otro lugar (se movió) o no se puede abrir.
    const anchoring = (code: string | null): FolderOps => ({
      ...FOLDER_OPS,
      lstat: (path) => (path.toString() === byId ? reject(code ?? 'ENOENT') : FOLDER_OPS.lstat(path)),
      open: (path, flags) => (code !== null && path.toString() === real ? reject(code) : FOLDER_OPS.open(path, flags)),
      readlink: async (path) => {
        const link = await FOLDER_OPS.readlink(path);
        return link.equals(Buffer.from(real)) ? Buffer.from(`${real}-movida`) : link;
      },
    });
    const byPathBelowRoot: string[] = [];
    const watched = (ops: FolderOps): FolderOps => ({
      ...ops,
      readdir: (path) => (path.toString().startsWith(`${real}/`) && byPathBelowRoot.push(path.toString()), ops.readdir(path)),
      lstat: (path) => (path.toString().startsWith(`${real}/`) && byPathBelowRoot.push(path.toString()), ops.lstat(path)),
    });
    // La raíz por su id es otra carpeta (otro ino): cambió.
    const other: FolderOps = {
      ...FOLDER_OPS,
      lstat: async (path) => (path.toString() === byId ? onAnotherDevice(await FOLDER_OPS.lstat(path)) : FOLDER_OPS.lstat(path)),
      open: async (path, flags) => {
        const handle = await FOLDER_OPS.open(path, flags);
        if (path.toString() !== real) return handle;
        const stat = handle.stat.bind(handle);
        return Object.assign(handle, { stat: async (opts: { bigint: true }) => onAnotherDevice(await stat(opts)) });
      },
    };
    expect(await folderFailure(folderResolver(dir, {}, watched(other)).check?.() as Promise<unknown>)).toEqual(['modified', '']);
    const moved = folderResolver(dir, {}, watched(anchoring(null)));
    expect(await folderFailure(moved.check?.() as Promise<unknown>)).toEqual(['modified', '']);
    expect(await folderFailure(moved.stat('sub/a.pdf'))).toEqual(['modified', '']);
    expect(await folderFailure(folderResolver(dir, {}, anchoring('EMFILE')).check?.() as Promise<unknown>)).toEqual(['tooManyOpenFiles', '']);
    expect(await folderFailure(folderResolver(dir, {}, anchoring('EACCES')).check?.() as Promise<unknown>)).toEqual(['permission', '']);
    expect(byPathBelowRoot).toEqual([]);
  });

  it('without anchoring (no /.vol on the volume, no /proc) the folder is unanchored, unless the receiver says it is a private copy', async () => {
    const dir = delivery({ 'sub/a.pdf': 'a' });
    // Con anclaje, la copia privada no cambia nada.
    if (ANCHORED) {
      expect(await folderResolver(dir, {}, FOLDER_OPS).check?.()).toBe('anchored');
      expect(await folderResolver(dir, {}, FOLDER_OPS).check?.({ privateCopy: true })).toBe('anchored');
    }
    expect(await folderFailure(folderResolver(dir, {}, BY_PATH).check?.() as Promise<unknown>)).toEqual(['unanchored', '']);
    expect(await folderFailure(folderResolver(dir, {}, BY_PATH).stat('sub/a.pdf'))).toEqual(['unanchored', '']);
    const copy = folderResolver(dir, {}, BY_PATH);
    expect(await copy.check?.({ privateCopy: true })).toBe('path');
    expect(await copy.sha256('sub/a.pdf')).toBe(sha('a'));
    // En macOS, un volumen cuyo /.vol/<dev>/2 no es su raíz (otro dev o ino, o no una carpeta) no se ancla.
    if (process.platform === 'darwin') {
      const seen = lstatSync(dir, { bigint: true });
      for (const change of [{ ino: 5n }, { dev: seen.dev + 1n }]) {
        const odd: FolderOps = {
          ...FOLDER_OPS,
          lstat: async (path) => {
            const stats = await FOLDER_OPS.lstat(path);
            return path.toString() === `/.vol/${seen.dev}/2` ? Object.assign(Object.create(Object.getPrototypeOf(stats) as object) as BigIntStats, stats, change) : stats;
          },
        };
        expect(await folderFailure(folderResolver(dir, {}, odd).check?.() as Promise<unknown>), JSON.stringify(change, (_, v: unknown) => (typeof v === 'bigint' ? String(v) : v))).toEqual(['unanchored', '']);
      }
    }
    // Demasiados archivos abiertos al mirar si se puede anclar es esa falla, no la falta de anclaje.
    const crowded: FolderOps = {
      ...FOLDER_OPS,
      lstat: (path) => (path.toString().startsWith('/.vol/') ? Promise.reject(Object.assign(new Error('demasiados'), { code: 'EMFILE' })) : FOLDER_OPS.lstat(path)),
      open: (path, flags) => (path.toString() === '/' ? Promise.reject(Object.assign(new Error('demasiados'), { code: 'EMFILE' })) : FOLDER_OPS.open(path, flags)),
    };
    if (ANCHORED) expect(await folderFailure(folderResolver(dir, {}, crowded).check?.({ privateCopy: true }) as Promise<unknown>)).toEqual(['tooManyOpenFiles', '']);
  });

  it('a folder on another device than its parent (a mount point) is other: listed as such and never entered', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'm/x.pdf': 'x' });
    for (const base of [FOLDER_OPS, BY_PATH]) {
      const mounted: FolderOps = { ...base, lstat: async (path) => (named(path, 'm') ? onAnotherDevice(await base.lstat(path)) : base.lstat(path)) };
      const resolver = folderResolver(dir, {}, mounted);
      if (base === BY_PATH) await resolver.check?.({ privateCopy: true });
      expect(await listed(resolver)).toEqual([['a.pdf', 'file'], ['m', 'other']]);
      expect(await resolver.stat('m')).toMatchObject({ type: 'other', path: 'm' });
      expect(await resolver.stat('m/x.pdf')).toBeNull();
    }
  });

  it('a path at the system limit is tooLong where it stops fitting, before anything is done with it, for several segment lengths', async () => {
    for (const segment of ['a', 'bb', 'ccc', 'd'.repeat(7), 'e'.repeat(50)]) {
      const { dir, first } = chainPastPathMax(segment);
      expect(Buffer.byteLength(`${realpathSync(dir)}/${first}`), segment).toBe(PATH_MAX);
      const reads: string[] = [];
      const counting: FolderOps = {
        ...FOLDER_OPS,
        readdir: (path) => (reads.push(path.toString()), FOLDER_OPS.readdir(path)),
        opendir: (path) => (reads.push(path.toString()), FOLDER_OPS.opendir(path)),
      };
      // La primera carpeta que no entra es tooLong, en su lugar; ni un cambio ni un tope de entradas, y cada carpeta se lee una vez.
      expect(await folderFailure(listed(folderResolver(dir, {}, counting))), segment).toEqual(['tooLong', first]);
      expect(new Set(reads).size, segment).toBe(reads.length);
      expect(reads.length, segment).toBeLessThanOrEqual(first.split('/').length + 1);
      const below = `${first}/${segment}/x.pdf`.split('/').filter((s) => s !== '').join('/');
      expect(await folderFailure(dirMediaResolver(dir).stat(below)), segment).toEqual(['tooLong', first]);
      expect(await dirMediaResolver(dir).stat(first.split('/').slice(0, -1).join('/')), segment).toMatchObject({ type: 'other' });
    }
  }, 60_000);

  it('a folder with the dev and ino of one that holds it is tooLong, and is never entered', async () => {
    const dir = delivery({ 'a/b/x.pdf': 'x' });
    const a = lstatSync(join(dir, 'a'), { bigint: true });
    for (const base of [FOLDER_OPS, BY_PATH]) {
      let reads = 0;
      // b se ve como a, la carpeta que la tiene: entrar sería volver a leer a sin fin.
      const looping: FolderOps = {
        ...base,
        lstat: async (path) => {
          const stats = await base.lstat(path);
          return named(path, 'b') ? Object.assign(Object.create(Object.getPrototypeOf(stats) as object) as BigIntStats, a) : stats;
        },
        readdir: (path) => (reads++, base.readdir(path)),
        opendir: (path) => (reads++, base.opendir(path)),
      };
      const resolver = folderResolver(dir, {}, looping, 1000);
      if (base === BY_PATH) await resolver.check?.({ privateCopy: true });
      reads = 0;
      expect(await folderFailure(listed(resolver))).toEqual(['tooLong', 'a/b']);
      expect(reads).toBeLessThanOrEqual(2);
    }
  });

  it.skipIf(!ANCHORED)('every entry is reached through the anchor of this system: /.vol on macOS, /proc/self/fd on Linux', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'sub/b.pdf': 'b', 'sub/c/d.pdf': 'd' });
    const real = realpathSync(dir);
    const used: string[] = [];
    const spy: FolderOps = {
      ...FOLDER_OPS,
      lstat: (path) => (used.push(path.toString()), FOLDER_OPS.lstat(path)),
      readdir: (path) => (used.push(path.toString()), FOLDER_OPS.readdir(path)),
      opendir: (path) => (used.push(path.toString()), FOLDER_OPS.opendir(path)),
      open: (path, flags) => (used.push(path.toString()), FOLDER_OPS.open(path, flags)),
    };
    const resolver = folderResolver(dir, {}, spy);
    await resolver.check?.();
    used.length = 0;
    expect(await listed(resolver)).toHaveLength(3);
    expect(await resolver.stat('sub/c/d.pdf')).toMatchObject({ type: 'file' });
    expect(await resolver.sha256('sub/b.pdf')).toBe(sha('b'));
    expect(await resolver.sha256('a.pdf')).toBe(sha('a'));
    // Por su ruta, solo la raíz (en macOS, el control después de leerla).
    const anchor = process.platform === 'darwin' ? '/.vol/' : '/proc/self/fd/';
    expect(used.filter((path) => !path.startsWith(anchor) && path !== real)).toEqual([]);
    expect(used.filter((path) => path.startsWith(anchor)).length).toBeGreaterThan(8);
  });

  it('with nothing running, the folders left open are closed on the next turn, without close', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'sub/b.pdf': 'b', 'sub/c/d.pdf': 'd' });
    const tracking = trackedOps(FOLDER_OPS);
    const resolver = folderResolver(dir, {}, tracking.ops);
    await resolver.check?.();
    expect(await listed(resolver)).toHaveLength(3);
    expect(await resolver.sha256('sub/c/d.pdf')).toBe(sha('d'));
    for (let turn = 0; turn < 3; turn++) await new Promise((resolve) => setImmediate(resolve));
    expect(tracking.open()).toBe(0);
    // Y se pueden volver a abrir.
    expect(await resolver.sha256('sub/b.pdf')).toBe(sha('b'));
  });

  it('by path, the root is controlled by its real path: another folder there is a change', async () => {
    const dir = delivery({ 'a.pdf': 'a' });
    const real = realpathSync(dir);
    const moved: FolderOps = { ...BY_PATH, lstat: async (path) => (path.toString() === real ? onAnotherDevice(await BY_PATH.lstat(path)) : BY_PATH.lstat(path)) };
    expect(await folderFailure(folderResolver(dir, {}, moved).check?.({ privateCopy: true }) as Promise<unknown>)).toEqual(['modified', '']);
  });

  it('a folder counts once toward the limit by what it is, also when it shows up with another name in another list', async () => {
    // Seis entradas: a, b, c y sub, y d y e en sub; con el tope en seis, listar dos veces no lo pasa aunque sub cambie de nombre.
    const dir = delivery({ 'a': '1', 'b': '2', 'c': '3', 'sub/d': '4', 'sub/e': '5' });
    const resolver = folderResolver(dir, {}, FOLDER_OPS, 6);
    expect(await listed(resolver)).toHaveLength(5);
    renameSync(join(dir, 'sub'), join(dir, 'otro'));
    expect((await listed(resolver)).map(([path]) => path)).toEqual(['a', 'b', 'c', 'otro/d', 'otro/e']);
  });

  it('a big folder is read in parts, and reading stops at the limit', async () => {
    const dir = delivery();
    for (let i = 0; lstatSync(dir).size <= 64 * 1024 && i < 50_000; i += 100) {
      for (let j = i; j < i + 100; j++) closeSync(openSync(join(dir, `un-nombre-largo-para-que-crezca-${j}`), 'w'));
    }
    let fetched = 0;
    const counting: FolderOps = {
      ...FOLDER_OPS,
      readdir: async (path) => {
        const entries = await FOLDER_OPS.readdir(path);
        fetched += entries.length;
        return entries;
      },
      opendir: async (path) => {
        const entries = await FOLDER_OPS.opendir(path);
        return (async function* () {
          for await (const entry of entries) {
            fetched++;
            yield entry;
          }
        })();
      },
    };
    expect(await folderFailure(listed(folderResolver(dir, {}, counting, 10)))).toEqual(['tooManyEntries', '']);
    expect(fetched).toBe(11);
  });

  it('no file or folder is left open: after each operation, after a failure, and after close', async () => {
    const outside = delivery({ 'secreto.txt': 'no' });
    const scenarios: [string, (dir: string) => FolderOps, (r: MediaResolver, dir: string) => Promise<unknown>][] = [
      ['quiet', () => FOLDER_OPS, async (r) => [await listed(r), await r.stat('sub/b.pdf'), await r.sha256('sub/b.pdf'), await r.sha256('a.pdf')]],
      ['a file swapped for a link before its open', (dir) => ({
        ...FOLDER_OPS,
        open: async (path, flags) => {
          if (named(path, 'b.pdf')) {
            rmSync(join(dir, 'sub/b.pdf'));
            symlinkSync(join(outside, 'secreto.txt'), join(dir, 'sub/b.pdf'));
          }
          return FOLDER_OPS.open(path, flags);
        },
      }), (r) => r.sha256('sub/b.pdf')],
      ['a folder that is another one when it is opened', () => ({
        ...FOLDER_OPS,
        open: async (path, flags) => {
          const handle = await FOLDER_OPS.open(path, flags);
          if (!named(path, 'sub')) return handle;
          const stat = handle.stat.bind(handle);
          return Object.assign(handle, { stat: async (opts: { bigint: true }) => onAnotherDevice(await stat(opts)) });
        },
      }), (r) => listed(r)],
      ['a file that is another one when it is opened', () => ({
        ...FOLDER_OPS,
        open: async (path, flags) => {
          const handle = await FOLDER_OPS.open(path, flags);
          if (!named(path, 'b.pdf')) return handle;
          const stat = handle.stat.bind(handle);
          return Object.assign(handle, { stat: async (opts: { bigint: true }) => onAnotherDevice(await stat(opts)) });
        },
      }), (r) => r.sha256('sub/b.pdf')],
      ['a folder that fails while it is read', () => {
        let reads = 0;
        return { ...FOLDER_OPS, readdir: (path) => (++reads === 2 ? Promise.reject(Object.assign(new Error('falla'), { code: 'EIO' })) : FOLDER_OPS.readdir(path)) };
      }, (r) => listed(r)],
      ['too many open files at a file', () => ({
        ...FOLDER_OPS,
        open: (path, flags) => (named(path, 'b.pdf') ? Promise.reject(Object.assign(new Error('demasiados'), { code: 'EMFILE' })) : FOLDER_OPS.open(path, flags)),
      }), (r) => r.sha256('sub/b.pdf')],
    ];
    for (const [label, opsOf, work] of scenarios) {
      const dir = delivery({ 'a.pdf': 'a', 'sub/b.pdf': 'b', 'sub/c/d.pdf': 'd' });
      const tracking = trackedOps(opsOf(dir));
      const resolver = folderResolver(dir, {}, tracking.ops);
      await resolver.check?.();
      await work(resolver, dir).catch((error: unknown) => {
        if (!(error instanceof MediaFolderError)) throw error;
      });
      expect(tracking.open(), `${label}: sin usar`).toBeLessThanOrEqual(FOLDER_HANDLES + 1);
      await resolver.close?.();
      expect(tracking.open(), label).toBe(0);
    }
  });

  it('ignore hides matching files from list, not from stat or sha256', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'x.tmp': 't', 'sub/x.tmp': 't', 'tmp/a': 'a', 'sub/tmp/a': 'a' });
    const resolver = dirMediaResolver(dir, { ignore: ['*.tmp', 'tmp/**'] });
    expect(await listed(resolver)).toEqual([['a.pdf', 'file'], ['sub/tmp/a', 'file']]);
    expect(await resolver.stat('x.tmp')).toMatchObject({ type: 'file', size: 1 });
    expect(await resolver.sha256('sub/x.tmp')).toBe(sha('t'));
    // Sin ignore, todo.
    expect((await listed(dirMediaResolver(dir))).map(([path]) => path)).toEqual(['a.pdf', 'sub/tmp/a', 'sub/x.tmp', 'tmp/a', 'x.tmp']);
  });
});

/**
 * Lo que cambia mientras se lee la carpeta: las operaciones del sistema de
 * archivos con un gancho que la cambia justo antes de una, en el modo propio
 * del sistema (anclado a la carpeta ya vista) y en el que va por rutas.
 */
describe('a folder that changes while it is read', () => {
  const modes: [string, FolderOps][] = [['the anchored mode of this system', FOLDER_OPS], ['by path', BY_PATH]];
  /** Un resolver en ese modo: por la ruta, solo con una copia privada. */
  async function resolverIn(dir: string, ops: FolderOps, base: FolderOps): Promise<MediaResolver> {
    const resolver = folderResolver(dir, {}, ops);
    if (base === BY_PATH) await resolver.check?.({ privateCopy: true });
    return resolver;
  }
  /** Las operaciones de base con `open` o `lstat` cambiados para la entrada `name`, una sola vez. */
  function once(base: FolderOps, op: 'open' | 'lstat', name: string, change: () => void): FolderOps {
    let done = false;
    const fire = (path: Buffer | string) => {
      if (!done && named(path, name)) {
        done = true;
        change();
      }
    };
    if (op === 'open') return { ...base, open: async (path, flags) => (fire(path), base.open(path, flags)) };
    return { ...base, lstat: async (path) => { const stats = await base.lstat(path); fire(path); return stats; } };
  }

  for (const [mode, base] of modes) {
    it(`a file swapped for a link, another file or a fifo between its lstat and its open is never read (${mode})`, async () => {
      const outside = delivery({ 'secreto.txt': 'secreto' });
      for (const swap of ['link', 'file', 'fifo'] as const) {
        const dir = delivery({ 'a.pdf': 'a' });
        const ops = once(base, 'open', 'a.pdf', () => {
          rmSync(join(dir, 'a.pdf'));
          if (swap === 'link') symlinkSync(join(outside, 'secreto.txt'), join(dir, 'a.pdf'));
          else if (swap === 'file') writeFileSync(join(dir, 'a.pdf'), 'otro contenido');
          // Sin O_NONBLOCK, abrir un fifo para leer espera para siempre a quien escriba.
          else mkfifo(join(dir, 'a.pdf'));
        });
        const resolver = await resolverIn(dir, ops, base);
        expect(await resolver.stat('a.pdf')).toMatchObject({ type: 'file', size: 1 });
        expect(await folderFailure(resolver.sha256('a.pdf')), swap).toEqual(['modified', 'a.pdf']);
      }
    }, 10_000);

    it(`a link to the same file, put in its place before the open, is not followed (${mode})`, async () => {
      const dir = delivery({ 'a.pdf': 'a' });
      // Es el mismo archivo (mismo dev, ino, tamaño y fecha): solo O_NOFOLLOW lo ve.
      const ops = once(base, 'open', 'a.pdf', () => {
        renameSync(join(dir, 'a.pdf'), join(dir, 'b.pdf'));
        symlinkSync('b.pdf', join(dir, 'a.pdf'));
      });
      const resolver = await resolverIn(dir, ops, base);
      expect(await resolver.stat('a.pdf')).toMatchObject({ type: 'file', size: 1 });
      expect(await folderFailure(resolver.sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
    });

    it(`a file rewritten in place after its lstat, with another size or the same, is a change of the folder (${mode})`, async () => {
      const dir = delivery({ 'a.pdf': 'uno' });
      const resolver = await resolverIn(dir, base, base);
      expect(await resolver.stat('a.pdf')).toMatchObject({ type: 'file', size: 3 });
      writeFileSync(join(dir, 'a.pdf'), 'otro largo');
      expect(await folderFailure(resolver.sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
      // Con el mismo tamaño, la fecha lo dice.
      const same = delivery({ 'a.pdf': 'uno' });
      const again = await resolverIn(same, base, base);
      expect(await again.stat('a.pdf')).toMatchObject({ type: 'file', size: 3 });
      writeFileSync(join(same, 'a.pdf'), 'dos');
      utimesSync(join(same, 'a.pdf'), new Date(), new Date(Date.now() + 60_000));
      expect(await folderFailure(again.sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
    });

    it(`a file that grows while it is read is a change of the folder (${mode})`, async () => {
      const dir = delivery({ 'a.pdf': 'uno' });
      // Crece justo después del fstat que lo controla: lo que se lee ya no tiene el tamaño que se vio.
      const growing: FolderOps = {
        ...base,
        open: async (path, flags) => {
          const handle = await base.open(path, flags);
          if (!named(path, 'a.pdf')) return handle;
          const stat = handle.stat.bind(handle);
          return Object.assign(handle, {
            stat: async (opts: { bigint: true }) => {
              const stats = await stat(opts);
              appendFileSync(join(dir, 'a.pdf'), ' y algo más');
              return stats;
            },
          });
        },
      };
      expect(await folderFailure((await resolverIn(dir, growing, base)).sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
    });

    it(`the file opened has to be the one seen: another dev and ino, or something that is not a file with the same ones (${mode})`, async () => {
      // Otro ino que el visto: el archivo abierto es otro, aunque esté en el mismo lugar.
      const dir = delivery({ 'a.pdf': 'a' });
      const other: FolderOps = {
        ...base,
        lstat: async (path) => {
          const stats = await base.lstat(path);
          return named(path, 'a.pdf') ? Object.assign(Object.create(Object.getPrototypeOf(stats) as object) as BigIntStats, stats, { ino: stats.ino + 1000n }) : stats;
        },
      };
      expect(await folderFailure((await resolverIn(dir, other, base)).sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
      // Un fifo con el dev y el ino que se vieron (un ino que se reusó): no es un archivo regular.
      const reused = delivery({ 'a.pdf': 'a' });
      mkfifo(join(reused, 'tubo'));
      const fifo = lstatSync(join(reused, 'tubo'), { bigint: true });
      const asFile: FolderOps = {
        ...base,
        lstat: async (path) => {
          const stats = await base.lstat(path);
          return named(path, 'a.pdf') ? Object.assign(Object.create(Object.getPrototypeOf(stats) as object) as BigIntStats, stats, { dev: fifo.dev, ino: fifo.ino, size: fifo.size, mtimeNs: fifo.mtimeNs }) : stats;
        },
        open: async (path, flags) => {
          if (named(path, 'a.pdf')) renameSync(join(reused, 'tubo'), join(reused, 'a.pdf'));
          return base.open(path, flags);
        },
      };
      expect(await folderFailure((await resolverIn(reused, asFile, base)).sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
    }, 10_000);

    it(`a folder swapped for another folder while it is listed is a change (${mode})`, async () => {
      const dir = delivery({ 'sub/a.pdf': 'a', 'otra/b.pdf': 'b' });
      const swap = () => {
        renameSync(join(dir, 'sub'), join(dir, 'subD'));
        renameSync(join(dir, 'otra'), join(dir, 'sub'));
      };
      const resolver = await resolverIn(dir, once(base, 'lstat', 'sub', swap), base);
      expect(await folderFailure(resolver.stat('sub/a.pdf'))).toEqual(['modified', 'sub']);
    });

    it(`an entry that is no longer what its folder listed is a change (${mode})`, async () => {
      const dir = delivery({ 'a.pdf': 'a', 'b.pdf': 'b' });
      const resolver = await resolverIn(dir, base, base);
      expect(await resolver.stat('b.pdf')).toMatchObject({ type: 'file' });
      // La carpeta ya se listó con a.pdf como archivo; ahora es un enlace.
      rmSync(join(dir, 'a.pdf'));
      symlinkSync('b.pdf', join(dir, 'a.pdf'));
      expect(await folderFailure(resolver.stat('a.pdf'))).toEqual(['modified', 'a.pdf']);
    });

    it(`a folder swapped for a link to another folder while it is listed is a change, and nothing of the other is listed (${mode})`, async () => {
      const outside = delivery({ 'solo-afuera.txt': 'x', 'a.pdf': 'afuera' });
      const dir = delivery({ 'sub/a.pdf': 'a' });
      const swap = () => {
        renameSync(join(dir, 'sub'), join(dir, 'subD'));
        symlinkSync(outside, join(dir, 'sub'));
      };
      const listedPaths: string[] = [];
      const list = await resolverIn(dir, once(base, 'lstat', 'sub', swap), base);
      const failure = await folderFailure((async () => { for await (const e of list.list()) listedPaths.push(e.path); })());
      expect(failure).toEqual(['modified', 'sub']);
      expect(listedPaths.filter((p) => p.includes('solo-afuera'))).toEqual([]);
      // Lo mismo buscando un path que pasa por ella.
      rmSync(join(dir, 'sub'));
      renameSync(join(dir, 'subD'), join(dir, 'sub'));
      const stat = await resolverIn(dir, once(base, 'lstat', 'sub', swap), base);
      expect(await folderFailure(stat.sha256('sub/a.pdf'))).toEqual(['modified', 'sub']);
    });
  }

  it.skipIf(process.platform !== 'linux')('on Linux, a file renamed after it is opened is a change: its real path is not the one listed', async () => {
    const dir = delivery({ 'a.pdf': 'a' });
    const renaming: FolderOps = {
      ...FOLDER_OPS,
      open: async (path, flags) => {
        const handle = await FOLDER_OPS.open(path, flags);
        if (named(path, 'a.pdf')) renameSync(join(dir, 'a.pdf'), join(dir, 'movido.pdf'));
        return handle;
      },
    };
    expect(await folderFailure(folderResolver(dir, {}, renaming).sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
  });
});

/**
 * Una carpeta que cambia y vuelve: justo antes de una operación sobre lo que
 * hay adentro de la raíz o de una carpeta, esa carpeta se cambia por un enlace
 * a una copia de afuera (los mismos nombres, otro contenido) y se vuelve a
 * poner apenas termina, así los controles de antes y de después la ven igual.
 * Anclada, nada de afuera llega al resultado; por la ruta, sí: por eso, sin
 * anclaje, la carpeta tiene que ser una copia privada.
 */
describe('a folder that changes and comes back around one operation', () => {
  const INSIDE = { 'a.pdf': 'a', 'sub/secreto.txt': 'adentro' };
  const OUTSIDE = { 'a.pdf': 'otro a', 'solo-afuera.pdf': 'x', 'sub/secreto.txt': 'el de afuera, más largo', 'sub/solo-afuera.txt': 'x' };
  type Op = 'lstat' | 'readdir' | 'open';

  /**
   * Las operaciones de base de a una, con `target` cambiado por un enlace a `twin` alrededor de cada operación de
   * `ops` sobre algo de adentro de `target` (por su id, por la carpeta abierta o por su ruta).
   */
  function changing(base: FolderOps, ops: readonly Op[], target: string, twin: string): { ops: FolderOps; arm: () => void; swaps: () => number } {
    const real = realpathSync(target);
    const id = lstatSync(real, { bigint: true });
    // Leer la carpeta es mirar lo de adentro; mirarla a ella (su lstat) no.
    const inside = (op: Op, path: string): boolean => {
      if (op === 'readdir' && path === real) return true;
      if (path.startsWith('/.vol/')) return path.split('/')[3] === String(id.ino);
      const fd = /^\/proc\/self\/fd\/(\d+)(?:\/|$)/u.exec(path);
      if (fd !== null) {
        try {
          return readlinkSync(`/proc/self/fd/${fd[1] as string}`) === real;
        } catch {
          return false;
        }
      }
      return path.startsWith(`${real}/`);
    };
    let armed = false;
    let swaps = 0;
    let chain: Promise<unknown> = Promise.resolve();
    const serial = <T>(work: () => Promise<T>): Promise<T> => {
      const run = chain.then(work);
      chain = run.then(() => undefined, () => undefined);
      return run;
    };
    const around = <T>(op: Op, path: Buffer | string, work: () => Promise<T>): Promise<T> => serial(async () => {
      if (!armed || !ops.includes(op) || !inside(op, path.toString())) return work();
      swaps++;
      renameSync(real, `${real}-original`);
      symlinkSync(twin, real);
      try {
        return await work();
      } finally {
        rmSync(real);
        renameSync(`${real}-original`, real);
      }
    });
    return {
      arm: () => {
        armed = true;
      },
      swaps: () => swaps,
      ops: {
        stat: (path) => serial(() => base.stat(path)),
        realpath: (path) => serial(() => base.realpath(path)),
        readlink: (path) => serial(() => base.readlink(path)),
        lstat: (path) => around('lstat', path, () => base.lstat(path)),
        readdir: (path) => around('readdir', path, () => base.readdir(path)),
        opendir: (path) => around('readdir', path, () => base.opendir(path)),
        open: (path, flags) => around('open', path, () => base.open(path, flags)),
      },
    };
  }

  /** Lo que da el resolver de la carpeta: list(), el tamaño y el sha256 de cada archivo. */
  async function everything(resolver: MediaResolver): Promise<unknown> {
    return {
      listed: (await listed(resolver)).map(([path]) => path),
      sub: [await resolver.stat('sub/secreto.txt'), await resolver.sha256('sub/secreto.txt')],
      a: [await resolver.stat('a.pdf'), await resolver.sha256('a.pdf')],
    };
  }
  const QUIET = {
    listed: ['a.pdf', 'sub/secreto.txt'],
    sub: [{ type: 'file', size: Buffer.byteLength('adentro'), path: 'sub/secreto.txt' }, sha('adentro')],
    a: [{ type: 'file', size: 1, path: 'a.pdf' }, sha('a')],
  };
  const SETS: Op[][] = [['lstat'], ['readdir'], ['open'], ['lstat', 'readdir', 'open']];

  for (const where of ['the root', 'a folder inside'] as const) {
    for (const ops of SETS) {
      it.skipIf(!ANCHORED)(`anchored, nothing from outside reaches the result: ${where} swapped and restored around each ${ops.join(', ')}`, async () => {
        const dir = delivery(INSIDE);
        const twin = delivery(OUTSIDE);
        const target = where === 'the root' ? dir : join(dir, 'sub');
        const swapping = changing(FOLDER_OPS, ops, target, where === 'the root' ? twin : join(twin, 'sub'));
        const resolver = folderResolver(dir, {}, swapping.ops);
        expect(await resolver.check?.()).toBe('anchored');
        swapping.arm();
        expect(await everything(resolver)).toEqual(QUIET);
        expect(swapping.swaps()).toBeGreaterThan(0);
      });
    }
  }

  it('by path, a change that comes back between the controls is not seen: that is why it needs a private copy', async () => {
    const dir = delivery(INSIDE);
    const twin = delivery(OUTSIDE);
    const listing = changing(BY_PATH, ['readdir'], dir, twin);
    const byPath = folderResolver(dir, {}, listing.ops);
    expect(await byPath.check?.({ privateCopy: true })).toBe('path');
    listing.arm();
    expect((await listed(byPath)).map(([path]) => path)).toContain('solo-afuera.pdf');
    const reading = changing(BY_PATH, ['lstat', 'readdir', 'open'], join(dir, 'sub'), join(twin, 'sub'));
    const again = folderResolver(dir, {}, reading.ops);
    await again.check?.({ privateCopy: true });
    reading.arm();
    expect(await again.sha256('sub/secreto.txt')).toBe(sha('el de afuera, más largo'));
  });
});
