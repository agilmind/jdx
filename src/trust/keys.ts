/**
 * Las claves públicas P-256 de la confianza y el archivo de raíces, sin datos
 * generados: `npm run gen` usa este módulo para escribir src/generated/roots.ts,
 * así que no puede depender de lo que genera.
 *
 * - Una clave es `{ kty: "EC", crv: "P-256", x, y }`, con coordenadas de 32
 *   bytes en base64url que forman un punto de la curva.
 * - El kid de una raíz o de una clave de emisor es su huella RFC 7638.
 * - trust/roots.json trae las raíces de cada entorno, tres por entorno. Una
 *   raíz no puede estar dos veces ni en los dos entornos. La imagen de un
 *   entorno se queda solo con las suyas (filterRoots).
 */
import { createHash, createPublicKey } from 'node:crypto';
import type { EcPublicJwk, Env, JsonValue, PinnedRoots, RootKey } from '../types.js';

const ENVS: readonly Env[] = Object.freeze(['production', 'sandbox']);
const COORDINATE = /^[A-Za-z0-9_-]{43}$/u;

/** La huella RFC 7638 de una clave pública P-256: SHA-256 de `{"crv","kty","x","y"}` en ese orden, en base64url. */
export function ecThumbprint(jwk: EcPublicJwk): string {
  return createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');
}

/** Si x e y son un punto de P-256 (coordenadas de 32 bytes en base64url). */
export function isP256PublicKey(jwk: EcPublicJwk): boolean {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !COORDINATE.test(jwk.x) || !COORDINATE.test(jwk.y)) return false;
  try {
    createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
    return true;
  } catch {
    return false;
  }
}

/** Las raíces de un archivo de raíces (trust/roots.json), controladas y congeladas; lanza si alguna no cumple. */
export function parseRootsFile(json: JsonValue): PinnedRoots {
  const fail = (message: string): never => {
    throw new Error(`raíces fijadas: ${message}`);
  };
  if (!isRecord(json) || !sameKeys(json, ENVS) || !ENVS.every((env) => Array.isArray(json[env]))) {
    fail('tienen que ser { production: [], sandbox: [] }');
  }
  const seen = new Set<string>();
  const out: Record<Env, readonly RootKey[]> = { production: [], sandbox: [] };
  for (const env of ENVS) {
    out[env] = Object.freeze(
      ((json as Record<Env, JsonValue[]>)[env]).map((item, i) => {
        const at = `${env}/${i}`;
        if (!isRecord(item) || !sameKeys(item, ['kty', 'crv', 'x', 'y', 'kid']) || item.kty !== 'EC' || item.crv !== 'P-256' ||
          typeof item.x !== 'string' || typeof item.y !== 'string' || typeof item.kid !== 'string') {
          return fail(`${at}: una raíz es { kty, crv, x, y, kid }, con kty EC y crv P-256`);
        }
        const root: RootKey = Object.freeze({ kty: 'EC', crv: 'P-256', x: item.x, y: item.y, kid: item.kid });
        if (!isP256PublicKey(root)) return fail(`${at}: no es una clave pública P-256`);
        const thumbprint = ecThumbprint(root);
        if (root.kid !== thumbprint) return fail(`${at}: el kid no es la huella RFC 7638 de la clave (${thumbprint})`);
        if (seen.has(root.kid)) return fail(`${at}: raíz repetida (${root.kid})`);
        seen.add(root.kid);
        return root;
      }),
    );
  }
  return Object.freeze(out);
}

/** Las raíces de los entornos dados; los demás quedan sin raíces. */
export function filterRoots(roots: PinnedRoots, envs: readonly Env[]): PinnedRoots {
  return Object.freeze({
    production: envs.includes('production') ? roots.production : Object.freeze([]),
    sandbox: envs.includes('sandbox') ? roots.sandbox : Object.freeze([]),
  });
}

function isRecord(value: unknown): value is { [k: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameKeys(value: { [k: string]: JsonValue }, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
