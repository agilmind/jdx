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
import { appendFileSync, type BigIntStats, chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { caseVariant, dirMediaResolver, FOLDER_OPS, type FolderOps, folderResolver, MAX_FOLDER_ENTRIES } from '../../../src/media/dirMediaResolver.js';
import { MediaFolderError } from '../../../src/media/errors.js';
import { shownName } from '../../../src/media/path.js';
import type { MediaResolver } from '../../../src/types.js';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) {
    chmodTree(dir);
    rmSync(dir, { recursive: true, force: true });
  }
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
/** Si quien corre los tests puede leer lo que no tiene permiso (root): entonces no hay nada ilegible. */
function readsEverything(dir: string): boolean {
  const probe = join(dir, 'probe-perm');
  writeFileSync(probe, '');
  chmodSync(probe, 0o000);
  let readable = true;
  try {
    readFileSync(probe);
  } catch {
    readable = false;
  }
  rmSync(probe);
  return readable;
}
const mkfifo = (path: string) => execFileSync('mkfifo', [path]);
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
    expect(await folderFailure(listed(folderResolver(counted, {}, FOLDER_OPS, 4)))).toEqual(['tooManyEntries', BOM]);
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
    await expect(dirMediaResolver(dir).check?.()).resolves.toBeUndefined();
    expect(await folderFailure(dirMediaResolver(join(dir, 'no-existe')).check?.() as Promise<void>)).toEqual(['missingDir', '']);
    expect(await folderFailure(dirMediaResolver(join(dir, 'a.pdf', 'x')).check?.() as Promise<void>)).toEqual(['missingDir', '']);
    expect(await folderFailure(dirMediaResolver(join(dir, 'a.pdf')).check?.() as Promise<void>)).toEqual(['notDirectory', '']);
    // Lo mismo si se usa sin check: list, stat y sha256 dan la misma falla.
    expect(await folderFailure(dirMediaResolver(join(dir, 'no-existe')).stat('a.pdf'))).toEqual(['missingDir', '']);
    expect(await folderFailure(listed(dirMediaResolver(join(dir, 'a.pdf'))))).toEqual(['notDirectory', '']);
    if (readsEverything(dir)) return;
    const closed = delivery({ 'a.pdf': 'a' });
    chmodSync(closed, 0o000);
    expect(await folderFailure(dirMediaResolver(closed).check?.() as Promise<void>)).toEqual(['permission', '']);
  });

  it('an unreadable file is a folder failure when it has to be read', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'b.pdf': 'b' });
    if (readsEverything(dir)) return;
    chmodSync(join(dir, 'a.pdf'), 0o000);
    const resolver = dirMediaResolver(dir);
    // Se lista y se ve su tamaño sin leerlo; leerlo es lo que falla.
    expect(await listed(resolver)).toEqual([['a.pdf', 'file'], ['b.pdf', 'file']]);
    expect(await resolver.stat('a.pdf')).toMatchObject({ type: 'file', size: 1 });
    expect(await folderFailure(resolver.sha256('a.pdf'))).toEqual(['permission', 'a.pdf']);
    expect(await resolver.sha256('b.pdf')).toBe(sha('b'));
  });

  it('a folder that can be listed but not searched is a folder failure at that folder', async () => {
    const dir = delivery({ 'rx/a.pdf': 'a' });
    if (readsEverything(dir)) return;
    chmodSync(join(dir, 'rx'), 0o444);
    expect(await folderFailure(dirMediaResolver(dir).stat('rx/a.pdf'))).toEqual(['permission', 'rx']);
  });

  it('an unreadable folder in the delivery is a folder failure, never an entry', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'cerrada/b.pdf': 'b' });
    if (readsEverything(dir)) return;
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
    expect(await folderFailure(listed(folderResolver(dir, {}, FOLDER_OPS, 6)))).toEqual(['tooManyEntries', 'sub']);
    expect(await folderFailure(folderResolver(dir, {}, FOLDER_OPS, 3).stat('a'))).toEqual(['tooManyEntries', '']);
    // Lo que no se lee no cuenta: buscar un path de la raíz no lee sub.
    expect(await folderResolver(dir, {}, FOLDER_OPS, 4).stat('a')).toMatchObject({ type: 'file' });
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
  /** Las de node:fs sin las rutas ancladas del sistema: todo por la ruta de cada entrada. */
  const byPath: FolderOps = {
    ...FOLDER_OPS,
    lstat: (path) => (path.toString().startsWith('/.vol/') ? Promise.reject(Object.assign(new Error('sin rutas por id'), { code: 'ENOENT' })) : FOLDER_OPS.lstat(path)),
    readlink: (path) => (path.startsWith('/proc/') ? Promise.reject(Object.assign(new Error('sin /proc'), { code: 'ENOENT' })) : FOLDER_OPS.readlink(path)),
  };
  const modes: [string, FolderOps][] = [['the anchored mode of this system', FOLDER_OPS], ['by path', byPath]];
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
        const resolver = folderResolver(dir, {}, ops);
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
      const resolver = folderResolver(dir, {}, ops);
      expect(await resolver.stat('a.pdf')).toMatchObject({ type: 'file', size: 1 });
      expect(await folderFailure(resolver.sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
    });

    it(`a file rewritten in place after its lstat, with another size or the same, is a change of the folder (${mode})`, async () => {
      const dir = delivery({ 'a.pdf': 'uno' });
      const resolver = folderResolver(dir, {}, base);
      expect(await resolver.stat('a.pdf')).toMatchObject({ type: 'file', size: 3 });
      writeFileSync(join(dir, 'a.pdf'), 'otro largo');
      expect(await folderFailure(resolver.sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
      // Con el mismo tamaño, la fecha lo dice.
      const same = delivery({ 'a.pdf': 'uno' });
      const again = folderResolver(same, {}, base);
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
      expect(await folderFailure(folderResolver(dir, {}, growing).sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
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
      expect(await folderFailure(folderResolver(dir, {}, other).sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
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
      expect(await folderFailure(folderResolver(reused, {}, asFile).sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
    }, 10_000);

    it(`a folder swapped for another folder while it is listed is a change (${mode})`, async () => {
      const dir = delivery({ 'sub/a.pdf': 'a', 'otra/b.pdf': 'b' });
      const swap = () => {
        renameSync(join(dir, 'sub'), join(dir, 'subD'));
        renameSync(join(dir, 'otra'), join(dir, 'sub'));
      };
      const resolver = folderResolver(dir, {}, once(base, 'lstat', 'sub', swap));
      expect(await folderFailure(resolver.stat('sub/a.pdf'))).toEqual(['modified', 'sub']);
    });

    it(`an entry that is no longer what its folder listed is a change (${mode})`, async () => {
      const dir = delivery({ 'a.pdf': 'a', 'b.pdf': 'b' });
      const resolver = folderResolver(dir, {}, base);
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
      const list = folderResolver(dir, {}, once(base, 'lstat', 'sub', swap));
      const failure = await folderFailure((async () => { for await (const e of list.list()) listedPaths.push(e.path); })());
      expect(failure).toEqual(['modified', 'sub']);
      expect(listedPaths.filter((p) => p.includes('solo-afuera'))).toEqual([]);
      // Lo mismo buscando un path que pasa por ella.
      rmSync(join(dir, 'sub'));
      renameSync(join(dir, 'subD'), join(dir, 'sub'));
      const stat = folderResolver(dir, {}, once(base, 'lstat', 'sub', swap));
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

