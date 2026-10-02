/**
 * Los archivos de la entrega contra su carpeta (JDX-MED-002, -007 y -008, en
 * el bucket media) y contra el estado del receptor (JDX-MED-006, en core),
 * sobre el ejemplo con sus archivos en una carpeta temporal que arma y borra
 * cada test, y de punta a punta, también con documentos que las inundan.
 */
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dirMediaResolver, FOLDER_OPS, type FolderOps, folderResolver } from '../../../../src/media/dirMediaResolver.js';
import { MediaFolderError } from '../../../../src/media/errors.js';
import { MAX_RESULTS_PER_RULE } from '../../../../src/report/results.js';
import { MED_002, MED_006, MED_007, MED_008 } from '../../../../src/rules/core/mediaDir.js';
import { RULES } from '../../../../src/rules/registry.js';
import { emptyState } from '../../../../src/state/fileStateStore.js';
import type { Finding, JsonValue, MediaRecord, MediaResolver, State, StateStore } from '../../../../src/types.js';
import { type DocBuilder, docBuilder } from '../../../helpers/docBuilder.js';
import { type Doc, flood, measured, omittedOf, resultsOf } from '../../../helpers/flood.js';
import { findingProblems, findingsOf, makeRuleContext, type RuleContextOverrides, testDeps, validateExample } from '../../../helpers/ruleContext.js';

const ID = '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13';
const CODES = ['JDX-MED-002', 'JDX-MED-006', 'JDX-MED-007', 'JDX-MED-008'] as const;
const PATHS = [
  '00034-001-CTTO_2-obras.pdf', 'Chacarera-del-Rancho.mp3', '00034-Ejemplar_Chacareras-del-Norte.pdf',
  '00034-DJCT_Chacareras-del-Norte.pdf', '00034-SADAIC_Chacareras-del-Norte.r1.xlsx',
];

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'jdx-media-'));
  made.push(dir);
  return dir;
}
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
/** Si quien corre los tests puede leer lo que no tiene permiso (root). */
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** El texto del archivo de cada media del ejemplo. */
const content = (i: number) => `contenido del archivo ${i + 1}`;

/** Una carpeta con los cinco archivos del ejemplo, y el ejemplo con sus tamaños y sha256. */
function delivered(): { dir: string; document: DocBuilder } {
  const dir = folder();
  let document = docBuilder();
  PATHS.forEach((path, i) => {
    writeFileSync(join(dir, path), content(i));
    document = document.set(`/media/${i}/size`, Buffer.byteLength(content(i))).set(`/media/${i}/sha256`, sha(content(i)));
  });
  // El anexo y el depósito declaran el sha256 de su archivo (JDX-MED-009).
  document = document.set('/media/0/evidence/annexed/0/sha256', sha(content(1))).set('/edition/deposit/sha256', sha(content(2)));
  return { dir, document };
}

/** Las operaciones del sistema de archivos contadas: cuántas veces se leyó cada carpeta, y cuántos lstat y open hubo. */
function countedOps(): { ops: FolderOps; reads: string[]; lstats: () => number; opens: () => number } {
  const reads: string[] = [];
  let lstats = 0;
  let opens = 0;
  const ops: FolderOps = {
    ...FOLDER_OPS,
    readdir: (path) => (reads.push(path.toString()), FOLDER_OPS.readdir(path)),
    opendir: (path) => (reads.push(path.toString()), FOLDER_OPS.opendir(path)),
    lstat: (path) => (lstats++, FOLDER_OPS.lstat(path)),
    open: (path, flags) => (opens++, FOLDER_OPS.open(path, flags)),
  };
  return { ops, reads, lstats: () => lstats, opens: () => opens };
}

/** Un resolver que cuenta qué paths se buscaron. */
function counting(resolver: MediaResolver): MediaResolver & { stats: string[]; hashes: string[] } {
  const stats: string[] = [];
  const hashes: string[] = [];
  return {
    ...resolver,
    stats,
    hashes,
    stat: (path) => (stats.push(path), resolver.stat(path)),
    sha256: (path) => (hashes.push(path), resolver.sha256(path)),
  };
}

