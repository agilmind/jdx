/**
 * Schemas auxiliares de la lista de confianza, el estado del receptor, el
 * reporte y las cuentas de --accounts, empaquetados y validados con
 * defaultValidators.
 */
import { describe, expect, it } from 'vitest';
import { files } from '../../../src/generated/data.js';
import { schemaBundle } from '../../../src/schema/bundle.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { AuxSchemaName, JsonValue } from '../../../src/types.js';

type Obj = { [k: string]: JsonValue };

const errors = (name: AuxSchemaName, value: JsonValue) => defaultValidators().validateAux(name, value);
const at = (list: { instanceLocation: string; keyword: string }[]) => list.map((e) => [e.instanceLocation, e.keyword]);

/** Una lista de confianza de ejemplo: una clave activa y una de reserva. */
const TRUST: Obj = {
  iss: 'https://jdx.jupiter.ar', env: 'production', seq: 1,
  issuedAt: '2026-09-30T00:00:00-03:00', expiresAt: '2026-12-29T00:00:00-03:00',
  validator: { minVersion: '1.0.0' }, revokedRoots: [],
  keys: [
    { kty: 'EC', crv: 'P-256', x: 'tNoY2fMd0GIr3JfaozCgdYKK9v28CECvJHwhWan7KLs',
      y: 'CVhCPRKE4hebYSX-FDUqwp2-o7Y_YHoHSOBAYhLrPIw',
      kid: '3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E', alg: 'ES256', use: 'sig',
      jdx: { issuer: { id: 'jupiter', name: 'Jupiter' }, status: 'active',
             activeAt: '2026-09-30T00:00:00-03:00', expiresAt: '2028-09-30T00:00:00-03:00',
             scope: { recipients: ['061'], profiles: ['https://jdx.jupiter.ar/profiles/sadaic'], jdxMajor: 1 } } },
    { kty: 'EC', crv: 'P-256', x: 'IIDfxdNWbwTdZ7wH4uk6pcKzaS-RaBqbIKlxbk3m0GQ',
      y: 'A8ZP61TYNwUvY9Wmye6H5gY8meBE5FIK5662SGCaM2s',
      kid: 'RMTKb5VZHzluQgQFEqtNEGvJvO8vzw_P4hBhZBfyQE8', alg: 'ES256', use: 'sig',
      jdx: { issuer: { id: 'jupiter', name: 'Jupiter' }, status: 'pending',
             activeAt: '2028-09-30T00:00:00-03:00', expiresAt: '2030-09-30T00:00:00-03:00',
             scope: { recipients: ['061'], profiles: ['https://jdx.jupiter.ar/profiles/sadaic'], jdxMajor: 1 } } },
  ],
  trustAnchors: { esignatureRoots: ['4a4d23ddfbfedeca930078ec30fc71b418351230864a925872f87bd85ed08584'] },
};

/** Un reporte de ejemplo, sin signature.reason ni document.media ni document.issuer. */
const REPORT: Obj = {
  jdxReport: '1.0', valid: true, disposition: 'ingest', exitCode: 0,
  validator: { name: 'jdx', version: '1.0.3', catalog: '1.0' },
  options: { env: 'production', profile: 'sadaic/0.1', signature: 'optional',
             failOn: 'error', receivedAt: '2026-09-30T09:12:00-03:00', dir: true, lang: 'es' },
  document: { fileName: '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r2.jdx.json',
              declarationId: '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13', revision: 2, jdx: '1.0',
              sha256: 'ee53610fc89012e5b1eea19cc3ae8a81932981146afa63920a027d2a42222787',
              size: 48213, declaredProfiles: ['https://jdx.jupiter.ar/profiles/sadaic/0.1'] },
  appliedProfiles: ['https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1.0'],
  checks: { environment: 'passed', json: 'passed', schema: 'passed', core: 'passed',
            profile: 'warning', policy: 'passed', media: 'passed', signature: 'verified' },
  signature: { status: 'verified', kid: '3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E',
               issuer: { id: 'jupiter', name: 'Jupiter' }, env: 'production' },
  trustList: { seq: 1, expiresAt: '2026-12-29T00:00:00-03:00' },
  summary: { error: 0, warning: 1, info: 0 },
  results: [ { ruleId: 'JDX-AGR-003', level: 'warning', source: 'profile:sadaic/0.1@0.1.0',
               instanceLocation: '/agreements/0/publisherShare/percent', context: { agreement: 'a1' },
               message: 'El contrato da a la editora el 30 %; el tope es 25 %.',
               params: { percent: 30, cap: 25 } } ],
};

/** La lista de ejemplo con la primera clave cambiada. */
function withFirstKey(change: (meta: Obj, key: Obj) => void): Obj {
  const list = structuredClone(TRUST);
  const key = (list.keys as Obj[])[0] as Obj;
  change(key.jdx as Obj, key);
  return list;
}

