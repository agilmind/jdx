/**
 * El .jws de una declaración, leído contra su archivo (src/signature/jws.ts):
 * un JWS compacto con el contenido separado, `encabezado..firma`. Da el
 * encabezado, la entrada firmada y la firma, o la primera razón por la que no
 * sirve, en el orden alg, header y payload. La firma misma no se verifica acá.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type DeclarationFacts, MAX_JWS_LENGTH, parseDeclarationJws } from '../../../src/signature/jws.js';
import { exampleText } from '../../helpers/docBuilder.js';

const BYTES = new TextEncoder().encode(exampleText());
const SHA = createHash('sha256').update(BYTES).digest('hex');
const KID = '3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E';
const OTHER_KID = 'RMTKb5VZHzluQgQFEqtNEGvJvO8vzw_P4hBhZBfyQE8';
const FACTS: DeclarationFacts = { bytes: BYTES, declarationId: '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13', revision: 1, sha256: SHA, keyId: KID, env: 'sandbox' };
const RAW_SIGNATURE = new Uint8Array(64).fill(7);

const b64 = (value: string | Uint8Array): string => Buffer.from(value).toString('base64url');
type Header = Record<string, any>;

/** El encabezado que corresponde al ejemplo en sandbox, con los cambios dados. */
function header(change: (h: Header) => void = () => {}): Header {
  const h: Header = {
    alg: 'ES256', kid: KID, typ: 'vnd.jupiter.jdx+jws', cty: 'vnd.jupiter.jdx+json',
    jdx: { declarationId: FACTS.declarationId, revision: 1, issuedAt: '2026-09-12T19:00:00-03:00', sha256: SHA, size: BYTES.length, env: 'sandbox', aud: ['061'] },
  };
  change(h);
  return h;
}

/** Un .jws compacto: el encabezado (objeto o texto JSON), el contenido (vacío si es separado) y la firma. */
const compact = (h: Header | string, payload = '', signature = b64(RAW_SIGNATURE)): string =>
  `${b64(typeof h === 'string' ? h : JSON.stringify(h))}.${payload}.${signature}`;

/** La razón por la que no sirve, o null si se lee. */
function reason(jws: string, facts: DeclarationFacts = FACTS): string | null {
  const parsed = parseDeclarationJws(jws, facts);
  return parsed.ok ? null : parsed.reason;
}

