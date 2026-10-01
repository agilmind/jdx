/**
 * Claves y listas de confianza SOLO DE PRUEBA, para los tests de la lista y de
 * la firma: tres raíces de producción, tres de sandbox y una que no fija
 * ningún validador. Sus claves privadas están acá a propósito: ningún
 * validador fija estas raíces (trust/roots.json no las trae), así que nada de
 * lo que firman vale fuera de los tests.
 *
 * - TEST_ROOTS son las raíces fijadas de los tests, como las da
 *   parseRootsFile; TEST_ROOT_KEYS, sus claves privadas.
 * - trustListExample() es the trust list example: la lista de producción
 *   seq 1, con la clave activa del emisor y la de reserva, vigente a TEST_NOW.
 * - signTestTrustList firma un payload con las raíces que se le pasan y
 *   devuelve los bytes del JWS JSON general, como el archivo de la lista. Cada
 *   firma puede llevar otro encabezado o salir alterada, para los casos que no
 *   tienen que contar.
 */
import { sign } from 'node:crypto';
import type { EcPrivateJwk, Env, PinnedRoots, RootKey, TrustList } from '../../src/types.js';

export interface TestRootKey extends EcPrivateJwk { kid: string }

const key = (x: string, y: string, d: string, kid: string): TestRootKey => ({ kty: 'EC', crv: 'P-256', x, y, d, kid });

/** Claves privadas de las raíces de prueba (P-256), con su kid RFC 7638. */
export const TEST_ROOT_KEYS: Readonly<Record<Env | 'unpinned', readonly TestRootKey[]>> = Object.freeze({
  production: [
    key('Ly4A1Co7fYkxm5MT6vONQuytZLIBPUmgAY76m8cTlys', 'Tz6mrK6-YhLNmSRb4YpBkmA24MIOv_RJKAGdCmYf3UA', 'oqDSArz2-UVgknqClv0b9o6uu7JDQDQDt9GZMWYBCtQ', 'o9BGjqhJzstz1dQWjz_0VFVJCUQSsBXUVkG4v7BIZvQ'),
    key('jirfITp-lN0GqRsE2C21Gj4Udt2WFD9xy8O6HlzZPw0', '8hfnVLFaZ9uBq_yAPWDNCO1V_3yfQn_1m_YzLAUTZ0Y', 'oICacPB49-00r_k0ptLdD4aN75Jik5d-TfIHDdwykK4', 'i4oSFyhvnAHmwYjgBGsuDf6EWaATOL3T91l17r_rNzc'),
    key('FfFKMJJfCjT7yVinygX8oKKBeGRBvK0JRVxy5SnEO48', 'TmbmlBjgxBz48eG8NIpdQNDQ3ZLVHqPBPcQbFlOOeRE', 'Ma84l-lPNnMPVBYZFHfFGtLTXYM_YkImyMESMNTMZ64', 'gra36V-Sf6qCQiAdaQE1rStitqpgNcBjDRYq4yB4DWM'),
  ],
  sandbox: [
    key('njKB_Cwd98aW9m3HXmtxY9OsdZ8hPawE-Q2Pf2VjvvU', 'xA0Z6T9xnCBdIgBX1MVCLN1V2RYWOE2qApOsiMt49ZM', 'F9slMYu7-y-2YL9AmooP3a8dgKyTzvGPslEBLs4_Af8', 'oMltiVb36ZYrCP7FBG8p65n6neDZSuR3aRTj2rg4kw4'),
    key('IZGbwt8l3kjDjp5_UfJrAoKqqNy5OJWMAENfTTPtzSs', '8nUouN2tj0LlcANGaA-v289NYCnuSUHom4jMUkk9fHg', 'ZDSwiVO0vZrFn0pQwsvIxAHOQELqDyccvZ9kSN6YOGc', 'kWw6z6uO3WjaFCPDGiS_1l9kpfLobPOiQjfU6EO_X4Y'),
    key('WYiW615DGBa4OLXg_MuqeOWOSNI6kvQ1JjTwTlpjGuo', 'ykNMRTXn8ybqGLg-CPGCuWO1Gwec69VT0LGn722SNhc', 'qhoScqJ5LDz52nX65mIqcKhX1g0fmCmvX9IfI-Y2is4', 'A5R_Q3NI1W7fGxDcuga51c9KOWgZXL9qP_kUQqA7Ly4'),
  ],
  unpinned: [
    key('HAF0GAz4jviURSqD9TwGN3_-IcijmK6N9-Vq9j6im-4', 'AxBNUOtQ0abWAzA8mJTZXIH5rOZ9-CaTkS311KZfU_g', 'Diz8pSxCDSuFLmPFB7YQ2lfDwENeza1xuWXnjXoPze4', 'Za2NUb9bq7bp92uHcZ56rZiJZ3xYTxHlo4hVqiwCfF8'),
  ],
});

