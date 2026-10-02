/**
 * El paso de entorno: las opciones, el perfil y su catálogo, la firma pedida
 * contra el piso del perfil, el estado del receptor (lectura compartida) y, si
 * hay .jws, la lista de confianza. Cada falla da su resultado JDX-ENV-* y el
 * archivo no se evalúa (salida 2). Las opciones del reporte salen siempre, con
 * null donde una opción no sirve.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { dirMediaResolver, FOLDER_OPS, type FolderOps, folderResolver } from '../../../src/media/dirMediaResolver.js';
import { MEDIA_FOLDER_CAUSES, MediaFolderError } from '../../../src/media/errors.js';
import { files } from '../../../src/generated/data.js';
import { VERSION } from '../../../src/generated/version.js';
import { bundledProfiles } from '../../../src/profile/resolve.js';
import { schemaBundle } from '../../../src/schema/bundle.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import { StateError } from '../../../src/state/errors.js';
import { emptyState, fileStateStore } from '../../../src/state/fileStateStore.js';
import { evaluateEnvironment } from '../../../src/validate/environment.js';
import { loadValues } from '../../../src/values/load.js';
import type { EnvironmentOutcome, Finding, JsonValue, MediaResolver, Profile, State, StateStore, ValidateInput, ValidateOptions, ValidatorDeps } from '../../../src/types.js';
import { sadaicProfile } from '../../helpers/sadaicProfile.js';
import { withReceipt } from '../../helpers/stateWorker.js';
import { signTestTrustList, TEST_NOW, TEST_ROOT_KEYS, TEST_ROOTS, trustListExample } from '../../helpers/trustFixtures.js';

const NAME = '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json';
const EXAMPLE = readFileSync(new URL(`../../../docs/ejemplo/${NAME}`, import.meta.url));
const validators = defaultValidators();
const catalog = loadCatalog(JSON.parse(files['catalog/1.0/rules.json'] as string) as JsonValue, validators);
const DEPS: ValidatorDeps = {
  clock: () => TEST_NOW, roots: TEST_ROOTS, schemas: schemaBundle(files), validators, catalog,
  profiles: bundledProfiles(files), values: loadValues(files), rules: new Map(), validatorVersion: VERSION,
};
const REPORT_OPTIONS_SCHEMA = (DEPS.schemas.aux.report as { properties: { options: object } }).properties.options;

const [A, B] = TEST_ROOT_KEYS.production;
const LIST = signTestTrustList(trustListExample(), [A!, B!]);
const JWS = 'eyJhbGciOiJFUzI1NiJ9..c2lnbmF0dXJh';
const INPUT: ValidateInput = { bytes: EXAMPLE, fileName: NAME };
const SIGNED: ValidateInput = { ...INPUT, jws: JWS };
const RECEIVED = '2026-09-30T09:12:00-03:00';

/** Un estado fijo, en memoria. */
const memoryState = (state: State): StateStore => ({
  read: async (fn) => fn(state),
  update: async () => {
    throw new Error('el paso de entorno no escribe');
  },
});
/** Un estado que siempre falla con ese error. */
const failingState = (error: Error): StateStore => ({
  read: async () => {
    throw error;
  },
  update: async () => {
    throw error;
  },
});
const SANDBOX_STATE = memoryState(emptyState('sandbox'));
const PRODUCTION_STATE = memoryState({ ...emptyState('production'), trust: { maxSeq: 1 } });

const sandbox = (more: Partial<ValidateOptions> = {}): ValidateOptions => ({ profile: 'sadaic/0.1', env: 'sandbox', receivedAt: RECEIVED, ...more });
const production = (more: Partial<ValidateOptions> = {}): ValidateOptions => ({
  profile: 'sadaic/0.1', env: 'production', receivedAt: RECEIVED, state: PRODUCTION_STATE, ...more,
});
/** Un perfil con piso de firma required: el empaquetado con otra firma, leído como de un archivo. */
const floorRequired = (): Profile => ({ ...sadaicProfile(), signature: 'required' });

const run = (opts: ValidateOptions, input: ValidateInput = INPUT, deps: ValidatorDeps = DEPS) => evaluateEnvironment(input, opts, deps);