describe('parseDeclarationJws', () => {
  it('parses header..signature', () => {
    // El encabezado tal como vino (con espacios): la entrada firmada usa ese texto, no uno rearmado.
    const text = JSON.stringify(header(), null, 1);
    const parsed = parseDeclarationJws(compact(text), FACTS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.header).toEqual({ alg: 'ES256', kid: KID, typ: 'vnd.jupiter.jdx+jws', jdx: header().jdx });
    expect(new TextDecoder().decode(parsed.signingInput)).toBe(`${b64(text)}.${b64(BYTES)}`);
    expect(parsed.signature).toEqual(RAW_SIGNATURE);
  });

  it('non-empty payload → payload', () => {
    expect(reason(compact(header(), b64(BYTES)))).toBe('payload');
    expect(reason(compact(header(), 'AA'))).toBe('payload');
  });

  it('alg none → alg', () => {
    expect(reason(compact(header((h) => { h.alg = 'none'; })))).toBe('alg');
    expect(reason(compact(header((h) => { delete h.alg; })))).toBe('alg');
    expect(reason(compact(header((h) => { h.alg = 'es256'; })))).toBe('alg');
    expect(reason(compact(header((h) => { h.alg = ['ES256']; })))).toBe('alg');
  });

  it('alg HS256 → alg', () => {
    expect(reason(compact(header((h) => { h.alg = 'HS256'; })))).toBe('alg');
    expect(reason(compact(header((h) => { h.alg = 'ES384'; })))).toBe('alg');
  });

  it('other typ → header', () => {
    for (const typ of ['JWT', 'vnd.jupiter.jdx-trust+jws', 'application/vnd.jupiter.jdx+jws', 'VND.JUPITER.JDX+JWS', 'vnd.jupiter.jdx+jws ']) {
      expect(reason(compact(header((h) => { h.typ = typ; }))), typ).toBe('header');
    }
    expect(reason(compact(header((h) => { delete h.typ; })))).toBe('header');
  });

  it('jwk, jku, x5u, x5c or crit → header (each)', () => {
    const injected: Header = {
      jwk: { kty: 'EC', crv: 'P-256', x: 'tNoY2fMd0GIr3JfaozCgdYKK9v28CECvJHwhWan7KLs', y: 'CVhCPRKE4hebYSX-FDUqwp2-o7Y_YHoHSOBAYhLrPIw' },
      jku: 'https://example.com/keys.json',
      x5u: 'https://example.com/cert.pem',
      x5c: ['MIIBszCCAVmgAwIBAgIUXrJ7'],
      crit: ['exp'],
    };
    for (const [member, value] of Object.entries(injected)) {
      expect(reason(compact(header((h) => { h[member] = value; }))), member).toBe('header');
    }
  });

  it('b64 present → header', () => {
    expect(reason(compact(header((h) => { h.b64 = true; })))).toBe('header');
    expect(reason(compact(header((h) => { h.b64 = false; h.crit = ['b64']; })))).toBe('header');
  });

  it('kid differs from issuer.keyId → header', () => {
    expect(reason(compact(header((h) => { h.kid = OTHER_KID; })))).toBe('header');
    expect(reason(compact(header((h) => { delete h.kid; })))).toBe('header');
    expect(reason(compact(header((h) => { h.kid = 7; })))).toBe('header');
    // El kid se compara exacto: con otras mayúsculas o un espacio, no es el del archivo.
    expect(reason(compact(header((h) => { h.kid = KID.toLowerCase(); })))).toBe('header');
    expect(reason(compact(header((h) => { h.kid = `${KID} `; })))).toBe('header');
  });

  it('jdx.env differs from --env → header', () => {
    expect(reason(compact(header((h) => { h.jdx.env = 'production'; })))).toBe('header');
    expect(reason(compact(header()), { ...FACTS, env: 'production' })).toBe('header');
    expect(reason(compact(header((h) => { h.jdx.env = 'prod'; })))).toBe('header');
  });

  it('missing jdx → header', () => {
    expect(reason(compact(header((h) => { delete h.jdx; })))).toBe('header');
    for (const jdx of [null, [], 'jdx', 1]) expect(reason(compact(header((h) => { h.jdx = jdx; }))), JSON.stringify(jdx)).toBe('header');
    for (const member of ['declarationId', 'revision', 'issuedAt', 'sha256', 'size', 'env', 'aud']) {
      expect(reason(compact(header((h) => { delete h.jdx[member]; }))), member).toBe('header');
    }
  });

  it('declarationId, revision, sha256 or size mismatch → payload (each)', () => {
    expect(reason(compact(header((h) => { h.jdx.declarationId = '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a14'; })))).toBe('payload');
    expect(reason(compact(header((h) => { h.jdx.declarationId = FACTS.declarationId.toUpperCase(); })))).toBe('payload');
    expect(reason(compact(header((h) => { h.jdx.revision = 2; })))).toBe('payload');
    expect(reason(compact(header((h) => { h.jdx.sha256 = `${SHA.slice(0, -1)}0`; })))).toBe('payload');
    expect(reason(compact(header((h) => { h.jdx.sha256 = SHA.toUpperCase(); })))).toBe('payload');
    expect(reason(compact(header((h) => { h.jdx.size = BYTES.length + 1; })))).toBe('payload');
    // El tamaño es el de los bytes que llegaron.
    expect(reason(compact(header()), { ...FACTS, bytes: BYTES.slice(1) })).toBe('payload');
  });

  it('malformed compact → header', () => {
    const good = compact(header());
    const [h, , s] = good.split('.') as [string, string, string];
    const malformed = [
      '', 'abc', `${h}.${s}`, `${good}.`, `${h}...${s}`, `.${''}.${s}`, `${h}..`, `${h}=..${s}`, `${h}..${s}=`, `${good}\n`, ` ${good}`,
      `+${h.slice(1)}..${s}`, `${h}..${s.slice(0, -1)}+`, `${h}.a b.${s}`, `${h}.é.${s}`,
      // Los bits que sobran del último carácter de la firma, en 1: otro texto para los mismos bytes.
      `${h}..${s.slice(0, -1)}${String.fromCharCode(s.charCodeAt(s.length - 1) + 1)}`,
    ];
    for (const jws of malformed) expect(reason(jws), JSON.stringify(jws.slice(0, 40))).toBe('header');
    // El encabezado no es un objeto I-JSON.
    for (const text of ['no es JSON', '[]', '"ES256"', '{"alg":"ES256",}', '﻿{"alg":"ES256"}', '{"alg":"ES256","alg":"ES256"}']) {
      expect(reason(compact(text)), text).toBe('header');
    }
    expect(reason(42 as unknown as string)).toBe('header');
  });

  it('cty is not enforced', () => {
    for (const change of [(h: Header) => { delete h.cty; }, (h: Header) => { h.cty = 'JWT'; }, (h: Header) => { h.cty = 42; }]) {
      expect(reason(compact(header(change)))).toBeNull();
    }
    // Ni los miembros que JDX no usa, adentro o afuera de jdx: no se devuelven.
    const parsed = parseDeclarationJws(compact(header((h) => { h.x5t = 'abc'; h.jdx.note = 'otra'; })), FACTS);
    expect(parsed.ok && parsed.header).toEqual({ alg: 'ES256', kid: KID, typ: 'vnd.jupiter.jdx+jws', jdx: header().jdx });
  });

  it('a member of the header given twice is a header that cannot be read, never the last value', () => {
    // JSON.parse se quedaría con el último alg; el parser de JDX no lee un objeto con una clave repetida.
    const text = JSON.stringify(header()).replace('"alg":"ES256"', '"alg":"none","alg":"ES256"');
    expect(reason(compact(text))).toBe('header');
    const kids = JSON.stringify(header()).replace(`"kid":"${KID}"`, `"kid":"${OTHER_KID}","kid":"${KID}"`);
    expect(reason(compact(kids))).toBe('header');
  });

  it('each member of jdx has its type: another type → header, another value → payload', () => {
    const wrongType: [string, unknown][] = [
      ['declarationId', 1], ['revision', '1'], ['revision', 1.5], ['issuedAt', 1], ['issuedAt', '2026-09-12'],
      ['issuedAt', '2026-02-30T19:00:00-03:00'], ['sha256', null], ['size', '48213'], ['size', 1.5], ['env', null],
      ['aud', '061'], ['aud', [61]], ['aud', [['061']]],
    ];
    for (const [member, value] of wrongType) {
      expect(reason(compact(header((h) => { h.jdx[member] = value; }))), `${member} ${JSON.stringify(value)}`).toBe('header');
    }
    // Un entero fuera de ±(2^53 - 1) no es I-JSON: el encabezado no se lee.
    expect(reason(compact(JSON.stringify(header()).replace('"revision":1', '"revision":9007199254740993')))).toBe('header');
  });

  it('the first failure wins, in the order alg, header, payload', () => {
    const all = (h: Header) => { h.alg = 'none'; h.jwk = {}; h.jdx.revision = 9; };
    expect(reason(compact(header(all), 'AA'))).toBe('alg');
    expect(reason(compact(header((h) => { h.jwk = {}; h.jdx.revision = 9; }), 'AA'))).toBe('header');
    // Lo que se compara con el archivo y es del encabezado va antes que el contenido.
    expect(reason(compact(header((h) => { h.kid = OTHER_KID; }), 'AA'))).toBe('header');
    expect(reason(compact(header((h) => { h.jdx.env = 'production'; h.jdx.sha256 = '0'.repeat(64); })))).toBe('header');
    expect(reason(compact(header((h) => { h.jdx.sha256 = '0'.repeat(64); }), 'AA'))).toBe('payload');
    // Un .jws que no se puede leer no tiene alg que mirar.
    expect(reason(`${compact(header((h) => { h.alg = 'none'; }))}.`)).toBe('header');
  });

  it('a .jws longer than MAX_JWS_LENGTH is not read: header', () => {
    expect(MAX_JWS_LENGTH).toBe(2 * 1024 * 1024);
    // Hasta el tope se lee; uno más, aunque sea válido en todo lo demás, no.
    const good = compact(header());
    // Un miembro de relleno que JDX no usa, para llegar justo al tope: el encabezado, de 3/4 de lo que le queda en bytes.
    const headerChars = MAX_JWS_LENGTH - 2 - b64(RAW_SIGNATURE).length;
    const room = (headerChars * 3) / 4 - Buffer.byteLength(JSON.stringify(header((h) => { h.pad = ''; })));
    const atCap = compact(header((h) => { h.pad = 'p'.repeat(room); }));
    expect(atCap.length).toBe(MAX_JWS_LENGTH);
    expect(reason(atCap)).toBeNull();
    expect(reason(`${good}${'A'.repeat(MAX_JWS_LENGTH)}`)).toBe('header');
    const started = performance.now();
    expect(reason('A'.repeat(64 * 1024 * 1024))).toBe('header');
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('hostile .jws within 2 MiB are read in linear time and give their reason', () => {
    const MiB2 = 2 * 1024 * 1024;
    const started = performance.now();
    // Un kid de casi 1,5 MiB (el .jws, debajo del tope): el encabezado se lee una vez y el kid no es el del archivo.
    const kidJws = compact(header((h) => { h.kid = 'k'.repeat(1.5 * 1024 * 1024 - 4096); }));
    expect(kidJws.length).toBeLessThanOrEqual(MAX_JWS_LENGTH);
    expect(reason(kidJws)).toBe('header');
    // Un aud de 250 000 códigos: se lee y se copia una vez.
    const crowded = parseDeclarationJws(compact(header((h) => { h.jdx.aud = Array.from({ length: 250_000 }, (_, i) => String(i % 1000).padStart(3, '0')); })), FACTS);
    expect(crowded.ok && crowded.header.jdx.aud.length).toBe(250_000);
    // jdx anidado más hondo que lo que lee el parser.
    expect(reason(compact(header((h) => { h.jdx.aud = JSON.parse(`${'['.repeat(200)}${']'.repeat(200)}`); })))).toBe('header');
    // 2 MiB de puntos, o de un carácter que no es base64url.
    expect(reason('.'.repeat(MiB2))).toBe('header');
    expect(reason(`${'A'.repeat(MiB2 - 100)}..${b64(RAW_SIGNATURE)}`)).toBe('header');
    expect(reason(`${compact(header()).split('.')[0]}.${'*'.repeat(MiB2 - 1000)}.${b64(RAW_SIGNATURE)}`)).toBe('header');
    // Un contenido de casi 2 MiB dentro del .jws: no se decodifica.
    expect(reason(compact(header(), 'A'.repeat(MiB2 - 1000)))).toBe('payload');
    // Una firma de casi 1,5 MiB: se lee (no verifica, pero eso no es de este paso).
    const longSignature = parseDeclarationJws(compact(header(), '', b64(new Uint8Array(1.5 * 1024 * 1024 - 4096))), FACTS);
    expect(longSignature.ok && longSignature.signature.length).toBe(1.5 * 1024 * 1024 - 4096);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});
