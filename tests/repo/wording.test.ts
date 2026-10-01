/**
 * Redacción del LICENSE, de las descripciones generales de JDX y del sitio.
 * - El LICENSE es el de JDX: autoría de Agilmind SRL, uso libre para leer y
 *   probar, la cláusula de las Sociedades de Gestión Colectiva (SGC) y la
 *   autorización escrita para lo demás. README y NOTICE remiten a él, y
 *   package.json lo nombra en `license`.
 * - LICENSE, README, NOTICE, SECURITY, CONTRIBUTING y la `description` del
 *   paquete no nombran a SADAIC.
 * - La certificación se llama "Jupiter Certified" en todo el repositorio.
 * - Las páginas bajo site/ no hablan de licencias, salvo la línea del pie.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { lineHits, planter } from '../helpers/files.js';
import {
  generalDescriptions,
  licensingHits,
  sadaicHits,
  SITE_FOOTER_TEXT,
  SITE_FOOTER_URL,
  siteHits,
  siteTexts,
} from '../helpers/wording.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
/** El texto con los espacios y saltos de línea colapsados. */
const flat = (text: string) => text.replace(/\s+/g, ' ');

const trees = planter('jdx-wording-');
afterEach(() => trees.cleanup());

const FOOTER = `<footer>© 2026 Agilmind SRL · <a href="${SITE_FOOTER_URL}">Especificación, código y condiciones de uso en GitHub</a></footer>`;

