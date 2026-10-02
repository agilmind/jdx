/**
 * JDX-MED-003: un archivo de la carpeta de la entrega que no está declarado,
 * sobre carpetas temporales que arma y borra cada test y sobre una carpeta en
 * memoria (para las variantes de mayúsculas que un sistema de archivos que no
 * las distingue no deja crear), y de punta a punta en el bucket media.
 */
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dirMediaResolver } from '../../../../src/media/dirMediaResolver.js';
import { matchDeliveryGlob } from '../../../../src/media/glob.js';
import { foldCase } from '../../../../src/media/path.js';
import { MAX_RESULTS_PER_RULE } from '../../../../src/report/results.js';
import { MED_003 } from '../../../../src/rules/profile/undeclared.js';
import { RULES } from '../../../../src/rules/registry.js';
import type { Finding, JsonValue, MediaResolver, Profile } from '../../../../src/types.js';
import { type DocBuilder, docBuilder } from '../../../helpers/docBuilder.js';
import { measured, omittedOf, resultsOf } from '../../../helpers/flood.js';
import { findingProblems, makeRuleContext, testDeps, validateExample } from '../../../helpers/ruleContext.js';
import { sadaicParams, sadaicProfile } from '../../../helpers/sadaicProfile.js';

const PATHS = [
  '00034-001-CTTO_2-obras.pdf', 'Chacarera-del-Rancho.mp3', '00034-Ejemplar_Chacareras-del-Norte.pdf',
  '00034-DJCT_Chacareras-del-Norte.pdf', '00034-SADAIC_Chacareras-del-Norte.r1.xlsx',
];

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) {
    if (existsSync(dir)) chmodSync(dir, 0o755);
    for (const sub of ['cerrada']) if (existsSync(join(dir, sub))) chmodSync(join(dir, sub), 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
});
/** Una carpeta temporal con esos archivos (el texto de cada uno). */
function folder(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'jdx-media-'));
  made.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
const caseSensitive = (dir: string): boolean => {
  writeFileSync(join(dir, 'probe-case'), '');
  const sensitive = !existsSync(join(dir, 'PROBE-CASE'));
  rmSync(join(dir, 'probe-case'));
  return sensitive;
};
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
/** Los cinco archivos del ejemplo con estos textos, más los que se pidan. */
const withExample = (more: Record<string, string> = {}): Record<string, string> => ({ ...Object.fromEntries(PATHS.map((p, i) => [p, `archivo ${i}`])), ...more });

type Entry = { text: string } | 'symlink' | 'other';
/**
 * Una carpeta en memoria con nombres planos: list omite lo que cumple ignore;
 * stat y sha256 buscan el nombre exacto o el único que coincide de A a Z, como
 * dirMediaResolver en un sistema de archivos que distingue mayúsculas.
 */
function memoryFolder(entries: Record<string, Entry>, ignore: readonly string[] = []): MediaResolver & { hashed: string[] } {
  const names = Object.keys(entries);
  const byFold = new Map<string, string[]>();
  for (const name of names) byFold.set(foldCase(name), [...(byFold.get(foldCase(name)) ?? []), name]);
  const find = (path: string): string | null => {
    if (Object.hasOwn(entries, path)) return path;
    const variants = byFold.get(foldCase(path)) ?? [];
    return variants.length === 1 ? (variants[0] as string) : null;
  };
  const typeOf = (entry: Entry) => (typeof entry === 'object' ? 'file' as const : entry);
  const hashed: string[] = [];
  return {
    hashed,
    async *list() {
      for (const name of [...names].sort()) if (!ignore.some((p) => matchDeliveryGlob(p, name))) yield { path: name, type: typeOf(entries[name] as Entry) };
    },
    async stat(path) {
      const name = find(path);
      if (name === null) return null;
      const entry = entries[name] as Entry;
      return { type: typeOf(entry), size: typeof entry === 'object' ? Buffer.byteLength(entry.text) : 0 };
    },
    async sha256(path) {
      const name = find(path);
      const entry = name === null ? undefined : entries[name];
      if (typeof entry !== 'object') throw new Error(`${path}: no es un archivo regular de la entrega`);
      hashed.push(name as string);
      return sha(entry.text);
    },
  };
}