/** Los hallazgos de las cuatro reglas, controlados contra el catálogo. */
async function mediaDir(overrides: RuleContextOverrides): Promise<Finding[]> {
  const ctx = await makeRuleContext(overrides);
  const found: Finding[] = [];
  for (const rule of [MED_002, MED_006, MED_007, MED_008]) {
    if (rule.requires?.some((need) => ctx[need] === null) === true) continue;
    found.push(...findingsOf(await rule.evaluate(ctx, {})));
  }
  expect(findingProblems(found)).toEqual([]);
  return found;
}
const brief = (found: readonly Finding[]) => found.map((f) => [f.ruleId, f.instanceLocation, f.params, f.context]);
const reportErrors = (report: unknown) => testDeps().validators.validateAux('report', report as JsonValue);

/** Un estado con los archivos de la declaración que registran las revisiones ingeridas. */
const withMedia = (media: MediaRecord[]): State => ({ ...emptyState('sandbox'), declarations: { [ID]: { owner: 'jupiter', lastIngestedRevision: 1, receipts: [], media } } });
const memoryState = (state: State): StateStore => ({
  read: async (fn) => fn(state),
  update: async () => {
    throw new Error('la validación no escribe este estado');
  },
});
/** La revisión 2 del ejemplo, con el archivo `i` de la revisión 1. */
function secondRevision(document: DocBuilder, ...previous: number[]): { document: DocBuilder; fileName: string } {
  let second = document.set('/declaration/revision', 2);
  for (let i = 0; i < PATHS.length; i++) second = second.set(`/media/${i}/delivery`, previous.includes(i) ? 1 : 2);
  return { document: second, fileName: `${ID}.r2.jdx.json` };
}

