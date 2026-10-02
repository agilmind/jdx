/**
 * Contratos compartidos (src/types.ts) contra ejemplos y firmas literales: el
 * reporte, la lista de confianza, StateStore, MediaResolver, la entrada y las
 * opciones de validate, y el estado.
 * Vitest los chequea con tsc (--typecheck).
 */
import { describe, expectTypeOf, it } from 'vitest';
import type {
  CheckName,
  CheckStatus,
  Env,
  MediaResolver,
  Profile,
  Report,
  ReportParts,
  ReportSignature,
  SignatureReason,
  State,
  StateStore,
  TrustList,
  ValidateInput,
  ValidateOptions,
} from '../../src/types.js';

describe('src/types.ts', () => {
  it('report example is assignable to Report', () => {
    // Un reporte de ejemplo: sin signature.reason ni document.media ni document.issuer.
    const example: Report = { "jdxReport": "1.0", "valid": true, "disposition": "ingest", "exitCode": 0,
      "validator": { "name": "jdx", "version": "1.0.3", "catalog": "1.0" },
      "options": { "env": "production", "profile": "sadaic/0.1", "signature": "optional",
                   "failOn": "error", "receivedAt": "2026-09-30T09:12:00-03:00", "dir": true, "lang": "es" },
      "document": { "fileName": "3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r2.jdx.json",
                    "declarationId": "3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13", "revision": 2, "jdx": "1.0",
                    "sha256": "ee53610fc89012e5b1eea19cc3ae8a81932981146afa63920a027d2a42222787",
                    "size": 48213, "declaredProfiles": ["https://jdx.jupiter.ar/profiles/sadaic/0.1"] },
      "appliedProfiles": ["https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.0"],
      "checks": { "environment": "passed", "json": "passed", "schema": "passed", "core": "passed",
                  "profile": "warning", "policy": "passed", "media": "passed", "signature": "verified" },
      "signature": { "status": "verified", "kid": "3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E",
                     "issuer": { "id": "jupiter", "name": "Jupiter" }, "env": "production" },
      "trustList": { "seq": 1, "expiresAt": "2026-12-29T00:00:00-03:00" },
      "summary": { "error": 0, "warning": 1, "info": 0 },
      "results": [ { "ruleId": "JDX-AGR-003", "level": "warning", "source": "profile:sadaic/0.1@0.1.0",
                     "instanceLocation": "/agreements/0/publisherShare/percent", "context": { "agreement": "a1" },
                     "message": "El contrato da a la editora el 30 %; el tope es 25 %.",
                     "params": { "percent": 30, "cap": 25 } } ] };
    expectTypeOf<Report>().not.toBeAny();
    expectTypeOf(example).toEqualTypeOf<Report>();
  });

  it('signature.reason may be absent', () => {
    expectTypeOf<ReportSignature>().not.toBeAny();
    const absent: ReportSignature = { status: 'absent', kid: null, issuer: null, env: null };
    expectTypeOf(absent).toEqualTypeOf<ReportSignature>();
    expectTypeOf<ReportSignature['reason']>().toEqualTypeOf<SignatureReason | null | undefined>();
  });

  it('trust list example is assignable to TrustList', () => {
    const example: TrustList = { "iss": "https://jdx.jupiter.ar", "env": "production", "seq": 1,
      "issuedAt": "2026-09-30T00:00:00-03:00", "expiresAt": "2026-12-29T00:00:00-03:00",
      "validator": { "minVersion": "1.0.0" }, "revokedRoots": [],
      "keys": [
        { "kty": "EC", "crv": "P-256", "x": "tNoY2fMd0GIr3JfaozCgdYKK9v28CECvJHwhWan7KLs",
          "y": "CVhCPRKE4hebYSX-FDUqwp2-o7Y_YHoHSOBAYhLrPIw",
          "kid": "3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E", "alg": "ES256", "use": "sig",
          "jdx": { "issuer": { "id": "jupiter", "name": "Jupiter" }, "status": "active",
                   "activeAt": "2026-09-30T00:00:00-03:00", "expiresAt": "2028-09-30T00:00:00-03:00",
                   "scope": { "recipients": ["061"],
                              "profiles": ["https://jdx.jupiter.ar/profiles/sadaic"], "jdxMajor": 1 } } },
        { "kty": "EC", "crv": "P-256", "x": "IIDfxdNWbwTdZ7wH4uk6pcKzaS-RaBqbIKlxbk3m0GQ",
          "y": "A8ZP61TYNwUvY9Wmye6H5gY8meBE5FIK5662SGCaM2s",
          "kid": "RMTKb5VZHzluQgQFEqtNEGvJvO8vzw_P4hBhZBfyQE8", "alg": "ES256", "use": "sig",
          "jdx": { "issuer": { "id": "jupiter", "name": "Jupiter" }, "status": "pending",
                   "activeAt": "2028-09-30T00:00:00-03:00", "expiresAt": "2030-09-30T00:00:00-03:00",
                   "scope": { "recipients": ["061"],
                              "profiles": ["https://jdx.jupiter.ar/profiles/sadaic"], "jdxMajor": 1 } } } ],
      "trustAnchors": { "esignatureRoots": ["4a4d23ddfbfedeca930078ec30fc71b418351230864a925872f87bd85ed08584"] } };
    expectTypeOf<TrustList>().not.toBeAny();
    expectTypeOf(example).toEqualTypeOf<TrustList>();
  });

  it('StateStore exposes only read and update', () => {
    expectTypeOf<StateStore>().not.toBeAny();
    expectTypeOf<keyof StateStore>().toEqualTypeOf<'read' | 'update'>();
    expectTypeOf<StateStore['update']>().toEqualTypeOf<(fn: (state: State) => Promise<State>) => Promise<State>>();
    // read es genérico: devuelve lo que devuelve fn, y fn recibe el estado.
    const store = {} as StateStore;
    expectTypeOf(store.read(async (state) => state.trust.maxSeq)).toEqualTypeOf<Promise<number>>();
    expectTypeOf(store.read<string>).parameter(0).parameter(0).toEqualTypeOf<State>();
  });

  it('MediaResolver has the documented shape', () => {
    interface SpecMediaResolver {
      list(): AsyncIterable<{ path: string; type: 'file' | 'symlink' | 'other' }>;
      stat(path: string): Promise<{ type: 'file' | 'symlink' | 'other'; size: number } | null>;
      sha256(path: string): Promise<string>;
    }
    expectTypeOf<MediaResolver>().not.toBeAny();
    expectTypeOf<MediaResolver>().toEqualTypeOf<SpecMediaResolver>();
  });

  it('ValidateInput and ValidateOptions have the documented shape', () => {
    // Un archivo de más del tope se puede pasar sin leerlo, con su tamaño y su sha256.
    type SpecInput = { bytes: Uint8Array; fileName: string; jws?: string } | { size: number; sha256: string; fileName: string; jws?: string };
    type SpecOptions = {
      profile: string | Profile;
      env: 'production' | 'sandbox';
      signature?: 'optional' | 'required';
      trustList?: Uint8Array;
      state?: StateStore;
      media?: MediaResolver;
      receivedAt: string;
      failOn?: 'error' | 'warning';
      account?: { id: string; identifiers: { scheme: string; value: string }[] };
      lang?: 'es' | 'pt' | 'en';
    };
    expectTypeOf<ValidateInput>().not.toBeAny();
    expectTypeOf<ValidateInput>().toEqualTypeOf<SpecInput>();
    expectTypeOf<ValidateOptions>().not.toBeAny();
    expectTypeOf<ValidateOptions>().toEqualTypeOf<SpecOptions>();
  });

  it('CheckStatus includes verified and absent', () => {
    expectTypeOf<CheckStatus>().not.toBeAny();
    expectTypeOf<'verified' | 'absent'>().toExtend<CheckStatus>();
    expectTypeOf<CheckStatus>().toEqualTypeOf<'passed' | 'warning' | 'failed' | 'notEvaluated' | 'verified' | 'absent'>();
    expectTypeOf<Report['checks']>().toEqualTypeOf<Record<CheckName, CheckStatus>>();
  });

  it('ReportParts carries outcome and evaluated buckets', () => {
    expectTypeOf<ReportParts>().not.toBeAny();
    expectTypeOf<ReportParts['outcome']>().toEqualTypeOf<'completed' | 'environment' | 'internal'>();
    expectTypeOf<ReportParts['evaluated']>().toEqualTypeOf<ReadonlySet<CheckName>>();
    expectTypeOf<ReportParts['hasState']>().toEqualTypeOf<boolean>();
  });

  it('State.env is optional in memory', () => {
    expectTypeOf<State>().not.toBeAny();
    const neverWritten: State = { stateVersion: 1, trust: { maxSeq: 0 }, declarations: {} };
    expectTypeOf(neverWritten).toEqualTypeOf<State>();
    expectTypeOf<State['env']>().toEqualTypeOf<Env | undefined>();
  });
});