/** El reporte de ejemplo con `document` y `signature` cambiados. */
function report(document: Obj = {}, signature: Obj = {}, rest: Obj = {}): Obj {
  return {
    ...structuredClone(REPORT),
    ...rest,
    document: { ...(REPORT.document as Obj), ...document },
    signature: { ...(REPORT.signature as Obj), ...signature },
  };
}

const STATE: Obj = {
  stateVersion: 1,
  env: 'production',
  trust: { maxSeq: 1 },
  declarations: {
    '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13': {
      owner: 'jupiter',
      lastIngestedRevision: 1,
      receipts: [
        {
          revision: 1,
          sha256: 'ee53610fc89012e5b1eea19cc3ae8a81932981146afa63920a027d2a42222787',
          receivedAt: '2026-09-30T09:12:00-03:00',
          kid: '3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E',
          ackStatus: 'ingested',
        },
      ],
      media: [{ path: 'Chacarera-del-Rancho.mp3', delivery: 1, size: 5234011, sha256: 'ac7dad09e27c23710ca72670f4bef247670177689b6c330b95381724a7e9a69b' }],
    },
  },
};

describe('schemas auxiliares', () => {
  it('trust list example validates', () => {
    expect((TRUST.keys as Obj[]).length).toBe(2);
    expect(errors('trustList', TRUST)).toEqual([]);
  });

  it('retired key requires retiredAt and reason', () => {
    const retired = withFirstKey((meta) => {
      meta.status = 'retired';
    });
    expect(errors('trustList', retired).map((e) => [e.instanceLocation, e.keyword, e.params.missingProperty])).toEqual([
      ['/keys/0/jdx', 'required', 'retiredAt'],
      ['/keys/0/jdx', 'required', 'reason'],
    ]);
    const complete = withFirstKey((meta) => {
      Object.assign(meta, { status: 'retired', retiredAt: '2027-03-01T00:00:00-03:00', reason: 'superseded' });
    });
    expect(errors('trustList', complete)).toEqual([]);
    const compromised = withFirstKey((meta) => {
      Object.assign(meta, { status: 'retired', retiredAt: '2027-03-01T00:00:00-03:00', reason: 'compromised' });
    });
    expect(at(errors('trustList', compromised))).toEqual([['/keys/0/jdx/reason', 'enum']]);
  });

  it('revoked key requires reason compromised and compromisedAt', () => {
    const revoked = withFirstKey((meta) => {
      Object.assign(meta, { status: 'revoked', reason: 'compromised', compromisedAt: '2027-01-10T08:00:00Z' });
    });
    expect(errors('trustList', revoked)).toEqual([]);
    const withoutDate = withFirstKey((meta) => {
      Object.assign(meta, { status: 'revoked', reason: 'compromised' });
    });
    expect(errors('trustList', withoutDate).map((e) => [e.instanceLocation, e.params.missingProperty])).toEqual([['/keys/0/jdx', 'compromisedAt']]);
    const superseded = withFirstKey((meta) => {
      Object.assign(meta, { status: 'revoked', reason: 'superseded', compromisedAt: '2027-01-10T08:00:00Z' });
    });
    expect(at(errors('trustList', superseded))).toEqual([['/keys/0/jdx/reason', 'const']]);
  });

  it('pending and active keys carry no retiredAt, reason or compromisedAt, and retired keys no compromisedAt', () => {
    const marks = { retiredAt: '2027-03-01T00:00:00-03:00', reason: 'compromised', compromisedAt: '2027-01-10T08:00:00Z' };
    for (const status of ['pending', 'active']) {
      const marked = withFirstKey((meta) => {
        Object.assign(meta, { status, ...marks });
      });
      expect(at(errors('trustList', marked)), status).toEqual([
        ['/keys/0/jdx/retiredAt', 'not'],
        ['/keys/0/jdx/compromisedAt', 'not'],
        ['/keys/0/jdx/reason', 'not'],
      ]);
    }
    const retired = withFirstKey((meta) => {
      Object.assign(meta, { status: 'retired', ...marks, reason: 'superseded' });
    });
    expect(at(errors('trustList', retired))).toEqual([['/keys/0/jdx/compromisedAt', 'not']]);
    // Una clave revoked puede conservar el retiredAt de un retiro anterior.
    const revoked = withFirstKey((meta) => {
      Object.assign(meta, { status: 'revoked', ...marks });
    });
    expect(errors('trustList', revoked)).toEqual([]);
  });

  it('trustAnchors.esignatureRoots lists SHA-256 fingerprints and admits nothing else', () => {
    const root = '4a4d23ddfbfedeca930078ec30fc71b418351230864a925872f87bd85ed08584';
    expect(errors('trustList', { ...TRUST, trustAnchors: { esignatureRoots: [root, root.replace('4a', '5b')] } })).toEqual([]);
    expect(at(errors('trustList', { ...TRUST, trustAnchors: { esignatureRoots: [root.toUpperCase()] } }))).toEqual([
      ['/trustAnchors/esignatureRoots/0', 'pattern'],
    ]);
    expect(at(errors('trustList', { ...TRUST, trustAnchors: { esignatureRoots: root } }))).toEqual([['/trustAnchors/esignatureRoots', 'type']]);
    expect(at(errors('trustList', { ...TRUST, trustAnchors: { rootSha256: root } }))).toEqual([['/trustAnchors/rootSha256', 'additionalProperties']]);
  });

  it('iss is const', () => {
    expect(at(errors('trustList', { ...TRUST, iss: 'https://example.com' }))).toEqual([['/iss', 'const']]);
  });

  it('keys require kid, alg ES256 and use sig', () => {
    const withoutKid = withFirstKey((_meta, key) => {
      delete key.kid;
    });
    expect(errors('trustList', withoutKid).map((e) => [e.instanceLocation, e.params.missingProperty])).toEqual([['/keys/0', 'kid']]);
    const es384 = withFirstKey((_meta, key) => {
      key.alg = 'ES384';
      key.use = 'enc';
    });
    expect(at(errors('trustList', es384))).toEqual([
      ['/keys/0/alg', 'const'],
      ['/keys/0/use', 'const'],
    ]);
  });

  it('state stateVersion const 1 and env required', () => {
    expect(errors('state', STATE)).toEqual([]);
    expect(at(errors('state', { ...STATE, stateVersion: 2 }))).toEqual([['/stateVersion', 'const']]);
    const { env: _env, ...withoutEnv } = STATE;
    expect(errors('state', withoutEnv).map((e) => [e.instanceLocation, e.params.missingProperty])).toEqual([['', 'env']]);
    // Las claves de declarations son UUID.
    expect(at(errors('state', { ...STATE, declarations: { 'no-es-uuid': { receipts: [], media: [] } } }))).toEqual([
      ['/declarations', 'pattern'],
      ['/declarations', 'propertyNames'],
    ]);
  });

  it('report example validates', () => {
    expect(REPORT.jdxReport).toBe('1.0');
    expect(errors('report', REPORT)).toEqual([]);
  });

  it('signature.reason, document.media and document.issuer may be absent', () => {
    // El ejemplo no trae ninguno de los tres; el validador los emite siempre.
    expect(REPORT.signature).not.toHaveProperty('reason');
    expect(REPORT.document).not.toHaveProperty('media');
    expect(REPORT.document).not.toHaveProperty('issuer');
    const media = [{ path: 'Chacarera-del-Rancho.mp3', delivery: 1, size: 5234011, sha256: 'ac7dad09e27c23710ca72670f4bef247670177689b6c330b95381724a7e9a69b' }];
    const full = report({ issuer: { id: 'jupiter', name: 'Jupiter' }, media }, { reason: null });
    expect(errors('report', full)).toEqual([]);
    expect(errors('report', report({}, { status: 'invalid', issuer: null, reason: 'aud' }))).toEqual([]);
    expect(at(errors('report', report({ media: [{ path: 'a.pdf', delivery: 1 }] })))).toEqual([['/document/media/0', 'required'], ['/document/media/0', 'required']]);
    expect(at(errors('report', report({}, { reason: 'otra' })))).toEqual([['/signature/reason', 'enum']]);
  });

  it('report admits null in valid, disposition, declarationId, revision, jdx and document.issuer', () => {
    const exit2 = report(
      { declarationId: null, revision: null, jdx: null, declaredProfiles: null, issuer: null, media: null },
      { status: 'notEvaluated', kid: null, issuer: null, env: null, reason: null },
      { valid: null, disposition: null, exitCode: 2, trustList: null },
    );
    expect(errors('report', exit2)).toEqual([]);
    // En el resto, null no vale.
    expect(at(errors('report', report({ sha256: null })))).toEqual([['/document/sha256', 'type']]);
    expect(at(errors('report', { ...REPORT, exitCode: null }))).toEqual([['/exitCode', 'type'], ['/exitCode', 'enum']]);
  });

  it('checks take passed, warning, failed or notEvaluated, and signature verified or absent instead of passed', () => {
    const withChecks = (checks: Obj) => ({ ...REPORT, checks: { ...(REPORT.checks as Obj), ...checks } });
    for (const status of ['passed', 'warning', 'failed', 'notEvaluated']) {
      expect(errors('report', withChecks({ environment: status, media: status })), status).toEqual([]);
    }
    for (const status of ['verified', 'absent', 'warning', 'failed', 'notEvaluated']) {
      expect(errors('report', withChecks({ signature: status })), status).toEqual([]);
    }
    expect(at(errors('report', withChecks({ environment: 'verified', json: 'absent', signature: 'passed' })))).toEqual([
      ['/checks/environment', 'enum'],
      ['/checks/json', 'enum'],
      ['/checks/signature', 'enum'],
    ]);
  });

  it('signature.issuer is null unless signature.status is verified', () => {
    // Nadie lee como autenticado el emisor de un archivo cuya firma no se verificó.
    for (const status of ['absent', 'invalid', 'unknownKey', 'keyPending', 'keyRetired', 'keyRevoked', 'notEvaluated']) {
      expect(at(errors('report', report({}, { status }))), status).toEqual([['/signature/issuer', 'type']]);
      expect(errors('report', report({}, { status, issuer: null })), status).toEqual([]);
    }
    expect((REPORT.signature as Obj).status).toBe('verified');
    expect(errors('report', REPORT)).toEqual([]);
  });

  it('trustList.expiresAt and ack.at are instants', () => {
    expect(at(errors('report', { ...REPORT, trustList: { seq: 1, expiresAt: 'mañana' } }))).toEqual([['/trustList/expiresAt', 'pattern']]);
    expect(at(errors('report', { ...REPORT, ack: { status: 'ingested', at: '2026-09-30 09:12' } }))).toEqual([['/ack/at', 'pattern']]);
    expect(errors('report', { ...REPORT, ack: { status: 'ingested', at: '2026-09-30T09:12:00.5-03:00' } })).toEqual([]);
  });

  it('options.receivedAt is an instant or null, issuer ids follow their pattern and appliedProfiles are <id>@<version>', () => {
    const withOptions = (options: Obj) => ({ ...REPORT, options: { ...(REPORT.options as Obj), ...options } });
    expect(errors('report', withOptions({ receivedAt: null }))).toEqual([]);
    expect(at(errors('report', withOptions({ receivedAt: 'ayer' })))).toEqual([['/options/receivedAt', 'pattern']]);
    // document.issuer sale de declaration.issuer solo si cumple su patrón; signature.issuer, de la lista de confianza.
    expect(errors('report', report({ issuer: { id: 'editorial-sur', name: '' } }))).toEqual([]);
    expect(at(errors('report', report({ issuer: { id: 'Not Valid!', name: '' } }, { issuer: { id: '', name: '' } })))).toEqual([
      ['/document/issuer/id', 'pattern'],
      ['/signature/issuer/id', 'pattern'],
    ]);
    // El id de un perfil (el patrón de profile.schema.json) y su versión M.m.p.
    expect(errors('report', { ...REPORT, appliedProfiles: [] })).toEqual([]);
    const applied = ['cualquier cosa', 'https://jdx.jupiter.ar/profiles/sadaic/0.1', 'sadaic/0.1@0.1.0', 'https://jdx.jupiter.ar/profiles/sadaic/0.1@0.1'];
    expect(at(errors('report', { ...REPORT, appliedProfiles: applied }))).toEqual(applied.map((_, i) => [`/appliedProfiles/${i}`, 'pattern']));
  });

  it('results[].source pattern', () => {
    const withSource = (source: string) => ({ ...REPORT, results: [{ ...((REPORT.results as Obj[])[0] as Obj), source }] });
    for (const source of ['environment', 'core', 'schema', 'policy', 'profile:sadaic/0.1@0.1.0']) {
      expect(errors('report', withSource(source)), source).toEqual([]);
    }
    for (const source of ['profile:sadaic/0.1', 'profile:@', 'perfil', 'profile:sadaic/0.1@0.1.0 ']) {
      expect(at(errors('report', withSource(source))), source).toEqual([['/results/0/source', 'pattern']]);
    }
  });

  it('accounts example validates', () => {
    const accounts = {
      accounts: [
        { id: 'editorial-sur', identifiers: [{ scheme: 'TAX_ID', value: '30712345678' }, { scheme: 'IPI_NAME', value: '00098765432' }] },
        { id: 'otra-cuenta', identifiers: [] },
      ],
    };
    expect(errors('accounts', accounts)).toEqual([]);
    expect(errors('accounts', { accounts: [{ id: 'x' }] }).map((e) => [e.instanceLocation, e.params.missingProperty])).toEqual([['/accounts/0', 'identifiers']]);
    expect(at(errors('accounts', { accounts: [{ id: 'x', identifiers: [{ scheme: 'tax_id', value: '1' }] }] }))).toEqual([
      ['/accounts/0/identifiers/0/scheme', 'pattern'],
    ]);
  });

  it('the bundle now has the six aux schemas', () => {
    expect(Object.keys(schemaBundle(files).aux).sort()).toEqual(['accounts', 'catalog', 'profile', 'report', 'state', 'trustList']);
  });
});
