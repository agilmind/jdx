/**
 * Lo que el reporte dice del documento: el nombre, el sha256 y el tamaño de
 * los bytes, y lo que se lee del contenido. Con JSON ilegible no se lee nada.
 * declarationId, revision y jdx valen null solo si no cumplen su patrón,
 * aunque el schema falle en otro lugar; el emisor y los media, solo si el
 * schema pasó.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseJson } from '../../../src/json/parse.js';
import { documentFacts } from '../../../src/report/document.js';
import type { ParsedJson, ReportDocument } from '../../../src/types.js';

const NAME = '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json';
const EXAMPLE = readFileSync(new URL(`../../../docs/ejemplo/${NAME}`, import.meta.url));

type Obj = { [k: string]: unknown };

/** Los bytes del ejemplo con un cambio, y su JSON. */
function variant(change: (doc: Obj) => void = () => {}): { bytes: Uint8Array; json: ParsedJson } {
  const doc = JSON.parse(EXAMPLE.toString('utf8')) as Obj;
  change(doc);
  const bytes = new TextEncoder().encode(JSON.stringify(doc, null, 2));
  const parsed = parseJson(bytes);
  if (!parsed.ok) throw new Error('la variante no es JSON');
  return { bytes, json: parsed.json };
}

function facts(change?: (doc: Obj) => void, schemaPassed = true): ReportDocument {
  const { bytes, json } = variant(change);
  return documentFacts({ bytes, fileName: NAME }, json, schemaPassed);
}
const declaration = (doc: Obj) => doc.declaration as Obj;
const media = (doc: Obj) => doc.media as Obj[];

const ISSUER = { id: 'jupiter', name: 'Jupiter' };
const MEDIA = [
  { path: '00034-001-CTTO_2-obras.pdf', delivery: 1, size: 482133, sha256: '5052e13da2537321f8129e83df50a6722ff02084c20d40f488f4a05a5a6fd2c3' },
  { path: 'Chacarera-del-Rancho.mp3', delivery: 1, size: 5234011, sha256: 'ac7dad09e27c23710ca72670f4bef247670177689b6c330b95381724a7e9a69b' },
  { path: '00034-Ejemplar_Chacareras-del-Norte.pdf', delivery: 1, size: 1904332, sha256: 'a6391392ec3c81944dbc6565801fb77cbd5666343f3622fccc41357217d89b45' },
  { path: '00034-DJCT_Chacareras-del-Norte.pdf', delivery: 1, size: 96210, sha256: '5e4586040e7717a473b1b9cc4db10f3b543e27c1845d04c884f6afcca99dfe66' },
  { path: '00034-SADAIC_Chacareras-del-Norte.r1.xlsx', delivery: 1, size: 8123, sha256: '42f460e70de323afc82623f28fce6e97ead6fc045f0d41af6ec90a94dfc3f9bb' },
];