describe('MED-002, MED-007 and MED-008', () => {
  it('the example with its files in the folder has none', async () => {
    const { dir, document } = delivered();
    expect(await mediaDir({ document, options: { media: dirMediaResolver(dir) } })).toEqual([]);
  });

  it('size mismatch → MED-002', async () => {
    const { dir, document } = delivered();
    writeFileSync(join(dir, PATHS[1] as string), 'otro tamaño, más largo');
    const resolver = counting(dirMediaResolver(dir));
    expect(brief(await mediaDir({ document, options: { media: resolver } }))).toEqual([
      ['JDX-MED-002', '/media/1/size', { path: PATHS[1], field: 'size' }, { media: 'm2' }],
    ]);
    // Con otro tamaño, el sha256 no se calcula: ya se sabe que no coincide.
    expect(resolver.hashes).not.toContain(PATHS[1]);
  });

  it('sha mismatch → MED-002', async () => {
    const { dir, document } = delivered();
    writeFileSync(join(dir, PATHS[3] as string), content(3).replace('contenido', 'CONTENIDO'));
    expect(brief(await mediaDir({ document, options: { media: dirMediaResolver(dir) } }))).toEqual([
      ['JDX-MED-002', '/media/3/sha256', { path: PATHS[3], field: 'sha256' }, { media: 'm4' }],
    ]);
  });

  it('media without size or sha skips MED-002', async () => {
    const { dir, document } = delivered();
    writeFileSync(join(dir, PATHS[1] as string), 'otro contenido');
    writeFileSync(join(dir, PATHS[2] as string), 'otro contenido, más largo');
    // Sin size compara el sha256; sin sha256, el tamaño; sin ninguno de los dos, nada.
    const found = await mediaDir({
      document: document.remove('/media/1/size').remove('/media/2/sha256').remove('/media/4/size').remove('/media/4/sha256'),
      options: { media: dirMediaResolver(dir) },
    });
    expect(brief(found).map(([id, at]) => [id, at])).toEqual([['JDX-MED-002', '/media/1/sha256'], ['JDX-MED-002', '/media/2/size']]);
    // Los dos de antes, como se declararon; el último, con cualquier contenido.
    writeFileSync(join(dir, PATHS[1] as string), content(1));
    writeFileSync(join(dir, PATHS[2] as string), content(2));
    writeFileSync(join(dir, PATHS[4] as string), 'cualquier cosa');
    expect(await mediaDir({ document: document.remove('/media/4/size').remove('/media/4/sha256'), options: { media: dirMediaResolver(dir) } })).toEqual([]);
  });

  it('current media missing → MED-007', async () => {
    const { dir, document } = delivered();
    rmSync(join(dir, PATHS[0] as string));
    expect(brief(await mediaDir({ document, options: { media: dirMediaResolver(dir) } }))).toEqual([
      ['JDX-MED-007', '/media/0/path', { path: PATHS[0] }, { media: 'm1' }],
    ]);
  });

  it('symlink → MED-008', async () => {
    const { dir, document } = delivered();
    const outside = folder();
    writeFileSync(join(outside, 'x.pdf'), content(0));
    rmSync(join(dir, PATHS[0] as string));
    symlinkSync(join(outside, 'x.pdf'), join(dir, PATHS[0] as string));
    const resolver = counting(dirMediaResolver(dir));
    expect(brief(await mediaDir({ document, options: { media: resolver } }))).toEqual([['JDX-MED-008', '/media/0/path', { path: PATHS[0] }, { media: 'm1' }]]);
    // Un enlace no se lee, aunque apunte a un archivo con el mismo contenido.
    expect(resolver.hashes).not.toContain(PATHS[0]);
  });

  it('directory → MED-008', async () => {
    const { dir, document } = delivered();
    rmSync(join(dir, PATHS[2] as string));
    mkdirSync(join(dir, PATHS[2] as string));
    expect(brief(await mediaDir({ document, options: { media: dirMediaResolver(dir) } }))).toEqual([['JDX-MED-008', '/media/2/path', { path: PATHS[2] }, { media: 'm3' }]]);
  });

  it('a path with other case finds its file, and an invalid path is not looked up', async () => {
    const { dir, document } = delivered();
    const resolver = counting(dirMediaResolver(dir));
    const found = await mediaDir({
      document: document.set('/media/1/path', 'chacarera-DEL-rancho.MP3').set('/media/3/path', '00034 DJCT.pdf').set('/media/4', { id: 'm5', kind: 'societyForm', delivered: false }),
      options: { media: resolver },
    });
    // El path con espacios ya tiene su MED-001 y no se busca; el que no viaja, tampoco.
    expect(found).toEqual([]);
    expect(resolver.stats).toEqual([PATHS[0], 'chacarera-DEL-rancho.MP3', PATHS[2]]);
  });

  it('each file is looked up once for the four rules', async () => {
    const { dir, document } = delivered();
    const resolver = counting(dirMediaResolver(dir));
    const state = withMedia([]);
    await mediaDir({ document, options: { media: resolver }, state });
    expect(resolver.stats).toEqual(PATHS);
    expect(resolver.hashes).toEqual(PATHS);
  });

  it('end to end: with --dir the media bucket is evaluated', async () => {
    const { dir, document } = delivered();
    const passed = await validateExample({ document, options: { media: dirMediaResolver(dir) } });
    expect(reportErrors(passed)).toEqual([]);
    expect(resultsOf(passed, ...CODES)).toEqual([]);
    expect(passed).toMatchObject({ exitCode: 0, options: { dir: true }, checks: { media: 'passed', core: 'passed' } });
    writeFileSync(join(dir, PATHS[3] as string), 'x');
    rmSync(join(dir, PATHS[4] as string));
    const failed = await validateExample({ document, options: { media: dirMediaResolver(dir) } });
    expect(reportErrors(failed)).toEqual([]);
    expect(resultsOf(failed, ...CODES).map((r) => [r.ruleId, r.level, r.source, r.instanceLocation, r.message])).toEqual([
      ['JDX-MED-002', 'error', 'core', '/media/3/size', `El tamaño (size) del archivo ${PATHS[3]} no coincide con lo declarado.`],
      ['JDX-MED-007', 'error', 'core', '/media/4/path', `Falta en la entrega el archivo ${PATHS[4]}.`],
    ]);
    expect(failed).toMatchObject({ exitCode: 1, disposition: 'reject', checks: { media: 'failed', core: 'passed' } });
    // Sin carpeta, el bucket no corre.
    expect((await validateExample({ document })).checks.media).toBe('notEvaluated');
  });

  it('a lookup or a sha256 that fails is reported after the others of its batch end', async () => {
    const { dir, document } = delivered();
    const base = dirMediaResolver(dir);
    let running = 0;
    const slow = (op: 'stat' | 'sha256', failing: string): MediaResolver => ({
      ...base,
      [op]: async (path: string) => {
        running++;
        try {
          if (path === failing) throw new MediaFolderError('io', path);
          await sleep(30);
          return await (base[op] as (p: string) => Promise<unknown>)(path);
        } finally {
          running--;
        }
      },
    });
    for (const [op, failing] of [['stat', PATHS[0]], ['sha256', PATHS[0]]] as const) {
      const ctx = await makeRuleContext({ document, options: { media: slow(op, failing as string) } });
      let atFailure = -1;
      await expect(Promise.resolve(MED_002.evaluate(ctx, {})).catch((error: unknown) => {
        atFailure = running;
        throw error;
      }), op).rejects.toMatchObject({ name: 'MediaFolderError', reason: 'io' });
      expect(atFailure, op).toBe(0);
    }
  });

  it('end to end: a folder that fails while the rules read it is an environment failure, and the rest is not evaluated', async () => {
    const { dir, document } = delivered();
    // Un resolver que falla a la mitad: el paso de entorno ya pasó y una regla lo encuentra.
    const failing: MediaResolver = {
      list: () => dirMediaResolver(dir).list(),
      stat: (path) => dirMediaResolver(dir).stat(path),
      sha256: async (path) => {
        throw new MediaFolderError('modified', path);
      },
    };
    const report = await validateExample({ document, options: { media: failing } });
    expect(reportErrors(report)).toEqual([]);
    expect(report.results.map((r) => [r.ruleId, r.level, r.source, r.instanceLocation, r.params, r.message])).toEqual([
      ['JDX-ENV-011', 'error', 'environment', '', { cause: 'modified', path: PATHS[0] },
        `La carpeta de la entrega no se puede usar: cambió mientras se leía (${PATHS[0]}).`],
    ]);
    expect(report).toMatchObject({
      exitCode: 2, valid: null, disposition: null, omitted: [],
      checks: { environment: 'failed', json: 'notEvaluated', schema: 'notEvaluated', core: 'notEvaluated', media: 'notEvaluated', profile: 'notEvaluated', policy: 'notEvaluated' },
    });
    // Otra excepción del resolver no es del entorno: la deja pasar (en validate, la falla interna).
    const broken: MediaResolver = { ...failing, sha256: async () => { throw new Error('roto'); } };
    await expect(validateExample({ document, options: { media: broken } })).rejects.toThrow('roto');
  });

  // Quien lo lee todo (root) no tiene nada ilegible: se salta.
  it.skipIf(READS_EVERYTHING)('end to end: a declared file that cannot be read is an environment failure, with the cause of the permission', async () => {
    const { dir, document } = delivered();
    chmodSync(join(dir, PATHS[1] as string), 0o000);
    const unreadable = await validateExample({ document, options: { media: dirMediaResolver(dir) } });
    chmodSync(join(dir, PATHS[1] as string), 0o644);
    expect(unreadable.results.map((r) => [r.ruleId, r.params])).toEqual([['JDX-ENV-011', { cause: 'permission', path: PATHS[1] }]]);
    expect(unreadable.exitCode).toBe(2);
  });

  it('end to end: what the folder leaves open is closed before the report comes back, also when it fails', async () => {
    const { dir, document } = delivered();
    for (const fail of [false, true]) {
      let open = 0;
      let reads = 0;
      const ops: FolderOps = {
        ...FOLDER_OPS,
        open: async (path, flags) => {
          const handle = await FOLDER_OPS.open(path, flags);
          open++;
          const close = handle.close.bind(handle);
          return Object.assign(handle, { close: async () => (open--, close()) });
        },
        readdir: (path) => (fail && ++reads === 2 ? Promise.reject(Object.assign(new Error('falla'), { code: 'EIO' })) : FOLDER_OPS.readdir(path)),
      };
      if (fail) mkdirSync(join(dir, 'sub'), { recursive: true });
      const report = await validateExample({ document, options: { media: folderResolver(dir, {}, ops) } });
      expect(report.exitCode, String(fail)).toBe(fail ? 2 : 0);
      expect(open, String(fail)).toBe(0);
    }
  });
});