/** El resultado de un entorno que pasa. */
async function passed(opts: ValidateOptions, input?: ValidateInput): Promise<Extract<EnvironmentOutcome, { ok: true }>> {
  const outcome = await run(opts, input);
  if (!outcome.ok) throw new Error(`no pasó: ${JSON.stringify(outcome.findings)}`);
  expect(validators.validateWith(REPORT_OPTIONS_SCHEMA, outcome.reportOptions as unknown as JsonValue)).toEqual([]);
  return outcome;
}
/** Los hallazgos de un entorno que falla, como [ruleId, params]: de entorno, del archivo entero y con params que cumplen su regla. */
async function failed(opts: ValidateOptions, input?: ValidateInput): Promise<[string, Finding['params']][]> {
  const outcome = await run(opts, input);
  expect(outcome.ok).toBe(false);
  expect(validators.validateWith(REPORT_OPTIONS_SCHEMA, outcome.reportOptions as unknown as JsonValue)).toEqual([]);
  const found = outcome.ok ? [] : outcome.findings;
  for (const f of found) {
    const rule = catalog.rules.find((r) => r.id === f.ruleId);
    expect(rule?.layer, f.ruleId).toBe('environment');
    expect(f.instanceLocation, f.ruleId).toBe('');
    expect(validators.validateWith(rule?.resultParamsSchema ?? {}, f.params ?? {}), JSON.stringify(f)).toEqual([]);
  }
  return found.map((f) => [f.ruleId, f.params]);
}
const env010 = (option: string, reason: 'missing' | 'invalid'): [string, Finding['params']] => ['JDX-ENV-010', { option, reason }];

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function stateDir(): string {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'jdx-env-'));
  dirs.push(dir);
  return dir;
}