const publicOf = ({ kty, crv, x, y, kid }: TestRootKey): RootKey => ({ kty, crv, x, y, kid });

/** Las raíces fijadas de los tests: las públicas de producción y de sandbox. */
export const TEST_ROOTS: PinnedRoots = Object.freeze({
  production: Object.freeze(TEST_ROOT_KEYS.production.map(publicOf)),
  sandbox: Object.freeze(TEST_ROOT_KEYS.sandbox.map(publicOf)),
});

/** Un reloj del validador dentro de la vigencia de the trust list example. */
export const TEST_NOW = new Date('2026-10-01T12:00:00Z');

/** The trust list example: producción, seq 1, una clave activa y una de reserva. Un objeto nuevo en cada llamada. */
export function trustListExample(): TrustList {
  const scope = { recipients: ['061'], profiles: ['https://jdx.jupiter.ar/profiles/sadaic'], jdxMajor: 1 };
  return {
    iss: 'https://jdx.jupiter.ar', env: 'production', seq: 1,
    issuedAt: '2026-09-30T00:00:00-03:00', expiresAt: '2026-12-29T00:00:00-03:00',
    validator: { minVersion: '1.0.0' }, revokedRoots: [],
    keys: [
      { kty: 'EC', crv: 'P-256', x: 'tNoY2fMd0GIr3JfaozCgdYKK9v28CECvJHwhWan7KLs', y: 'CVhCPRKE4hebYSX-FDUqwp2-o7Y_YHoHSOBAYhLrPIw',
        kid: '3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E', alg: 'ES256', use: 'sig',
        jdx: { issuer: { id: 'jupiter', name: 'Jupiter' }, status: 'active',
               activeAt: '2026-09-30T00:00:00-03:00', expiresAt: '2028-09-30T00:00:00-03:00', scope: structuredClone(scope) } },
      { kty: 'EC', crv: 'P-256', x: 'IIDfxdNWbwTdZ7wH4uk6pcKzaS-RaBqbIKlxbk3m0GQ', y: 'A8ZP61TYNwUvY9Wmye6H5gY8meBE5FIK5662SGCaM2s',
        kid: 'RMTKb5VZHzluQgQFEqtNEGvJvO8vzw_P4hBhZBfyQE8', alg: 'ES256', use: 'sig',
        jdx: { issuer: { id: 'jupiter', name: 'Jupiter' }, status: 'pending',
               activeAt: '2028-09-30T00:00:00-03:00', expiresAt: '2030-09-30T00:00:00-03:00', scope: structuredClone(scope) } },
    ],
    trustAnchors: { esignatureRoots: ['4a4d23ddfbfedeca930078ec30fc71b418351230864a925872f87bd85ed08584'] },
  };
}

/** El encabezado protegido de una firma de la lista. */
export const trustHeader = (root: TestRootKey): Record<string, unknown> => ({ alg: 'ES256', kid: root.kid, typ: 'vnd.jupiter.jdx-trust+jws' });

/** Una firma: una raíz, o una raíz con otro encabezado o alterada. */
export type TestSigner = TestRootKey | { key: TestRootKey; header?: Record<string, unknown>; tamper?: boolean };

const b64 = (bytes: Uint8Array | string): string => Buffer.from(bytes).toString('base64url');

/** El JWS JSON general de la lista firmado por cada raíz, en bytes; el payload es la lista como JSON o los bytes dados. */
export function signTestTrustList(payload: TrustList | Uint8Array, signers: readonly TestSigner[]): Uint8Array {
  const body = b64(payload instanceof Uint8Array ? payload : JSON.stringify(payload));
  const signatures = signers.map((signer) => {
    const root = 'key' in signer ? signer.key : signer;
    const header = 'key' in signer && signer.header !== undefined ? signer.header : trustHeader(root);
    const protectedHeader = b64(JSON.stringify(header));
    const privateJwk = { kty: root.kty, crv: root.crv, x: root.x, y: root.y, d: root.d };
    const raw = sign('sha256', Buffer.from(`${protectedHeader}.${body}`), { key: privateJwk, format: 'jwk', dsaEncoding: 'ieee-p1363' });
    if ('key' in signer && signer.tamper === true) raw[0] = (raw[0] ?? 0) ^ 0xff;
    return { protected: protectedHeader, signature: b64(raw) };
  });
  return new TextEncoder().encode(JSON.stringify({ payload: body, signatures }));
}
