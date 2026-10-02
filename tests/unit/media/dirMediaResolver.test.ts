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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { caseVariant, dirMediaResolver } from '../../../src/media/dirMediaResolver.js';
import { MediaFolderError } from '../../../src/media/errors.js';
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
async function listed(resolver: MediaResolver): Promise<[string, string][]> {
  const out: [string, string][] = [];
  for await (const entry of resolver.list()) out.push([entry.path, entry.type]);
  return out;
}
const sha = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
/** La causa y el lugar de la falla de la carpeta con que termina la promesa. */
async function folderFailure(work: Promise<unknown>): Promise<[string, string]> {
  const error = await work.then(() => null, (e: unknown) => e);
  if (!(error instanceof MediaFolderError)) throw new Error(`no es una falla de la carpeta: ${String(error)}`);
  return [error.reason, error.path];
}
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
    expect(await resolver.stat('sub/b.pdf')).toEqual({ type: 'file', size: 2 });
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
      expect(await resolver.stat(path), path).toEqual({ type: 'file', size: 3 });
      expect(await resolver.sha256(path), path).toBe(sha('mp3'));
    }
    // Solo de A a Z, y por los nombres de la carpeta: una letra con tilde no es otra en mayúscula, ni una
    // forma NFD es la NFC, aunque el sistema de archivos los tome por iguales.
    writeFileSync(join(dir, 'Ñandú.pdf'), 'x');
    writeFileSync(join(dir, 'Cancio\u0301n.pdf'), 'x');
    const other = dirMediaResolver(dir);
    expect([await other.stat('ñandú.pdf'), await other.stat('Canción.pdf'), (await other.stat('Ñandú.pdf'))?.type]).toEqual([null, null, 'file']);
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
    expect(await resolver.stat('grande.bin')).toEqual({ type: 'file', size: 50 << 20 });
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

  it('a file replaced by a link between stat and sha256 is never read: the folder changed', async () => {
    const outside = delivery({ 'secreto.txt': 'no' });
    const dir = delivery({ 'a.pdf': 'a' });
    const resolver = dirMediaResolver(dir);
    expect(await resolver.stat('a.pdf')).toEqual({ type: 'file', size: 1 });
    rmSync(join(dir, 'a.pdf'));
    symlinkSync(join(outside, 'secreto.txt'), join(dir, 'a.pdf'));
    // El resolver ya vio un archivo regular: abre sin seguir el enlace, y la falla es que la carpeta cambió.
    expect(await folderFailure(resolver.sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
  });

  it('a file put in the place of one already looked up is a change of the folder, and a file is read once', async () => {
    const dir = delivery({ 'a.pdf': 'uno', 'b.pdf': 'dos', 'c.pdf': 'tres' });
    const resolver = dirMediaResolver(dir);
    expect(await resolver.stat('a.pdf')).toEqual({ type: 'file', size: 3 });
    renameSync(join(dir, 'b.pdf'), join(dir, 'a.pdf'));
    expect(await folderFailure(resolver.sha256('a.pdf'))).toEqual(['modified', 'a.pdf']);
    // Uno que ya se leyó no se vuelve a leer: el resolver es una foto de la carpeta.
    expect(await resolver.sha256('c.pdf')).toBe(sha('tres'));
    rmSync(join(dir, 'c.pdf'));
    expect(await resolver.sha256('C.PDF')).toBe(sha('tres'));
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

  it('ignore hides matching files from list, not from stat or sha256', async () => {
    const dir = delivery({ 'a.pdf': 'a', 'x.tmp': 't', 'sub/x.tmp': 't', 'tmp/a': 'a', 'sub/tmp/a': 'a' });
    const resolver = dirMediaResolver(dir, { ignore: ['*.tmp', 'tmp/**'] });
    expect(await listed(resolver)).toEqual([['a.pdf', 'file'], ['sub/tmp/a', 'file']]);
    expect(await resolver.stat('x.tmp')).toEqual({ type: 'file', size: 1 });
    expect(await resolver.sha256('sub/x.tmp')).toBe(sha('t'));
    // Sin ignore, todo.
    expect((await listed(dirMediaResolver(dir))).map(([path]) => path)).toEqual(['a.pdf', 'sub/tmp/a', 'sub/x.tmp', 'tmp/a', 'x.tmp']);
  });
});