describe('MED-006', () => {
  const record = (i: number, text = content(i)): MediaRecord => ({ path: PATHS[i] as string, delivery: 1, size: Buffer.byteLength(text), sha256: sha(text) });

  it('previous media in neither dir nor state → MED-006', async () => {
    const { dir, document } = delivered();
    rmSync(join(dir, PATHS[1] as string));
    const second = secondRevision(document, 1);
    expect(brief(await mediaDir({ ...second, options: { media: dirMediaResolver(dir) }, state: withMedia([]) }))).toEqual([
      ['JDX-MED-006', '/media/1/path', { path: PATHS[1], reason: 'notFound' }, { media: 'm2' }],
    ]);
    // Sin carpeta, no estar en el estado es no estar.
    expect(brief(await mediaDir({ ...second, state: withMedia([]) }))).toEqual([['JDX-MED-006', '/media/1/path', { path: PATHS[1], reason: 'notFound' }, { media: 'm2' }]]);
  });

  it('previous media in state with other sha → MED-006', async () => {
    const { document } = delivered();
    const second = secondRevision(document, 1, 2);
    const state = withMedia([record(1, 'lo que se recibió'), { ...record(2), sha256: sha('otro') }]);
    expect(brief(await mediaDir({ ...second, state }))).toEqual([
      ['JDX-MED-006', '/media/1/path', { path: PATHS[1], reason: 'changed' }, { media: 'm2' }],
      ['JDX-MED-006', '/media/2/path', { path: PATHS[2], reason: 'changed' }, { media: 'm3' }],
    ]);
  });

  it('previous media in state only → ok', async () => {
    const { dir, document } = delivered();
    rmSync(join(dir, PATHS[1] as string));
    const second = secondRevision(document, 1);
    // El estado lo guarda por path sin distinguir mayúsculas, y la carpeta no tiene que traerlo.
    const state = withMedia([{ ...record(1), path: PATHS[1]?.toUpperCase() as string }]);
    expect(await mediaDir({ ...second, options: { media: dirMediaResolver(dir) }, state })).toEqual([]);
    expect(await mediaDir({ ...second, state })).toEqual([]);
  });

  it('previous media in dir with other sha → MED-002', async () => {
    const { dir, document } = delivered();
    writeFileSync(join(dir, PATHS[1] as string), content(1).replace('contenido', 'CONTENIDO'));
    const second = secondRevision(document, 1);
    // No está en el estado, pero está en la carpeta: se compara con la carpeta.
    expect(brief(await mediaDir({ ...second, options: { media: dirMediaResolver(dir) }, state: withMedia([]) }))).toEqual([
      ['JDX-MED-002', '/media/1/sha256', { path: PATHS[1], field: 'sha256' }, { media: 'm2' }],
    ]);
  });

  it('no state → MED-006 not evaluated', async () => {
    expect([MED_006.requires, MED_002.requires, MED_007.requires, MED_008.requires]).toEqual([['state'], ['media'], ['media'], ['media']]);
    const { document } = delivered();
    const second = secondRevision(document, 1);
    const report = await validateExample({ ...second });
    expect(resultsOf(report, ...CODES)).toEqual([]);
    // Con estado, en el bucket core.
    const withState = await validateExample({ ...second, options: { state: memoryState(withMedia([])) } });
    expect(resultsOf(withState, ...CODES).map((r) => [r.ruleId, r.source, r.instanceLocation])).toEqual([['JDX-MED-006', 'core', '/media/1/path']]);
    expect(withState).toMatchObject({ exitCode: 1, checks: { core: 'failed', media: 'notEvaluated' } });
  });

  it('an invalid or not delivered previous media is not looked for in the state', async () => {
    const { document } = delivered();
    const second = secondRevision(document, 1, 4);
    const found = await mediaDir({ ...second, document: second.document.set('/media/1/path', '../fuera.mp3').set('/media/4', { id: 'm5', kind: 'societyForm', delivered: false, delivery: 1 }), state: withMedia([]) });
    expect(found).toEqual([]);
  });
});