describe('wording', () => {
  it('LICENSE is the JDX licence, with the SGC clause', () => {
    const license = flat(read('LICENSE'));
    for (const part of [
      'Licencia de JDX (Jupiter Data eXchange)',
      'Copyright © 2026 Agilmind SRL',
      'Identificador SPDX: LicenseRef-Agilmind-JDX',
      'JDX fue creado por Agilmind SRL.',
      'Cualquier persona puede leer, descargar y estudiar JDX',
      'Requiere autorización previa y por escrito de Agilmind SRL',
      'Las SGC pueden usar JDX para recibir, validar y cargar declaraciones sin necesidad de autorización.',
      '"Jupiter" y "Jupiter Certified" son signos de Agilmind SRL',
      'THIRD-PARTY-NOTICES',
    ]) {
      expect(license, part).toContain(part);
    }
  });

  it('NOTICE is short, names Agilmind SRL and points to LICENSE and THIRD-PARTY-NOTICES', () => {
    const notice = read('NOTICE');
    expect(notice.trimEnd().split('\n').length).toBeLessThanOrEqual(4);
    for (const part of ['Agilmind SRL', 'LICENSE', 'THIRD-PARTY-NOTICES']) expect(notice, part).toContain(part);
  });

  it('README references LICENSE and the contact address', () => {
    expect(read('README.md')).toContain('[LICENSE](LICENSE)');
    expect(read('README.md')).toContain('jdx@jupiter.ar');
  });

  it('package.json license is "SEE LICENSE IN LICENSE"', () => {
    expect(JSON.parse(read('package.json')).license).toBe('SEE LICENSE IN LICENSE');
  });

  it('the general descriptions do not name SADAIC', () => {
    // La guarda lee esas fuentes y nada más.
    const planted = trees.plant({
      LICENSE: 'Autorización para SADAIC.',
      'README.md': 'Para Sadaic y sus socios.',
      NOTICE: 'sadaic',
      'SECURITY.md': 'Informar a SADAIC.',
      'CONTRIBUTING.md': 'Issues de SADAIC.',
      'package.json': JSON.stringify({ description: 'Validador para SADAIC.', keywords: ['SADAIC'] }),
      'docs/guia.md': 'El perfil de SADAIC.',
    });
    const flagged = generalDescriptions(planted).filter((t) => sadaicHits(t.text).length > 0);
    expect(flagged.map((t) => t.source)).toEqual(['LICENSE', 'README.md', 'NOTICE', 'SECURITY.md', 'CONTRIBUTING.md', 'package.json#description']);

    // El repositorio: todas existen y ninguna nombra a SADAIC.
    const texts = generalDescriptions(ROOT);
    expect(texts.map((t) => t.source)).toEqual(['LICENSE', 'README.md', 'NOTICE', 'SECURITY.md', 'CONTRIBUTING.md', 'package.json#description']);
    expect(texts.flatMap((t) => sadaicHits(t.text).map((hit) => `${t.source}: ${hit}`))).toEqual([]);
  });

  it('technical ids of the first profile do not name SADAIC', () => {
    const ids = [
      '--profile sadaic/0.1 (profiles/sadaic/0.1.0.json)',
      'values/sadaic-genres.json, values/sadaic-art8.json y values/sadaic-contract.json',
      'la guía sadaic-0.1.md, schema/src/sadaic-generos-2006.txt y el esquema SADAIC_GENRE',
      '"scope": { "profiles": ["https://jdx.jupiter.ar/profiles/sadaic"] } y la clave de extensión ar.sadaic.x',
    ];
    expect(sadaicHits(ids.join('\n'))).toEqual([]);
    expect(sadaicHits('El perfil de SADAIC (sadaic/0.1).')).toEqual(['SADAIC']);
    // La lista es cerrada: otro `/` u otro `-` detrás, en prosa, sí nombra a SADAIC.
    expect(sadaicHits('Convenio SADAIC/AADI, para SADAIC-Argentina y la Sadaic/ y otras.')).toEqual(['SADAIC', 'SADAIC', 'Sadaic']);
    // Un dominio también la nombra, y la familia del perfil con otro `/` detrás.
    expect(sadaicHits('Ver www.sadaic.org.ar y profiles/sadaic/AADI.')).toEqual(['sadaic', 'sadaic']);
  });

  it('the certification is called Jupiter Certified everywhere', () => {
    const other = /\bJDX\s+Certified\b/iu;
    expect(lineHits(ROOT, (line) => other.test(line))).toEqual([]);
    expect(read('LICENSE')).toContain('Jupiter Certified');
    const planted = trees.plant({ 'a.md': 'Jupiter Certified.\nJDX  Certified.' });
    expect(lineHits(planted, (line) => other.test(line))).toEqual(['a.md:2']);
  });

  it('site pages carry only the footer line about terms of use', () => {
    // Sin site/ no hay nada que revisar; el repositorio todavía no tiene sitio.
    expect(siteTexts(trees.plant({ 'README.md': 'Licencia' }))).toEqual([]);
    expect(siteHits(ROOT)).toEqual([]);

    const site = trees.plant({
      'site/index.html': `<main><p>JDX</p></main>${FOOTER}`,
      'site/otra.html': `<p>Uso con licencia.</p>${FOOTER}`,
      'site/sin-pie.html': '<p>JDX</p>',
      'site/dos-pies.html': `${FOOTER}${FOOTER}`,
      'site/otro-enlace.html': `<footer>© 2026 Agilmind SRL · <a href="https://example.com">Especificación, código y condiciones de uso en GitHub</a></footer>`,
      'site/LICENSE': 'texto',
      'site/schema/1.0/jdx.schema.json': read('schema/1.0/jdx.schema.json'),
      'site/trust/roots.txt': 'production 3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E',
      // Un dato codificado no es texto: las letras de un payload o de una firma no cuentan.
      'site/trust/keys.json': '{ "role": "licensor", "payload": "eyJ0eXAiOiJqZHgtdHJ1c3QiLicenSe7Qm2vX9pZt4Kw" }',
    });
    expect(siteHits(site)).toEqual([
      'site/LICENSE: archivo de licencia o de avisos',
      'site/dos-pies.html: 2 pies de página',
      'site/otra.html: licencia',
      'site/otro-enlace.html: el pie enlaza https://example.com',
      'site/sin-pie.html: 0 pies de página',
    ]);
    expect(SITE_FOOTER_TEXT).toBe('© 2026 Agilmind SRL · Especificación, código y condiciones de uso en GitHub');
  });

  it('licensing words: producer roles and "certificador licenciado" pass, other forms fail', () => {
    const table = '| `role` | cerrada: original, licensor, licensee | no | |';
    expect(licensingHits(table)).toEqual([]);
    expect(licensingHits('Firma con CA propia, no de un certificador licenciado: para la Ley 25.506 es firma electrónica.')).toEqual([]);
    expect(licensingHits('O arquivo não precisa de licença.')).toEqual(['licença']);
  });
});
