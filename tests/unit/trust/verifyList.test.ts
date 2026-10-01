/**
 * La lista de confianza: un JWS JSON general cuyo payload es la lista, firmado
 * por al menos dos raíces fijadas del entorno de la lista y no revocadas. Una
 * lista que no se puede leer (otra forma, más de 8 firmas, payload que no es
 * I-JSON o no cumple su schema, una versión que semver no lee, kid repetido,
 * una coordenada que no está en base64url canónico, una vigencia fuera de sus
 * topes) da JDX-ENV-001; sin dos firmas que cuenten, JDX-ENV-003; con las
 * firmas, cada otra falla da su resultado: otro entorno (JDX-ENV-009), vencida
 * por el reloj (JDX-ENV-002), un validador más viejo que el pedido
 * (JDX-ENV-007) y un seq menor que el del estado (JDX-ENV-004). Leerla cuesta
 * poco aunque sea grande: cada raíz se prueba una vez. JDX-TRU-001 no sale de
 * acá.
 */
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCatalog } from '../../../src/catalog/load.js';
import { files } from '../../../src/generated/data.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import { ecThumbprint, filterRoots } from '../../../src/trust/keys.js';
import { MAX_TRUST_LIST_SIGNATURES, verifyTrustList } from '../../../src/trust/verifyList.js';
import type { Env, Finding, JsonValue, PinnedRoots, TrustList, TrustListOutcome } from '../../../src/types.js';
import {
  nonCanonical, signTestTrustList, TEST_NOW, TEST_ROOT_KEYS, TEST_ROOTS, trustHeader, trustListExample, type TestRootKey, type TestSigner,
} from '../../helpers/trustFixtures.js';

const validators = defaultValidators();
const catalog = loadCatalog(JSON.parse(files['catalog/1.0/rules.json'] as string) as JsonValue, validators);
const [A, B, C] = TEST_ROOT_KEYS.production as [TestRootKey, TestRootKey, TestRootKey];
const [SA, SB] = TEST_ROOT_KEYS.sandbox as [TestRootKey, TestRootKey];
const OUTSIDER = TEST_ROOT_KEYS.unpinned[0] as TestRootKey;
const kidOf = (signer: TestSigner): string => ('key' in signer ? signer.key : signer).kid;

afterEach(() => {
  vi.restoreAllMocks();
});

interface Opts { env?: Env; roots?: PinnedRoots; now?: Date; validatorVersion?: string; maxSeq?: number | null }
const verify = (jws: Uint8Array, opts: Opts = {}): Promise<TrustListOutcome> =>
  verifyTrustList(jws, {
    env: opts.env ?? 'production', roots: opts.roots ?? TEST_ROOTS, now: opts.now ?? TEST_NOW,
    validatorVersion: opts.validatorVersion ?? '1.0.0', maxSeq: opts.maxSeq === undefined ? 1 : opts.maxSeq, validators,
  });
const signed = (signers: readonly TestSigner[], list: TrustList | Uint8Array = trustListExample()) => signTestTrustList(list, signers);

/** Las raíces que contaron, de una lista que se aceptó. */
async function accepted(jws: Uint8Array, opts?: Opts): Promise<string[]> {
  const outcome = await verify(jws, opts);
  if (!outcome.ok) throw new Error(`no se aceptó: ${JSON.stringify(outcome.findings)}`);
  return outcome.trust.rootKids;
}
/** Los hallazgos de una lista que no se aceptó, como [ruleId, params]: de entorno, del archivo entero y con params que cumplen su regla. */
async function refused(jws: Uint8Array, opts?: Opts): Promise<[string, Finding['params']][]> {
  const outcome = await verify(jws, opts);
  expect(outcome.ok).toBe(false);
  const found = outcome.ok ? [] : outcome.findings;
  for (const f of found) {
    const rule = catalog.rules.find((r) => r.id === f.ruleId);
    expect(rule?.layer, f.ruleId).toBe('environment');
    expect(f.instanceLocation, f.ruleId).toBe('');
    expect(validators.validateWith(rule?.resultParamsSchema ?? {}, f.params ?? {}), JSON.stringify(f)).toEqual([]);
  }
  return found.map((f) => [f.ruleId, f.params]);
}
const UNREADABLE: [string, Finding['params']][] = [['JDX-ENV-001', { reason: 'invalid' }]];
const NOT_SIGNED: [string, Finding['params']][] = [['JDX-ENV-003', undefined]];