/** Los MED-003 de una carpeta contra una variante, controlados contra el catálogo. */
async function undeclared(media: MediaResolver, document: DocBuilder = docBuilder()): Promise<string[]> {
  const ctx = await makeRuleContext({ document, options: { media } });
  const found: Finding[] = await MED_003.evaluate(ctx, sadaicParams('JDX-MED-003'));
  expect(findingProblems(found)).toEqual([]);
  expect(found.every((f) => f.instanceLocation === '' && f.context === undefined)).toBe(true);
  return found.map((f) => f.params?.path as string);
}
const reportErrors = (report: unknown) => testDeps().validators.validateAux('report', report as JsonValue);

describe('MED-003', () => {
  it('the example with exactly its files has none', async () => {
    expect(await undeclared(dirMediaResolver(folder(withExample())))).toEqual([]);
  });

  it('undeclared file → MED-003 with params.path', async () => {
    expect(await undeclared(dirMediaResolver(folder(withExample({ 'notas.txt': 'n', 'sub/dni.pdf': 'd' }))))).toEqual(['notas.txt', 'sub/dni.pdf']);
  });

  it('each JDX artifact excluded (*.jdx.json, *.jdx.json.jws, *.report.json, jdx-trust.json)', async () => {
    const artifacts = {
      '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json': '{}', '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json.jws': 'jws',
      '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.report.json': '{}', 'jdx-trust.json': '{}', 'otra.r9.jdx.json': '{}',
    };
    expect(await undeclared(dirMediaResolver(folder(withExample(artifacts))))).toEqual([]);
  });

  it('sub/x.report.json and sub/jdx-trust.json excluded', async () => {
    expect(await undeclared(dirMediaResolver(folder(withExample({ 'sub/x.report.json': '{}', 'sub/jdx-trust.json': '{}', 'sub/x.jdx.json.jws': 'j' }))))).toEqual([]);
  });

  it('X.JDX.JSON not excluded', async () => {
    // Las exclusiones distinguen mayúsculas, y una que se le parece no es un artefacto.
    const dir = folder(withExample({ 'X.JDX.JSON': '{}', 'x.Report.json': '{}', 'Jdx-Trust.json': '{}', 'jdx-trust.json.bak': '{}' }));
    expect(await undeclared(dirMediaResolver(dir))).toEqual(['Jdx-Trust.json', 'X.JDX.JSON', 'jdx-trust.json.bak', 'x.Report.json']);
  });

  it('a file outside the JDX artifacts is MED-003 unless an ignore pattern covers it', async () => {
    const dir = folder(withExample({ 'x.tmp': 't', 'sub/y.tmp': 't' }));
    expect(await undeclared(dirMediaResolver(dir))).toEqual(['sub/y.tmp', 'x.tmp']);
    expect(await undeclared(dirMediaResolver(dir, { ignore: ['*.tmp'] }))).toEqual([]);
  });

  it('an ignore pattern with / excludes only from the delivery root', async () => {
    const dir = folder(withExample({ 'tmp/a': 'a', 'tmp/b/c': 'c', 'sub/tmp/a': 'a' }));
    expect(await undeclared(dirMediaResolver(dir, { ignore: ['tmp/**'] }))).toEqual(['sub/tmp/a']);
  });

  it('case-insensitive match counts as declared', async () => {
    // El path declarado con otras mayúsculas encuentra el archivo, en cualquier sistema de archivos.
    const dir = folder({ ...withExample(), [PATHS[1] as string]: 'archivo 1' });
    rmSync(join(dir, PATHS[1] as string));
    writeFileSync(join(dir, 'CHACARERA-DEL-RANCHO.MP3'), 'archivo 1');
    expect(await undeclared(dirMediaResolver(dir))).toEqual([]);
  });

  it('two case variants with one declared → the other is MED-003', async () => {
    const dir = folder(withExample());
    if (caseSensitive(dir)) {
      writeFileSync(join(dir, PATHS[1]?.toUpperCase() as string), 'otro');
      expect(await undeclared(dirMediaResolver(dir))).toEqual([PATHS[1]?.toUpperCase()]);
    }
    // En memoria, en cualquier sistema: el exacto es el declarado, aunque el otro tenga los mismos bytes.
    const both = memoryFolder({ 'a.pdf': { text: 'x' }, 'A.pdf': { text: 'x' } });
    expect(await undeclared(both, docBuilder().set('/media/1/path', 'a.pdf'))).toEqual(['A.pdf']);
  });

  it('a case variant that the receiver ignores does not hide another with other bytes', async () => {
    // El declarado a.tmp es exacto pero el receptor lo ignora; A.TMP no cumple *.tmp: cuenta solo si es el mismo archivo.
    const document = docBuilder().set('/media/1/path', 'a.tmp');
    const other = memoryFolder({ 'a.tmp': { text: 'lo declarado' }, 'A.TMP': { text: 'otra cosa' }, ...exampleEntries(1) }, ['*.tmp']);
    expect(await undeclared(other, document)).toEqual(['A.TMP']);
    const same = memoryFolder({ 'a.tmp': { text: 'lo declarado' }, 'A.TMP': { text: 'lo declarado' }, ...exampleEntries(1) }, ['*.tmp']);
    expect(await undeclared(same, document)).toEqual([]);
    // Sin el exacto, la única variante es lo que resuelve el path: declarada, sin comparar nada más que ella.
    const alone = memoryFolder({ 'A.TMP': { text: 'x' }, ...exampleEntries(1) });
    expect(await undeclared(alone, document)).toEqual([]);
    // Dos variantes y ninguna exacta: el path no resuelve, y las dos son MED-003.
    const two = memoryFolder({ 'A.tmp': { text: 'x' }, 'a.TMP': { text: 'x' }, ...exampleEntries(1) });
    expect(await undeclared(two, document)).toEqual(['A.tmp', 'a.TMP']);
  });

  it('undeclared symlink reported', async () => {
    const outside = folder({ 'x.pdf': 'x' });
    const dir = folder(withExample());
    symlinkSync(join(outside, 'x.pdf'), join(dir, 'enlace.pdf'));
    symlinkSync(outside, join(dir, 'carpeta-enlazada'));
    expect(await undeclared(dirMediaResolver(dir))).toEqual(['carpeta-enlazada', 'enlace.pdf']);
    // Uno declarado con otras mayúsculas no declara un enlace: solo un archivo regular igual al que resuelve.
    expect(await undeclared(memoryFolder({ 'Enlace.pdf': 'symlink', ...exampleEntries(1) }), docBuilder().set('/media/1/path', 'enlace.pdf'))).toEqual(['Enlace.pdf']);
  });

  it('the link where a declared path stops counts as declared', async () => {
    const outside = folder({ 'b.pdf': 'b' });
    const dir = folder(withExample());
    symlinkSync(outside, join(dir, 'enlazada'));
    const document = docBuilder().set('/media/1/path', 'enlazada/b.pdf');
    // Da su MED-008; MED-003 no repite el enlace donde se detiene.
    const found = await undeclared(dirMediaResolver(dir), document);
    expect(found.filter((path) => !PATHS.includes(path))).toEqual([]);
  });

  it('an unreadable folder is a folder failure, not something declared or undeclared', async () => {
    const dir = folder(withExample({ 'cerrada/c.pdf': 'c' }));
    chmodSync(join(dir, 'cerrada'), 0o000);
    let readable = true;
    try {
      readdirSync(join(dir, 'cerrada'));
    } catch {
      readable = false;
    }
    if (readable) return;
    // Aunque un path declarado pase por ella: lo de adentro podría esconder archivos no declarados.
    const ctx = await makeRuleContext({ document: docBuilder().set('/media/2/path', 'cerrada/c.pdf'), options: { media: dirMediaResolver(dir) } });
    await expect(MED_003.evaluate(ctx, sadaicParams('JDX-MED-003'))).rejects.toMatchObject({ name: 'MediaFolderError', reason: 'permission', path: 'cerrada' });
  });

  it('previous deliveries count as declared', async () => {
    const dir = folder(withExample());
    const document = docBuilder().set('/declaration/revision', 3).set('/media/1/delivery', 1).set('/media/2/delivery', 2);
    expect(await undeclared(dirMediaResolver(dir), document)).toEqual([]);
  });

  it('a path that is not valid as text declares nothing', async () => {
    // Ya tiene su MED-001: el archivo de la carpeta con ese nombre no cuenta como declarado.
    const dir = folder(withExample({ 'Canción.pdf': 'c' }));
    expect(await undeclared(dirMediaResolver(dir), docBuilder().set('/media/1/path', 'Canción.pdf'))).toEqual(['Canción.pdf', PATHS[1]]);
  });

  it('end to end: MED-003 lands in the media bucket', async () => {
    const dir = folder(withExample({ 'notas.txt': 'n' }));
    const document = matching();
    const report = await validateExample({ document, options: { media: dirMediaResolver(dir) } });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-MED-003').map((r) => [r.level, r.source, r.instanceLocation, r.params, r.message])).toEqual([
      ['warning', 'profile:sadaic/0.1@0.1.0', '', { path: 'notas.txt' }, 'El archivo notas.txt está en la entrega y no está declarado.'],
    ]);
    // Un aviso del perfil deja el bucket en warning; un error del núcleo en el mismo bucket, en failed.
    expect(report).toMatchObject({ exitCode: 0, checks: { media: 'warning' } });
    writeFileSync(join(dir, PATHS[0] as string), 'otro');
    const failed = await validateExample({ document, options: { media: dirMediaResolver(dir) } });
    expect(resultsOf(failed, 'JDX-MED-002', 'JDX-MED-003').map((r) => r.ruleId)).toEqual(['JDX-MED-002', 'JDX-MED-003']);
    expect(failed).toMatchObject({ exitCode: 1, checks: { media: 'failed' } });
    // Un perfil sin MED-003 no lo da; con failOn warning, el aviso rechaza.
    const without: Profile = { ...sadaicProfile(), rules: sadaicProfile().rules.filter((r) => r.ruleId !== 'JDX-MED-003') };
    writeFileSync(join(dir, PATHS[0] as string), 'archivo 0');
    expect(resultsOf(await validateExample({ document, options: { media: dirMediaResolver(dir), profile: without } }), 'JDX-MED-003')).toEqual([]);
    expect(await validateExample({ document, options: { media: dirMediaResolver(dir), failOn: 'warning' } })).toMatchObject({ exitCode: 1, disposition: 'reject' });
  });
});