describe('entorno', () => {
  it('the causes of a folder that cannot be used are those of ENV-011 in the catalog, in its order', () => {
    const rule = catalog.rules.find((r) => r.id === 'JDX-ENV-011');
    expect((rule?.resultParamsSchema as { properties: { cause: { enum: string[] } } }).properties.cause.enum).toEqual(MEDIA_FOLDER_CAUSES);
  });

  it('the delivery folder: one that is missing, is not a folder or fails its check → ENV-011 with the cause and the place', async () => {
    const dir = stateDir();
    writeFileSync(join(dir, 'a.pdf'), 'a');
    expect((await passed(sandbox({ media: dirMediaResolver(dir) }))).reportOptions.dir).toBe(true);
    expect(await failed(sandbox({ media: dirMediaResolver(join(dir, 'no-existe')) }))).toEqual([['JDX-ENV-011', { cause: 'missingDir', path: '' }]]);
    expect(await failed(sandbox({ media: dirMediaResolver(join(dir, 'a.pdf')) }))).toEqual([['JDX-ENV-011', { cause: 'notDirectory', path: '' }]]);
    // Con las demás fallas del entorno, una más; un resolver sin check pasa el paso.
    expect(await failed(sandbox({ media: dirMediaResolver(join(dir, 'no-existe')), lang: 'xx' as never }))).toEqual([
      env010('--lang', 'invalid'), ['JDX-ENV-011', { cause: 'missingDir', path: '' }],
    ]);
    const plain: MediaResolver = { list: async function* () {}, stat: async () => null, sha256: async () => '' };
    await passed(sandbox({ media: plain }));
    const folder = (error: Error): MediaResolver => ({ ...plain, check: async () => { throw error; } });
    expect(await failed(sandbox({ media: folder(new MediaFolderError('io', '')) }))).toEqual([['JDX-ENV-011', { cause: 'io', path: '' }]]);
    // Otra excepción de check no es del entorno: el paso la deja pasar.
    await expect(run(sandbox({ media: folder(new Error('roto')) }))).rejects.toThrow('roto');
  });

  it('how the folder was looked up reaches the report: anchored, by path only for a private copy, null without a folder', async () => {
    const dir = stateDir();
    writeFileSync(join(dir, 'a.pdf'), 'a');
    const anchored = process.platform === 'darwin' || process.platform === 'linux';
    if (anchored) {
      expect((await passed(sandbox({ media: dirMediaResolver(dir) }))).reportOptions.dirLookup).toBe('anchored');
      expect((await passed(sandbox({ media: dirMediaResolver(dir), privateCopy: true }))).reportOptions.dirLookup).toBe('anchored');
    }
    // Sin /.vol ni /proc: la carpeta no se puede usar, salvo que el receptor diga que es una copia privada.
    const unanchored: FolderOps = {
      ...FOLDER_OPS,
      lstat: (path) => (path.toString().startsWith('/.vol/') ? Promise.reject(Object.assign(new Error('sin /.vol'), { code: 'ENOENT' })) : FOLDER_OPS.lstat(path)),
      readlink: (path) => (path.startsWith('/proc/') ? Promise.reject(Object.assign(new Error('sin /proc'), { code: 'ENOENT' })) : FOLDER_OPS.readlink(path)),
    };
    expect(await failed(sandbox({ media: folderResolver(dir, {}, unanchored) }))).toEqual([['JDX-ENV-011', { cause: 'unanchored', path: '' }]]);
    expect((await passed(sandbox({ media: folderResolver(dir, {}, unanchored), privateCopy: true }))).reportOptions.dirLookup).toBe('path');
    // Sin carpeta, o con un resolver propio que no lo dice: null. La opción tiene que ser un booleano.
    expect((await passed(sandbox({ privateCopy: true }))).reportOptions.dirLookup).toBeNull();
    const plain: MediaResolver = { list: async function* () {}, stat: async () => null, sha256: async () => '', check: async () => undefined };
    expect((await passed(sandbox({ media: plain }))).reportOptions).toMatchObject({ dir: true, dirLookup: null });
    expect(await failed(sandbox({ privateCopy: 'sí' as never }))).toEqual([env010('--private-copy', 'invalid')]);
  });

  it('missing env → ENV-010', async () => {
    const { env: _env, ...noEnv } = sandbox();
    expect(await failed(noEnv as ValidateOptions)).toEqual([env010('--env', 'missing')]);
    expect(await failed(sandbox({ env: 'staging' as never }))).toEqual([env010('--env', 'invalid')]);
    // Sin perfil, tampoco.
    const { profile: _profile, ...noProfile } = sandbox();
    expect(await failed(noProfile as ValidateOptions)).toEqual([env010('--profile', 'missing')]);
  });

  it('receivedAt not RFC 3339 or not in calendar → ENV-010', async () => {
    for (const receivedAt of ['2026-09-30 09:12:00', '2026-09-30T09:12:00', '30/09/2026', 'ahora']) {
      expect(await failed(sandbox({ receivedAt })), receivedAt).toEqual([env010('--received-at', 'invalid')]);
    }
    // Cumple el patrón pero no existe: 31 de septiembre, hora 24, segundo 60 fuera del último minuto UTC.
    for (const receivedAt of ['2026-09-31T09:12:00-03:00', '2026-09-30T24:00:00Z', '2026-09-30T12:00:60Z']) {
      expect(await failed(sandbox({ receivedAt })), receivedAt).toEqual([env010('--received-at', 'invalid')]);
    }
    const { receivedAt: _receivedAt, ...none } = sandbox();
    expect(await failed(none as ValidateOptions)).toEqual([env010('--received-at', 'missing')]);
    // Con offset, con fracción de 9 dígitos y en Z, vale, y queda como instante.
    const ok = await passed(sandbox({ receivedAt: '2026-09-30T12:12:00.123456789Z' }));
    expect(ok.options.receivedAt).toEqual({ text: '2026-09-30T12:12:00.123456789Z', epochNanos: 1_790_770_320_123_456_789n, localDate: '2026-09-30' });
  });

  it('production without state → ENV-010', async () => {
    expect(await failed(production({ state: undefined }))).toEqual([env010('--state-dir', 'missing')]);
    // En sandbox, el estado es opcional.
    expect((await passed(sandbox())).state).toBeNull();
  });

  it('effective signature: production + floor optional → required', async () => {
    const ok = await passed(production());
    expect([ok.options.signature, ok.options.signatureExplicit, ok.reportOptions.signature]).toEqual(['required', false, 'required']);
  });

  it('sandbox + floor optional → optional', async () => {
    const ok = await passed(sandbox());
    expect([ok.options.signature, ok.options.signatureExplicit, ok.reportOptions.signature]).toEqual(['optional', false, 'optional']);
  });

  it('sandbox + floor required, no flag → required without ENV-008', async () => {
    const ok = await passed(sandbox({ profile: floorRequired() }));
    expect([ok.options.signature, ok.options.signatureExplicit]).toEqual(['required', false]);
  });

  it('explicit optional under floor required → ENV-008', async () => {
    expect(await failed(sandbox({ profile: floorRequired(), signature: 'optional' }))).toEqual([
      ['JDX-ENV-008', { signature: 'optional', floor: 'required' }],
    ]);
    // También en producción: el piso manda sobre lo explícito, no el default del entorno.
    expect(await failed(production({ profile: floorRequired(), signature: 'optional' }))).toEqual([
      ['JDX-ENV-008', { signature: 'optional', floor: 'required' }],
    ]);
    // Explícito optional en producción con piso optional vale: solo el piso es un mínimo.
    const ok = await passed(production({ signature: 'optional' }));
    expect([ok.options.signature, ok.options.signatureExplicit]).toEqual(['optional', true]);
  });

  it('explicit required over floor optional → required', async () => {
    const ok = await passed(sandbox({ signature: 'required' }));
    expect([ok.options.signature, ok.options.signatureExplicit, ok.reportOptions.signature]).toEqual(['required', true, 'required']);
    expect(await failed(sandbox({ signature: 'weak' as never }))).toEqual([env010('--signature', 'invalid')]);
  });

  it('state error → ENV-005 with reason', async () => {
    const locked = new StateError('locked', { lockedSince: '2026-09-30T12:11:00.250Z' });
    expect(await failed(production({ state: failingState(locked) }))).toEqual([['JDX-ENV-005', { reason: 'locked', lockedSince: '2026-09-30T12:11:00.250Z' }]]);
    expect(await failed(production({ state: failingState(new StateError('version', { stateVersion: 2 })) }))).toEqual([['JDX-ENV-005', { reason: 'version' }]]);
    // Con un estado de archivo de verdad: uno que no es JSON.
    const dir = stateDir();
    const store = fileStateStore(dir);
    await store.update(async (state) => withReceipt(state, 1));
    writeFileSync(join(dir, 'state.json'), '{ roto');
    expect(await failed(production({ state: store }))).toEqual([['JDX-ENV-005', { reason: 'unreadable', cause: 'json' }]]);
    // Una carpeta que no existe dice eso; una causa que el catálogo no tiene no sale.
    expect(await failed(production({ state: fileStateStore(join(dir, 'no-existe')) }))).toEqual([['JDX-ENV-005', { reason: 'unreadable', cause: 'missingDir' }]]);
    expect(await failed(production({ state: failingState(new StateError('unreadable', { cause: 'ENOSPC' })) }))).toEqual([['JDX-ENV-005', { reason: 'unreadable' }]]);
    // Un bloqueo sin desde cuándo usa el reloj del validador, para que el resultado cumpla su schema.
    expect(await failed(production({ state: failingState(new StateError('locked')) }))).toEqual([['JDX-ENV-005', { reason: 'locked', lockedSince: TEST_NOW.toISOString() }]]);
    // Otra falla del estado no es de entorno: sale como excepción (validate la devuelve como JDX-INT-001).
    await expect(run(production({ state: failingState(new Error('disco')) }))).rejects.toThrow('disco');
  });

  it('state of another env → ENV-005 reason env', async () => {
    expect(await failed(production({ state: SANDBOX_STATE }))).toEqual([['JDX-ENV-005', { reason: 'env' }]]);
    expect(await failed(sandbox({ state: PRODUCTION_STATE }))).toEqual([['JDX-ENV-005', { reason: 'env' }]]);
    expect((await passed(sandbox({ state: SANDBOX_STATE }))).state).toEqual(emptyState('sandbox'));
  });

  it('the seq of the list is compared only with a state of the same env', async () => {
    // Un estado de sandbox que vio el seq 5: en producción da ENV-005 env, y su maxSeq no se compara con la lista.
    const sandboxAhead = memoryState({ ...emptyState('sandbox'), trust: { maxSeq: 5 } });
    expect(await failed(production({ state: sandboxAhead, trustList: LIST }), SIGNED)).toEqual([['JDX-ENV-005', { reason: 'env' }]]);
    // El mismo maxSeq en un estado de producción sí da ENV-004, y en uno nunca escrito (sin env) también se compara.
    const productionAhead = memoryState({ ...emptyState('production'), trust: { maxSeq: 5 } });
    expect(await failed(production({ state: productionAhead, trustList: LIST }), SIGNED)).toEqual([['JDX-ENV-004', { seq: 1, maxSeq: 5 }]]);
    const { env: _env, ...unwritten } = { ...emptyState('production'), trust: { maxSeq: 5 } };
    expect(await failed(production({ state: memoryState(unwritten as State), trustList: LIST }), SIGNED)).toEqual([['JDX-ENV-004', { seq: 1, maxSeq: 5 }]]);
  });

  it('a new state without env passes', async () => {
    // Una carpeta vacía: el estado nunca escrito no tiene entorno, y lo fija la primera escritura.
    const ok = await passed(production({ state: fileStateStore(stateDir()) }));
    expect(ok.state).toEqual(emptyState());
    expect(ok.options.env).toBe('production');
  });

  it('jws without trust list → ENV-001', async () => {
    expect(await failed(production(), SIGNED)).toEqual([['JDX-ENV-001', { reason: 'missing' }]]);
    // Con la lista, la lista se verifica y vuelve con las raíces que contaron.
    const ok = await passed(production({ trustList: LIST }), SIGNED);
    expect([ok.trust?.list.seq, ok.trust?.rootKids]).toEqual([1, [A?.kid, B?.kid]]);
  });

  it('trust list failures come back as their ENV-*', async () => {
    const list = (change: (l: ReturnType<typeof trustListExample>) => void, signers = [A!, B!]) => {
      const l = trustListExample();
      change(l);
      return signTestTrustList(l, signers);
    };
    const withList = (trustList: Uint8Array, more: Partial<ValidateOptions> = {}) => failed(production({ trustList, ...more }), SIGNED);
    expect(await withList(new TextEncoder().encode('no es una lista'))).toEqual([['JDX-ENV-001', { reason: 'invalid', cause: 'jws' }]]);
    expect(await withList(list(() => {}, [A!]))).toEqual([['JDX-ENV-003', undefined]]);
    expect(await withList(list((l) => {
      l.expiresAt = '2026-09-30T12:00:00Z';
    }))).toEqual([['JDX-ENV-002', { expiresAt: '2026-09-30T12:00:00Z' }]]);
    expect(await withList(list((l) => {
      l.validator.minVersion = '9.0.0';
    }))).toEqual([['JDX-ENV-007', { reason: 'minVersion', required: '9.0.0', version: VERSION }]]);
    // El maxSeq sale del estado leído.
    const ahead = memoryState({ ...emptyState('production'), trust: { maxSeq: 4 } });
    expect(await withList(LIST, { state: ahead })).toEqual([['JDX-ENV-004', { seq: 1, maxSeq: 4 }]]);
    const [SA, SB] = TEST_ROOT_KEYS.sandbox;
    expect(await withList(list((l) => {
      l.env = 'sandbox';
    }, [SA!, SB!]))).toEqual([['JDX-ENV-009', { env: 'production', listEnv: 'sandbox' }]]);
    // La lista se vence por el reloj de las deps.
    const late = await evaluateEnvironment(SIGNED, production({ trustList: LIST }), { ...DEPS, clock: () => new Date('2027-01-01T00:00:00Z') });
    expect(late.ok ? [] : late.findings.map((f) => f.ruleId)).toEqual(['JDX-ENV-002']);
  });

  it('no jws → trust list ignored', async () => {
    // Una lista que no se puede leer no importa sin .jws, y una buena tampoco se usa.
    expect((await passed(production({ trustList: new TextEncoder().encode('no es una lista') }))).trust).toBeNull();
    expect((await passed(production({ trustList: LIST }))).trust).toBeNull();
  });

  it('several failures → one result each', async () => {
    const locked = failingState(new StateError('locked', { lockedSince: '2026-09-30T12:11:00.250Z' }));
    const found = await failed({
      profile: 'sadaic/9.9', env: 'production', receivedAt: 'ayer', state: locked, failOn: 'never' as never, lang: 'fr' as never,
      account: { id: 'cuenta-1' } as never,
    }, SIGNED);
    expect(found).toEqual([
      env010('--received-at', 'invalid'),
      env010('--fail-on', 'invalid'),
      env010('--lang', 'invalid'),
      env010('--account', 'invalid'),
      ['JDX-ENV-006', { reason: 'unknownProfile', profile: 'sadaic/9.9' }],
      ['JDX-ENV-005', { reason: 'locked', lockedSince: '2026-09-30T12:11:00.250Z' }],
      ['JDX-ENV-001', { reason: 'missing' }],
    ]);
    // Un perfil con dos reglas que no se pueden aplicar da dos resultados.
    const twoBad: Profile = { ...sadaicProfile(), rules: [{ ruleId: 'JDX-XYZ-001' }, { ruleId: 'JDX-SHR-001' }] };
    expect(await failed(sandbox({ profile: twoBad }))).toEqual([
      ['JDX-ENV-006', { reason: 'unknownRule', ruleId: 'JDX-XYZ-001' }],
      ['JDX-ENV-006', { reason: 'retiredRule', ruleId: 'JDX-SHR-001' }],
    ]);
  });

  it('profile failure skips ENV-008', async () => {
    expect(await failed(sandbox({ profile: 'sadaic/9.9', signature: 'optional' }))).toEqual([['JDX-ENV-006', { reason: 'unknownProfile', profile: 'sadaic/9.9' }]]);
    // Un perfil con piso required que no se puede aplicar tampoco da ENV-008.
    const broken: Profile = { ...floorRequired(), rules: [{ ruleId: 'JDX-CMP-002', params: { scheme: 3 } }] };
    expect(await failed(sandbox({ profile: broken, signature: 'optional' }))).toEqual([['JDX-ENV-006', { reason: 'invalidParams', ruleId: 'JDX-CMP-002' }]]);
    // El perfil que falla vuelve null; el pedido, tal cual, en las opciones del reporte.
    const outcome = await run(sandbox({ profile: 'sadaic/9.9' }));
    expect([outcome.profile, outcome.reportOptions.profile]).toEqual([null, 'sadaic/9.9']);
  });

  it('reportOptions.profile is the resolved short id', async () => {
    for (const profile of ['sadaic/0.1', 'https://jdx.jupiter.ar/profiles/sadaic/0.1', sadaicProfile(), floorRequired()]) {
      const ok = await passed(sandbox({ profile }));
      expect([ok.reportOptions.profile, ok.options.profileShortId], JSON.stringify(profile).slice(0, 60)).toEqual(['sadaic/0.1', 'sadaic/0.1']);
    }
    // Las opciones del reporte: las efectivas, con dir según haya carpeta.
    const ok = await passed(production({ failOn: 'warning', lang: 'pt', media: { list: async function* () {}, stat: async () => null, sha256: async () => '' } }));
    expect(ok.reportOptions).toEqual({
      env: 'production', profile: 'sadaic/0.1', signature: 'required', failOn: 'warning', receivedAt: RECEIVED, dir: true, dirLookup: null, lang: 'pt',
    });
    expect(ok.options).toMatchObject({ env: 'production', profileShortId: 'sadaic/0.1', failOn: 'warning', lang: 'pt', dir: true });
    expect(ok.profile.applied).toBe('https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.0');
    expect((await passed(sandbox())).reportOptions).toEqual({
      env: 'sandbox', profile: 'sadaic/0.1', signature: 'optional', failOn: 'error', receivedAt: RECEIVED, dir: false, dirLookup: null, lang: 'es',
    });
  });

  it('reportOptions.receivedAt is null when receivedAt gives ENV-010', async () => {
    const outcome = await run(sandbox({ receivedAt: '2026-09-31T09:12:00-03:00' }));
    expect(outcome.ok).toBe(false);
    expect(outcome.reportOptions.receivedAt).toBeNull();
    // Y lo mismo con otras opciones que no sirven: env null, failOn y lang por defecto.
    const bad = await run({ profile: 'sadaic/0.1', env: 'staging' as never, receivedAt: 'x', failOn: 'never' as never, lang: 'fr' as never });
    expect(bad.reportOptions).toEqual({ env: null, profile: 'sadaic/0.1', signature: 'optional', failOn: 'error', receivedAt: null, dir: false, dirLookup: null, lang: 'es' });
    expect(validators.validateWith(REPORT_OPTIONS_SCHEMA, bad.reportOptions as unknown as JsonValue)).toEqual([]);
  });
});