describe('el documento en el reporte', () => {
  it('JSN-001 → every document field read from content is null', () => {
    // El ejemplo leído entero, con el sha256 y el tamaño de sus bytes.
    const parsed = parseJson(EXAMPLE);
    expect(parsed.ok).toBe(true);
    const example = documentFacts({ bytes: EXAMPLE, fileName: NAME }, parsed.ok ? parsed.json : null, true);
    expect(example).toEqual({
      fileName: NAME,
      declarationId: '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13', revision: 1, jdx: '1.0',
      sha256: 'ebe77bbafaa7d8a95de2419ad78150792f412050751f6a3d8e7821c2eac9954a', size: 10329,
      declaredProfiles: ['https://jdx.jupiter.ar/profiles/sadaic/0.1'],
      issuer: ISSUER, media: MEDIA,
    });
    expect(Object.keys(example)).toEqual(['fileName', 'declarationId', 'revision', 'jdx', 'sha256', 'size', 'declaredProfiles', 'issuer', 'media']);
    // Con JSON ilegible (sin valor parcial) no se lee nada del contenido, aunque el texto traiga los datos.
    const broken = new TextEncoder().encode(`${EXAMPLE.toString('utf8')},`);
    expect(parseJson(broken).ok).toBe(false);
    const sha256 = createHash('sha256').update(broken).digest('hex');
    for (const schemaPassed of [false, true]) {
      expect(documentFacts({ bytes: broken, fileName: NAME }, null, schemaPassed)).toEqual({
        fileName: NAME, declarationId: null, revision: null, jdx: null, sha256, size: broken.length,
        declaredProfiles: null, issuer: null, media: null,
      });
    }
    // El nombre va tal como llegó; también con bytes vacíos.
    expect(documentFacts({ bytes: new Uint8Array(), fileName: 'x/vacío.jdx.json' }, null, false)).toMatchObject({
      fileName: 'x/vacío.jdx.json', sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', size: 0,
    });
  });

  it('declarationId null when its pattern fails', () => {
    for (const id of ['3F2C9A1E-5B7D-4C21-9E0A-7D4B2F8C6A13', '3f2c9a1e5b7d4c219e0a7d4b2f8c6a13', '', 42, null]) {
      const doc = facts((d) => {
        declaration(d).id = id;
      }, false);
      expect([doc.declarationId, doc.revision, doc.jdx], String(id)).toEqual([null, 1, '1.0']);
    }
    expect(facts((d) => delete declaration(d).id, false).declarationId).toBeNull();
    expect(facts((d) => delete d.declaration, false)).toMatchObject({ declarationId: null, revision: null, issuer: null });
  });

  it('declaration.issuer missing keeps declarationId and revision', () => {
    // Otro SCH-001 en /declaration no los anula: ack guarda el recibo del rechazo y DEC-003 sigue controlando.
    const doc = facts((d) => delete declaration(d).issuer, false);
    expect(doc).toMatchObject({ declarationId: '3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13', revision: 1, jdx: '1.0', issuer: null, media: null });
  });

  it('revision 0 or "2" → null', () => {
    const revisionOf = (revision: unknown) => facts((d) => {
      declaration(d).revision = revision;
    }, false).revision;
    expect([0, '2', -1, 2.5, true, null].map(revisionOf)).toEqual([null, null, null, null, null, null]);
    expect([1, 2, 9_007_199_254_740_991].map(revisionOf)).toEqual([1, 2, 9_007_199_254_740_991]);
  });

  it('jdx "1" → null', () => {
    const jdxOf = (jdx: unknown) => facts((d) => {
      d.jdx = jdx;
    }, false).jdx;
    expect(['1', '1.0.0', 'v1.0', '', 1].map(jdxOf)).toEqual([null, null, null, null, null]);
    // El patrón M.m, sin mirar si el validador la conoce.
    expect(['1.0', '1.10', '2.0'].map(jdxOf)).toEqual(['1.0', '1.10', '2.0']);
  });

  it('document.issuer only when id and name are valid', () => {
    const issuerOf = (issuer: unknown, schemaPassed = true) => facts((d) => {
      declaration(d).issuer = issuer;
    }, schemaPassed).issuer;
    // id y name, sin keyId.
    expect(issuerOf({ id: 'jupiter', name: 'Jupiter', keyId: '3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E' })).toEqual(ISSUER);
    expect(issuerOf({ id: 'Jupiter', name: 'Jupiter' })).toBeNull();
    expect(issuerOf({ id: 'jupiter', name: 7 })).toBeNull();
    expect(issuerOf({ name: 'Jupiter' })).toBeNull();
    expect(issuerOf('jupiter')).toBeNull();
    // Si el schema no pasó, no se lee, aunque sea válido.
    expect(issuerOf({ id: 'jupiter', name: 'Jupiter' }, false)).toBeNull();
  });

  it('document.media lists delivered media with complete data', () => {
    expect(facts().media).toEqual(MEDIA);
    // Sin delivered false y con los cuatro datos: un anexo que no viaja, o un media sin sha256, no va.
    const some = facts((d) => {
      Object.assign(media(d)[1] as Obj, { delivered: false });
      delete (media(d)[1] as Obj).path;
      delete (media(d)[2] as Obj).sha256;
      Object.assign(media(d)[3] as Obj, { delivered: true });
    });
    expect(some.media).toEqual([MEDIA[0], MEDIA[3], MEDIA[4]]);
    expect(facts((d) => delete d.media).media).toEqual([]);
    // Si el schema no pasó, null.
    expect(facts(undefined, false).media).toBeNull();
  });

  it('declaredProfiles copies profiles[] or is null', () => {
    expect(facts().declaredProfiles).toEqual(['https://jdx.jupiter.ar/profiles/sadaic/0.1']);
    expect(facts((d) => {
      d.profiles = [];
    }).declaredProfiles).toEqual([]);
    expect(facts((d) => delete d.profiles).declaredProfiles).toBeNull();
    expect(facts((d) => {
      d.profiles = ['https://jdx.jupiter.ar/profiles/sadaic/0.1', 3];
    }, false).declaredProfiles).toBeNull();
  });
});