describe('hostile input through validateWithDeps', () => {
  it('registers MED-003, and only with a folder', () => {
    expect(RULES.get('JDX-MED-003')).toBe(MED_003);
    expect(MED_003.requires).toEqual(['media']);
  });

  it('a folder of three thousand undeclared files lists 100 and counts the rest, quickly', async () => {
    const files = withExample();
    for (let i = 0; i < 3000; i++) files[`extra/f${String(i).padStart(4, '0')}.bin`] = '';
    const { report, chars, ms } = await measured({ document: matching(), options: { media: dirMediaResolver(folder(files)) } });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, 'JDX-MED-003').map((r) => r.params?.path)).toEqual(Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => `extra/f${String(i).padStart(4, '0')}.bin`));
    expect(omittedOf(report, 'JDX-MED-003')).toEqual([{ ruleId: 'JDX-MED-003', count: 3000 - MAX_RESULTS_PER_RULE }]);
    expect(report.checks.media).toBe('warning');
    expect(chars).toBeLessThan(100_000);
    expect(ms).toBeLessThan(5_000);
  });

  it('two thousand files declared with other case are each compared once', async () => {
    const n = 2000;
    const entries: Record<string, Entry> = {};
    for (let i = 0; i < n; i++) entries[`a${i}.pdf`] = { text: String(i) };
    const media = memoryFolder({ ...entries, ...exampleEntries() });
    const doc = JSON.parse(docBuilder().text) as { media: JsonValue[] };
    for (let i = 0; i < n; i++) doc.media.push({ id: `x${i}`, kind: 'audio', path: `A${i}.PDF`, delivery: 1 });
    const { report, ms } = await measured({ document: JSON.stringify(doc), options: { media } });
    expect(resultsOf(report, 'JDX-MED-003')).toEqual([]);
    // Cada variante se lee una vez (el path declarado resuelve a ella misma) y cada archivo del ejemplo, para MED-002.
    expect(media.hashed.length).toBeLessThanOrEqual(2 * n + PATHS.length);
    expect(ms).toBeLessThan(5_000);
  });
});

/** El ejemplo con el tamaño y el sha256 de los archivos de withExample, y el anexo y el depósito al día. */
function matching(): DocBuilder {
  let document = docBuilder();
  PATHS.forEach((_, i) => {
    document = document.set(`/media/${i}/size`, Buffer.byteLength(`archivo ${i}`)).set(`/media/${i}/sha256`, sha(`archivo ${i}`));
  });
  return document.set('/media/0/evidence/annexed/0/sha256', sha('archivo 1')).set('/edition/deposit/sha256', sha('archivo 2'));
}
/** Los archivos del ejemplo en la carpeta en memoria, salvo los de los índices que una variante cambia. */
function exampleEntries(...skip: number[]): Record<string, Entry> {
  return Object.fromEntries(PATHS.flatMap((p, i) => (skip.includes(i) ? [] : [[p, { text: `archivo ${i}` }]])));
}