/** The trust list example con un cambio. */
function listWith(change: (list: TrustList) => void): TrustList {
  const list = trustListExample();
  change(list);
  return list;
}
const firstKey = (list: TrustList) => list.keys[0] as TrustList['keys'][number];
/** Una clave de emisor nueva, con la vigencia y el alcance de la del ejemplo. */
function freshKey(): TrustList['keys'][number] {
  const { x, y } = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const key = { ...structuredClone(firstKey(trustListExample())), x, y };
  return { ...key, kid: ecThumbprint(key) };
}

describe('lista de confianza', () => {
  it('2 of 3 roots valid', async () => {
    const outcome = await verify(signed([A, B]));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.trust.rootKids).toEqual([kidOf(A), kidOf(B)]);
    // La lista es el payload, tal cual, y no se puede cambiar.
    expect(outcome.trust.list).toEqual(trustListExample());
    expect(Object.isFrozen(outcome.trust.list.keys[0]?.jdx.scope)).toBe(true);
    // Cualquier par de las tres, en cualquier orden.
    expect(await accepted(signed([C, A]))).toEqual([kidOf(C), kidOf(A)]);
    expect(await accepted(signed([B, C]))).toEqual([kidOf(B), kidOf(C)]);
  });

  it('3 of 3 valid', async () => {
    expect(await accepted(signed([A, B, C]))).toEqual([kidOf(A), kidOf(B), kidOf(C)]);
  });

  it('1 of 3 → ENV-003', async () => {
    expect(await refused(signed([A]))).toEqual(NOT_SIGNED);
    // Una firma que no verifica no cuenta, ni sobre otro payload.
    expect(await refused(signed([A, { key: B, tamper: true }]))).toEqual(NOT_SIGNED);
    const other = JSON.parse(new TextDecoder().decode(signed([B], listWith((list) => {
      list.seq = 2;
    })))) as { signatures: unknown[] };
    const mixed = JSON.parse(new TextDecoder().decode(signed([A]))) as { payload: string; signatures: unknown[] };
    expect(await refused(new TextEncoder().encode(JSON.stringify({ payload: mixed.payload, signatures: [...mixed.signatures, ...other.signatures] })))).toEqual(NOT_SIGNED);
  });

  it('same root twice counts once', async () => {
    expect(await refused(signed([A, A]))).toEqual(NOT_SIGNED);
    expect(await accepted(signed([A, A, B]))).toEqual([kidOf(A), kidOf(B)]);
  });

  it('each pinned root is tried once, with its first signature', async () => {
    const verifications = vi.spyOn(crypto.subtle, 'verify');
    // Una primera firma alterada de A no se vuelve a probar con la buena que sigue.
    expect(await refused(signed([{ key: A, tamper: true }, A, B]))).toEqual(NOT_SIGNED);
    expect(verifications).toHaveBeenCalledTimes(2);
    // Ocho firmas alteradas de las tres raíces: tres verificaciones.
    verifications.mockClear();
    expect(await refused(signed([A, A, A, B, B, B, C, C].map((key) => ({ key, tamper: true }))))).toEqual(NOT_SIGNED);
    expect(verifications).toHaveBeenCalledTimes(3);
    // Las que no son raíces fijadas no se verifican.
    verifications.mockClear();
    expect(await refused(signed([OUTSIDER, OUTSIDER, SA, SB, A]))).toEqual(NOT_SIGNED);
    expect(verifications).toHaveBeenCalledTimes(1);
    expect(await accepted(signed([A, { key: A, tamper: true }, B]))).toEqual([kidOf(A), kidOf(B)]);
  });

  it('more than 8 signatures → ENV-001', async () => {
    const nine = [A, B, C, ...Array.from({ length: 6 }, () => OUTSIDER)];
    expect(nine).toHaveLength(MAX_TRUST_LIST_SIGNATURES + 1);
    expect(await refused(signed(nine))).toEqual(UNREADABLE);
    expect(await accepted(signed(nine.slice(0, MAX_TRUST_LIST_SIGNATURES)))).toEqual([kidOf(A), kidOf(B), kidOf(C)]);
  });

  it('a large tampered list is refused quickly', async () => {
    const verifications = vi.spyOn(crypto.subtle, 'verify');
    const validateAux = vi.spyOn(validators, 'validateAux');
    const firstAuxError = vi.spyOn(validators, 'firstAuxError');
    const started = performance.now();
    // 2000 claves que cumplen todo y ocho firmas alteradas: se leen las claves y se prueba cada raíz una vez.
    const big = listWith((l) => {
      l.keys = Array.from({ length: 2000 }, freshKey);
    });
    expect(await refused(signed([A, A, A, B, B, B, C, C].map((key) => ({ key, tamper: true })), big))).toEqual(NOT_SIGNED);
    expect(verifications).toHaveBeenCalledTimes(3);
    // 20 000 claves que no cumplen el schema: se valida hasta el primer error.
    const offSchema = listWith((l) => {
      l.keys = Array.from({ length: 20_000 }, () => ({ ...structuredClone(firstKey(l)), alg: 'ES384' as 'ES256' }));
    });
    expect(await refused(signed([A, B], offSchema))).toEqual(UNREADABLE);
    expect(firstAuxError).toHaveBeenCalledTimes(2);
    expect(validateAux.mock.calls.filter(([name]) => name === 'trustList')).toEqual([]);
    // 20 000 firmas que dicen ser de A: no se recorren.
    const good = JSON.parse(new TextDecoder().decode(signed([A, B]))) as { payload: string; signatures: unknown[] };
    const many = { payload: good.payload, signatures: Array.from({ length: 20_000 }, () => good.signatures[0]) };
    expect(await refused(new TextEncoder().encode(JSON.stringify(many)))).toEqual(UNREADABLE);
    expect(verifications).toHaveBeenCalledTimes(3);
    expect(performance.now() - started).toBeLessThan(10_000);
  }, 30_000);

  it('revoked root does not count', async () => {
    const revokingA = listWith((list) => {
      list.revokedRoots = [kidOf(A)];
    });
    expect(await refused(signed([A, B], revokingA))).toEqual(NOT_SIGNED);
    expect(await accepted(signed([A, B, C], revokingA))).toEqual([kidOf(B), kidOf(C)]);
  });

  it('unpinned signer ignored', async () => {
    expect(await accepted(signed([OUTSIDER, A, B]))).toEqual([kidOf(A), kidOf(B)]);
    expect(await refused(signed([OUTSIDER, A]))).toEqual(NOT_SIGNED);
    // Una raíz de sandbox no cuenta para una lista de producción.
    expect(await refused(signed([SA, A]))).toEqual(NOT_SIGNED);
  });

  it('wrong typ does not count', async () => {
    const base = trustHeader(B);
    for (const header of [
      { ...base, typ: 'JWT' },
      { ...base, typ: 'vnd.jupiter.jdx+jws' },
      { alg: 'ES256', kid: kidOf(B) },
      // Solo { alg, kid, typ }: otro miembro, aunque el resto esté bien, tampoco.
      { ...base, crit: ['exp'], exp: 1 },
      { ...base, jwk: { kty: 'EC' } },
      { ...base, alg: 'ES384' },
      { ...base, kid: kidOf(C) },
    ]) {
      expect(await refused(signed([A, { key: B, header }])), JSON.stringify(header)).toEqual(NOT_SIGNED);
    }
    expect(await accepted(signed([A, { key: B, header: base }]))).toEqual([kidOf(A), kidOf(B)]);
  });

  it('duplicate keys in payload → ENV-001', async () => {
    const text = JSON.stringify(trustListExample()).replace('"seq":1,', '"seq":1,"seq":1,');
    expect(await refused(signed([A, B], new TextEncoder().encode(text)))).toEqual(UNREADABLE);
  });

  it('duplicate kid → ENV-001', async () => {
    // trust-list.schema.json no lo controla: cada clave es válida, pero dos traen el mismo kid.
    const list = listWith((l) => {
      l.keys.push({ ...structuredClone(firstKey(l)), jdx: { ...structuredClone(firstKey(l).jdx), status: 'pending', activeAt: '2028-09-30T00:00:00-03:00', expiresAt: '2030-09-30T00:00:00-03:00' } });
    });
    expect(validators.validateAux('trustList', list as unknown as JsonValue)).toEqual([]);
    expect(await refused(signed([A, B], list))).toEqual(UNREADABLE);
    // Un kid que no es la huella de su clave tampoco se puede leer.
    expect(await refused(signed([A, B], listWith((l) => {
      firstKey(l).kid = l.keys[1]?.kid ?? '';
      l.keys.pop();
    })))).toEqual(UNREADABLE);
  });

  it('a coordinate that is not canonical base64url → ENV-001', async () => {
    // Los mismos 32 bytes escritos de otra forma darían otra huella: la misma clave, dos veces, con dos kids.
    const key = firstKey(trustListExample());
    expect(Buffer.from(nonCanonical(key.x), 'base64url')).toEqual(Buffer.from(key.x, 'base64url'));
    for (const coordinate of ['x', 'y'] as const) {
      const twice = listWith((l) => {
        const copy = { ...structuredClone(firstKey(l)), [coordinate]: nonCanonical(firstKey(l)[coordinate]) };
        l.keys.push({ ...copy, kid: ecThumbprint(copy) });
      });
      expect(validators.validateAux('trustList', twice as unknown as JsonValue)).toEqual([]);
      expect(await refused(signed([A, B], twice)), coordinate).toEqual(UNREADABLE);
    }
    // Una coordenada de otro largo tampoco: el schema pide 43 caracteres.
    expect(await refused(signed([A, B], listWith((l) => {
      firstKey(l).x = `${firstKey(l).x}A`;
    })))).toEqual(UNREADABLE);
  });

  it('not a JSON general serialization → ENV-001', async () => {
    const good = JSON.parse(new TextDecoder().decode(signed([A, B]))) as { payload: string; signatures: { protected: string; signature: string }[] };
    const [first] = good.signatures as [{ protected: string; signature: string }];
    const variants: unknown[] = [
      // Compacto, plano, sin firmas, con un encabezado sin proteger, con miembros de más o de otro tipo.
      `${first.protected}.${good.payload}.${first.signature}`,
      { payload: good.payload, protected: first.protected, signature: first.signature },
      { payload: good.payload, signatures: [] },
      { payload: good.payload, signatures: [{ ...first, header: { kid: kidOf(A) } }, good.signatures[1]] },
      { ...good, extra: true },
      { payload: good.payload },
      { payload: 7, signatures: good.signatures },
      { payload: good.payload, signatures: [{ protected: first.protected }, good.signatures[1]] },
      { payload: good.payload, signatures: first },
      // Un payload que no es base64url, o con relleno.
      { payload: `${good.payload}=`, signatures: good.signatures },
      { payload: `${good.payload.slice(0, -1)}+`, signatures: good.signatures },
      [good],
    ];
    for (const variant of variants) {
      expect(await refused(new TextEncoder().encode(JSON.stringify(variant))), JSON.stringify(variant).slice(0, 80)).toEqual(UNREADABLE);
    }
    // Bytes que no son JSON, o I-JSON con claves repetidas.
    expect(await refused(new TextEncoder().encode('no es json'))).toEqual(UNREADABLE);
    expect(await refused(new Uint8Array())).toEqual(UNREADABLE);
    const repeated = new TextDecoder().decode(signed([A, B])).replace('{"payload":', '{"payload":"x","payload":');
    expect(await refused(new TextEncoder().encode(repeated))).toEqual(UNREADABLE);
    // Un payload que no es JSON.
    const noJson = signTestTrustList(new TextEncoder().encode('{ "iss": '), [A, B]);
    expect(await refused(noJson)).toEqual(UNREADABLE);
  });

  it('payload failing schema → ENV-001', async () => {
    for (const change of [
      (l: TrustList) => {
        (l as { iss: string }).iss = 'https://otro.example';
      },
      (l: TrustList) => {
        delete (l as Partial<TrustList>).keys;
      },
      (l: TrustList) => {
        (l as { seq: number }).seq = 0;
      },
      (l: TrustList) => {
        Object.assign(firstKey(l).jdx, { status: 'retired' });
      },
      (l: TrustList) => {
        Object.assign(l, { extra: 1 });
      },
    ]) {
      expect(await refused(signed([A, B], listWith(change)))).toEqual(UNREADABLE);
    }
  });

  it('an instant that does not exist in the calendar → ENV-001', async () => {
    expect(await refused(signed([A, B], listWith((l) => {
      l.expiresAt = '2026-12-32T00:00:00-03:00';
    })))).toEqual(UNREADABLE);
    expect(await refused(signed([A, B], listWith((l) => {
      firstKey(l).jdx.activeAt = '2026-02-29T00:00:00-03:00';
    })))).toEqual(UNREADABLE);
  });

  it('key with expiresAt > activeAt + 2 years → ENV-001', async () => {
    // Un nanosegundo de más alcanza, escrito en otro offset.
    for (const expiresAt of ['2028-09-30T00:00:00.000000001-03:00', '2028-09-30T03:00:00.000000001Z', '2028-10-01T00:00:00-03:00']) {
      expect(await refused(signed([A, B], listWith((l) => {
        firstKey(l).jdx.expiresAt = expiresAt;
      }))), expiresAt).toEqual(UNREADABLE);
    }
    // También la clave de reserva, aunque esté pending.
    expect(await refused(signed([A, B], listWith((l) => {
      (l.keys[1] as TrustList['keys'][number]).jdx.expiresAt = '2030-09-30T00:00:01-03:00';
    })))).toEqual(UNREADABLE);
  });

  it('key at exactly activeAt + 2 years is fine', async () => {
    for (const expiresAt of ['2028-09-30T00:00:00-03:00', '2028-09-30T03:00:00Z', '2028-09-30T03:00:00.000000000Z', '2028-09-29T23:59:59.999999999-03:00']) {
      expect(await accepted(signed([A, B], listWith((l) => {
        firstKey(l).jdx.expiresAt = expiresAt;
      }))), expiresAt).toHaveLength(2);
    }
    // El 29 de febrero más 2 años es el 28 de febrero (java.time).
    const leap = (expiresAt: string) => signed([A, B], listWith((l) => {
      Object.assign(firstKey(l).jdx, { activeAt: '2028-02-29T10:00:00Z', expiresAt });
    }));
    expect(await accepted(leap('2030-02-28T10:00:00Z'))).toHaveLength(2);
    expect(await refused(leap('2030-02-28T10:00:00.5Z'))).toEqual(UNREADABLE);
  });

  it('a list issued after it expires, or valid for more than 90 days → ENV-001', async () => {
    const lasting = (issuedAt: string, expiresAt: string) => signed([A, B], listWith((l) => {
      Object.assign(l, { issuedAt, expiresAt });
    }));
    // El ejemplo dura exactamente 90 días, escritos en otro offset vale lo mismo.
    expect(await accepted(lasting('2026-09-30T00:00:00-03:00', '2026-12-29T00:00:00-03:00'))).toHaveLength(2);
    expect(await accepted(lasting('2026-09-30T03:00:00Z', '2026-12-29T00:00:00-03:00'))).toHaveLength(2);
    expect(await accepted(lasting('2026-12-29T00:00:00-03:00', '2026-12-29T03:00:00Z'))).toHaveLength(2);
    // Un nanosegundo de más, o al revés.
    expect(await refused(lasting('2026-09-30T00:00:00-03:00', '2026-12-29T00:00:00.000000001-03:00'))).toEqual(UNREADABLE);
    expect(await refused(lasting('2026-12-29T00:00:00-03:00', '2026-12-29T02:59:59.999999999Z'))).toEqual(UNREADABLE);
  });

  it('a key that expires before it becomes active → ENV-001', async () => {
    const key = (activeAt: string, expiresAt: string) => signed([A, B], listWith((l) => {
      Object.assign(firstKey(l).jdx, { activeAt, expiresAt });
    }));
    expect(await refused(key('2026-09-30T00:00:00-03:00', '2026-09-30T02:59:59Z'))).toEqual(UNREADABLE);
    expect(await accepted(key('2026-09-30T00:00:00-03:00', '2026-09-30T03:00:00Z'))).toHaveLength(2);
  });

  it('env mismatch → ENV-009', async () => {
    // Una lista de sandbox, firmada por las raíces de sandbox, en una validación de producción.
    const sandbox = listWith((l) => {
      l.env = 'sandbox';
    });
    expect(await refused(signed([SA, SB], sandbox))).toEqual([['JDX-ENV-009', { env: 'production', listEnv: 'sandbox' }]]);
    expect(await accepted(signed([SA, SB], sandbox), { env: 'sandbox' })).toEqual([kidOf(SA), kidOf(SB)]);
    // Las raíces de producción no firman una lista de sandbox, ni las de sandbox una de producción.
    expect(await refused(signed([A, B], sandbox), { env: 'sandbox' })).toEqual(NOT_SIGNED);
    expect(await refused(signed([SA, SB]), { env: 'sandbox' })).toEqual(NOT_SIGNED);
    // ENV-009 solo si el validador fija las raíces del entorno de la lista: la imagen de producción no trae las de
    // sandbox, y ahí la misma lista da ENV-003.
    expect(await refused(signed([SA, SB], sandbox), { roots: filterRoots(TEST_ROOTS, ['production']) })).toEqual(NOT_SIGNED);
  });

  it('expired by clock → ENV-002', async () => {
    // expiresAt 2026-12-29T00:00:00-03:00 es 2026-12-29T03:00:00Z: hasta ese instante vale.
    const jws = signed([A, B]);
    expect(await accepted(jws, { now: new Date('2026-12-29T03:00:00.000Z') })).toHaveLength(2);
    expect(await refused(jws, { now: new Date('2026-12-29T03:00:00.001Z') })).toEqual([['JDX-ENV-002', { expiresAt: '2026-12-29T00:00:00-03:00' }]]);
    // Comparado en nanosegundos: un vencimiento un nanosegundo después del reloj todavía vale (emitida un nanosegundo
    // después, para no pasar de 90 días).
    const nanos = signed([A, B], listWith((l) => {
      Object.assign(l, { issuedAt: '2026-09-30T00:00:00.000000001-03:00', expiresAt: '2026-12-29T00:00:00.000000001-03:00' });
    }));
    expect(await accepted(nanos, { now: new Date('2026-12-29T03:00:00.000Z') })).toHaveLength(2);
    expect(await refused(nanos, { now: new Date('2026-12-29T03:00:00.001Z') })).toEqual([['JDX-ENV-002', { expiresAt: '2026-12-29T00:00:00.000000001-03:00' }]]);
  });

  it('a minVersion that semver does not read → ENV-001, never an exception', async () => {
    const needs = (minVersion: string) => signed([A, B], listWith((l) => {
      l.validator.minVersion = minVersion;
    }));
    // Ceros a la izquierda, una versión previa o de build, o un número que no entra en un entero seguro.
    for (const minVersion of ['01.0.0', '1.00.0', '1.0.0-rc.1', '1.0.0+b', 'v1.0.0', '1.0', '99999999999999999.0.0']) {
      expect(await refused(needs(minVersion)), minVersion).toEqual(UNREADABLE);
    }
    expect(await accepted(needs('0.0.0'))).toHaveLength(2);
    expect(await accepted(needs('1.0.0'))).toHaveLength(2);
  });

  it('minVersion above validator → ENV-007', async () => {
    const needs = (minVersion: string) => signed([A, B], listWith((l) => {
      l.validator.minVersion = minVersion;
    }));
    expect(await refused(needs('1.0.1'))).toEqual([['JDX-ENV-007', { reason: 'minVersion', required: '1.0.1', version: '1.0.0' }]]);
    expect(await refused(needs('1.10.0'), { validatorVersion: '1.9.9' })).toEqual([['JDX-ENV-007', { reason: 'minVersion', required: '1.10.0', version: '1.9.9' }]]);
    expect(await accepted(needs('1.0.0'))).toHaveLength(2);
    expect(await accepted(needs('0.9.0'))).toHaveLength(2);
  });

  it('seq below maxSeq → ENV-004; equal is fine', async () => {
    const seq3 = signed([A, B], listWith((l) => {
      l.seq = 3;
    }));
    expect(await refused(seq3, { maxSeq: 4 })).toEqual([['JDX-ENV-004', { seq: 3, maxSeq: 4 }]]);
    expect(await accepted(seq3, { maxSeq: 3 })).toHaveLength(2);
    expect(await accepted(seq3, { maxSeq: 2 })).toHaveLength(2);
    // Sin estado (null) o con un estado nuevo (0), no hay con qué comparar.
    expect(await accepted(seq3, { maxSeq: null })).toHaveLength(2);
    expect(await accepted(seq3, { maxSeq: 0 })).toHaveLength(2);
  });

  it('empty pinned roots → ENV-003', async () => {
    expect(await refused(signed([A, B, C]), { roots: { production: [], sandbox: [] } })).toEqual(NOT_SIGNED);
    expect(await refused(signed([A, B, C]), { roots: { production: [], sandbox: TEST_ROOTS.sandbox } })).toEqual(NOT_SIGNED);
  });

  it('several failures of a signed list give one finding each', async () => {
    const old = signed([SA, SB], listWith((l) => {
      Object.assign(l, { env: 'sandbox', seq: 2, expiresAt: '2026-09-30T12:00:00Z' });
      l.validator.minVersion = '2.0.0';
    }));
    // El seq de una lista de otro entorno no se compara con el estado de este.
    expect(await refused(old, { maxSeq: 5 })).toEqual([
      ['JDX-ENV-009', { env: 'production', listEnv: 'sandbox' }],
      ['JDX-ENV-002', { expiresAt: '2026-09-30T12:00:00Z' }],
      ['JDX-ENV-007', { reason: 'minVersion', required: '2.0.0', version: '1.0.0' }],
    ]);
    expect(await refused(old, { env: 'sandbox', maxSeq: 5 })).toEqual([
      ['JDX-ENV-002', { expiresAt: '2026-09-30T12:00:00Z' }],
      ['JDX-ENV-007', { reason: 'minVersion', required: '2.0.0', version: '1.0.0' }],
      ['JDX-ENV-004', { seq: 2, maxSeq: 5 }],
    ]);
  });

  it('the outcome never carries TRU-001', async () => {
    // Una lista que vence en 10 días se acepta sin hallazgos: el aviso lo da la política.
    const soon = signed([A, B], listWith((l) => {
      l.expiresAt = '2026-10-11T12:00:00Z';
    }));
    const outcome = await verify(soon);
    expect(outcome).toEqual({ ok: true, trust: { list: listWith((l) => {
      l.expiresAt = '2026-10-11T12:00:00Z';
    }), rootKids: [kidOf(A), kidOf(B)] } });
    // Una que falla da solo hallazgos de entorno.
    const failed = await verify(signed([A, B], listWith((l) => {
      l.expiresAt = '2026-09-30T12:00:00Z';
    })));
    expect(failed.ok ? [] : failed.findings.map((f) => f.ruleId)).toEqual(['JDX-ENV-002']);
  });
});
