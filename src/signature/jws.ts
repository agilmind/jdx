/**
 * El .jws de una declaración: un JWS compacto con el contenido separado
 * (RFC 7515, apéndice F), `BASE64URL(encabezado)..BASE64URL(firma)`, que firma
 * `BASE64URL(encabezado) || '.' || BASE64URL(bytes del archivo)`.
 *
 * parseDeclarationJws lo lee contra el archivo y da el encabezado, la entrada
 * firmada y la firma, o la primera razón por la que no sirve, en este orden:
 *
 * 1. header: el .jws tiene más de MAX_JWS_LENGTH caracteres (no se lee), no es
 *    exactamente tres tramos de base64url sin relleno, con el encabezado y la
 *    firma no vacíos y canónicos, o el encabezado no es un objeto I-JSON (un
 *    miembro repetido tampoco: nunca vale el último).
 * 2. alg: `alg` no es exactamente `ES256`.
 * 3. header: `typ` no es exactamente `vnd.jupiter.jdx+jws`; trae `jwk`, `jku`,
 *    `x5u`, `x5c`, `crit` o `b64`; a `kid` o a `jdx` les falta un dato o lo
 *    traen con otro tipo (`issuedAt`, un instante que existe); `kid` no es
 *    `declaration.issuer.keyId`, o `jdx.env` no es el entorno de la validación.
 * 4. payload: el .jws trae el contenido, o `jdx.declarationId`, `revision`,
 *    `sha256` o `size` no son los del archivo.
 *
 * `cty` y los miembros que JDX no usa no se controlan ni se devuelven. La clave
 * nunca sale del encabezado: la da la lista de confianza por `kid`. La firma no
 * se verifica acá. Cada tramo se lee una vez, sin partir el texto: el costo es
 * lineal en el largo del .jws.
 */
import { fromBase64url, isBase64urlText, toBase64url } from '../conventions/base64url.js';
import { parseInstant } from '../conventions/time.js';
import { parseJson } from '../json/parse.js';
import type { DeclarationJwsHeader, Env, JsonValue } from '../types.js';

/** El `typ` del .jws de una declaración. */
export const DECLARATION_JWS_TYP = 'vnd.jupiter.jdx+jws';
/** El largo máximo de un .jws, el mismo tope que el del documento (2 MiB): uno de verdad tiene menos de 1 KiB. */
export const MAX_JWS_LENGTH = 2_097_152;

/** Miembros del encabezado que dan otra clave, otra forma de leer el contenido o extensiones: nunca van. */
const FORBIDDEN = ['jwk', 'jku', 'x5u', 'x5c', 'crit', 'b64'] as const;
const ENVS: readonly Env[] = ['production', 'sandbox'];

/** Lo que el .jws tiene que decir del archivo: sus bytes (y su tamaño), sus datos y el entorno de la validación. */
export interface DeclarationFacts {
  bytes: Uint8Array;
  declarationId: string;
  revision: number;
  sha256: string;
  keyId: string;
  env: Env;
}

/** El encabezado leído: lo que JDX controla, sin `cty`. */
export type ReadDeclarationHeader = Omit<DeclarationJwsHeader, 'cty'>;

export type ParsedDeclarationJws =
  | { ok: true; header: ReadDeclarationHeader; signingInput: Uint8Array; signature: Uint8Array }
  | { ok: false; reason: 'alg' | 'header' | 'payload' };

export function parseDeclarationJws(jws: string, file: DeclarationFacts): ParsedDeclarationJws {
  const fail = (reason: 'alg' | 'header' | 'payload'): ParsedDeclarationJws => ({ ok: false, reason });
  if (typeof jws !== 'string' || jws.length > MAX_JWS_LENGTH) return fail('header');
  // Tres tramos: se buscan los dos puntos sin partir el texto.
  const first = jws.indexOf('.');
  const second = first < 0 ? -1 : jws.indexOf('.', first + 1);
  if (second < 0 || jws.indexOf('.', second + 1) >= 0) return fail('header');
  const protectedText = jws.slice(0, first);
  const payloadText = jws.slice(first + 1, second);
  const signatureText = jws.slice(second + 1);
  if (protectedText === '' || signatureText === '' || !isBase64urlText(payloadText)) return fail('header');
  const headerBytes = fromBase64url(protectedText);
  const signature = fromBase64url(signatureText);
  if (headerBytes === null || signature === null) return fail('header');
  const parsed = parseJson(headerBytes);
  if (!parsed.ok || !isRecord(parsed.json.value)) return fail('header');
  const h = parsed.json.value;

  if (h.alg !== 'ES256') return fail('alg');
  if (h.typ !== DECLARATION_JWS_TYP || FORBIDDEN.some((member) => Object.hasOwn(h, member)) || typeof h.kid !== 'string') return fail('header');
  const jdx = readJdx(h.jdx);
  if (jdx === null || h.kid !== file.keyId || jdx.env !== file.env) return fail('header');

  if (payloadText !== '') return fail('payload');
  if (jdx.declarationId !== file.declarationId || jdx.revision !== file.revision || jdx.sha256 !== file.sha256 || jdx.size !== file.bytes.length) {
    return fail('payload');
  }
  return {
    ok: true,
    header: { alg: 'ES256', kid: h.kid, typ: DECLARATION_JWS_TYP, jdx },
    signingInput: new TextEncoder().encode(`${protectedText}.${toBase64url(file.bytes)}`),
    signature,
  };
}

/** `jdx` con cada dato de su tipo, copiado sin los miembros que JDX no usa; null si falta uno o tiene otro tipo. */
function readJdx(value: JsonValue | undefined): DeclarationJwsHeader['jdx'] | null {
  if (!isRecord(value)) return null;
  const { declarationId, revision, issuedAt, sha256, size, env, aud } = value;
  if (
    typeof declarationId !== 'string' || !isInteger(revision) || typeof issuedAt !== 'string' || parseInstant(issuedAt) === null ||
    typeof sha256 !== 'string' || !isInteger(size) || !ENVS.includes(env as Env) ||
    !Array.isArray(aud) || !aud.every((code) => typeof code === 'string')
  ) {
    return null;
  }
  return { declarationId, revision, issuedAt, sha256, size, env: env as Env, aud: [...(aud as string[])] };
}

function isInteger(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isRecord(value: unknown): value is { [k: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