describe('hostile input through validateWithDeps', () => {
  /** Un archivo con un path propio, de un mismo largo: `a00000.pdf`, … */
  const mediaItem = (more: string, path = (i: number) => `a${i.toString(36).padStart(5, '0')}.pdf`) => (i: number) =>
    `{"id":"m${i.toString(36).padStart(5, '0')}","kind":"audio","path":"${path(i)}",${more}}`;
  const mediaFlood = (more: string, base?: string, path?: (i: number) => string) => flood((d, marker) => {
    delete (d.edition as Doc).deposit;
    delete (d.edition as Doc).media;
    delete (d.recordings as Doc[])[0]!.media;
    delete (d.agreements as Doc[])[0]!.media;
    d.media = marker;
  }, mediaItem(more, path), base);

  it('a chain of folders as deep as the system allows, with 2 MiB of files declared at its bottom, reads each folder once', async () => {
    // Cada path pasa por toda la cadena: buscarlo no puede costar el largo de la cadena por cada segmento.
    const dir = folder();
    const pathMax = process.platform === 'darwin' ? 1024 : 4096;
    const depth = Math.floor((pathMax - dir.length - 20) / 2);
    const chain = 'a/'.repeat(depth);
    mkdirSync(join(dir, chain), { recursive: true });
    const name = (i: number) => `f${String(i).padStart(5, '0')}.pdf`;
    const { text, count } = mediaFlood('"delivery":1,"size":1', undefined, (i) => `${chain}${name(i)}`);
    for (let i = 0; i < count; i++) writeFileSync(join(dir, chain, name(i)), 'x');
    // Buscar cada path no puede costar el largo de la cadena: cada carpeta se lee una vez y cada entrada se mira a lo
    // sumo dos veces (al identificarla y, una carpeta, después de leerla); en Linux, cada carpeta se abre una vez.
    const counted = countedOps();
    const { report } = await measured({ document: text, options: { media: folderResolver(dir, {}, counted.ops) } });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, ...CODES)).toEqual([]);
    expect(report.checks.media).toBe('passed');
    expect(count).toBeGreaterThan(400);
    // La raíz se abre una vez más, para controlarla en el paso de entorno.
    expect(counted.reads.length - new Set(counted.reads).size).toBeLessThanOrEqual(1);
    expect(counted.reads.length).toBeLessThanOrEqual(depth + 3);
    expect(counted.lstats()).toBeLessThanOrEqual(2 * (depth + count) + 20);
    expect(counted.opens()).toBeLessThanOrEqual(depth + count + 20);
  });

  it('a declaration whose files each sit in folders of their own, with a quiet folder that has just them, is never refused by the limit', async () => {
    // Como un documento de 2 MiB con cada archivo en <id>/a/f, en chico: 3 × 60 entradas pedidas y un tope de 20.
    const dir = folder();
    const doc = JSON.parse(docBuilder().text) as Doc;
    delete (doc.edition as Doc).deposit;
    delete (doc.edition as Doc).media;
    delete (doc.recordings as Doc[])[0]!.media;
    delete (doc.agreements as Doc[])[0]!.media;
    doc.media = Array.from({ length: 60 }, (_, i) => {
      mkdirSync(join(dir, `m${i}`, 'a'), { recursive: true });
      writeFileSync(join(dir, `m${i}`, 'a', 'f'), '');
      return { id: `m${i}`, kind: 'audio', path: `m${i}/a/f`, delivery: 1, size: 0 };
    });
    const quiet = await validateExample({ document: JSON.stringify(doc), options: { media: folderResolver(dir, {}, FOLDER_OPS, 20) } });
    expect([quiet.exitCode, quiet.checks.media, resultsOf(quiet, 'JDX-ENV-011')]).toEqual([0, 'passed', []]);
    // Veintiún archivos que no se declaran sí pasan el tope.
    for (let i = 0; i < 21; i++) writeFileSync(join(dir, `m${i}`, `extra`), '');
    const noisy = await validateExample({ document: JSON.stringify(doc), options: { media: folderResolver(dir, {}, FOLDER_OPS, 20) } });
    expect(resultsOf(noisy, 'JDX-ENV-011').map((r) => r.params)).toEqual([{ cause: 'tooManyEntries', path: '' }]);
  });

  it('registers MED-002, MED-006, MED-007 and MED-008', () => {
    expect(CODES.map((id) => RULES.get(id))).toEqual([MED_002, MED_006, MED_007, MED_008]);
  });

  it('a MED-007 flood, about 2 MiB of files that are not in the folder, lists 100 and counts the rest, quickly', async () => {
    const { text, count } = mediaFlood('"delivery":1');
    const counted = countedOps();
    const { report, chars } = await measured({ document: text, options: { media: folderResolver(folder(), {}, counted.ops) } });
    expect(reportErrors(report)).toEqual([]);
    expect(resultsOf(report, ...CODES).map((r) => r.instanceLocation)).toEqual(Array.from({ length: MAX_RESULTS_PER_RULE }, (_, i) => `/media/${i}/path`));
    expect(omittedOf(report, ...CODES)).toEqual([{ ruleId: 'JDX-MED-007', count: count - MAX_RESULTS_PER_RULE }]);
    expect(report.checks.media).toBe('failed');
    expect(count).toBeGreaterThan(30_000);
    expect(chars).toBeLessThan(100_000);
    // La carpeta vacía se lee una vez para todos los paths.
    expect(counted.reads.length).toBeLessThanOrEqual(2);
    expect(counted.lstats()).toBeLessThanOrEqual(5);
  });

  it('a MED-006 flood, about 2 MiB of previous files in neither the state nor the folder, lists 100 and counts the rest', async () => {
    const base = docBuilder().set('/declaration/revision', 2).text;
    const { text, count } = mediaFlood('"delivery":1', base);
    const counted = countedOps();
    const { report } = await measured({ document: text, fileName: `${ID}.r2.jdx.json`, options: { media: folderResolver(folder(), {}, counted.ops), state: memoryState(withMedia([])) } });
    expect(reportErrors(report)).toEqual([]);
    expect(omittedOf(report, ...CODES)).toEqual([{ ruleId: 'JDX-MED-006', count: count - MAX_RESULTS_PER_RULE }]);
    expect(counted.reads.length).toBeLessThanOrEqual(2);
    expect(counted.lstats()).toBeLessThanOrEqual(5);
  });

  it('two thousand delivered files with another size are each compared once, without hashing', async () => {
    const dir = folder();
    const n = 2000;
    const doc = JSON.parse(docBuilder().text) as Doc;
    delete (doc.edition as Doc).deposit;
    delete (doc.edition as Doc).media;
    delete (doc.recordings as Doc[])[0]!.media;
    delete (doc.agreements as Doc[])[0]!.media;
    doc.media = Array.from({ length: n }, (_, i) => {
      writeFileSync(join(dir, `a${i}.pdf`), 'xx');
      return { id: `m${i}`, kind: 'audio', path: `a${i}.pdf`, delivery: 1, size: 1, sha256: sha('x') };
    });
    const counted = countedOps();
    const resolver = counting(folderResolver(dir, {}, counted.ops));
    const { report } = await measured({ document: JSON.stringify(doc), options: { media: resolver } });
    expect(reportErrors(report)).toEqual([]);
    expect(omittedOf(report, ...CODES)).toEqual([{ ruleId: 'JDX-MED-002', count: n - MAX_RESULTS_PER_RULE }]);
    expect([resolver.stats.length, resolver.hashes.length]).toEqual([n, 0]);
    // Cada archivo se mira una vez, y la carpeta se lee una vez.
    expect(counted.reads.length).toBeLessThanOrEqual(2);
    expect(counted.lstats()).toBeLessThanOrEqual(n + 5);
  });
});
