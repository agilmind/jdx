/**
 * Índice de punteros de la menor (schema/1.0/index.json, generateIndex) y
 * sitesAt: los lugares que las reglas buscan por puntero (x-jdx-ref y
 * x-jdx-ref-type para REF-002/003; las listas abiertas para VER-004; NUM-001;
 * NUM-002) y los datos personales: los que lo son siempre y, con su condición, los
 * objetos que lo son según una de sus propiedades.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateIndex } from '../../../src/schema/generate.js';
import { loadModel } from '../../../src/schema/model.js';
import { sitesAt } from '../../../src/schema/sites.js';
import type { PersonalDataWhenSite, RefSite, SchemaIndex } from '../../../src/types.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string): string => readFileSync(`${ROOT}${rel}`, 'utf8');
const MODEL = loadModel(JSON.parse(read('schema/src/types.json')), JSON.parse(read('schema/src/types.overlay.json')));
const INDEX = JSON.parse(read('schema/1.0/index.json')) as SchemaIndex;

type Sub = { [k: string]: unknown };

/**
 * Recorre un schema del documento desde la raíz por `$ref`, `properties` e
 * `items` (sin pasar por el modelo), con el patrón de puntero de cada subschema.
 */
function walkSchema(schema: { $defs: Record<string, Sub> }, visit: (sub: Sub, pointer: string) => void): void {
  const walk = (sub: Sub, pointer: string): void => {
    if (typeof sub.$ref === 'string') {
      const target = schema.$defs[sub.$ref.replace('#/$defs/', '')];
      if (target !== undefined) walk(target, pointer);
    }
    visit(sub, pointer);
    for (const [prop, child] of Object.entries((sub.properties ?? {}) as Record<string, unknown>)) {
      if (typeof child === 'object' && child !== null) walk(child as Sub, `${pointer}/${prop}`);
    }
    if (typeof sub.items === 'object' && sub.items !== null) walk(sub.items as Sub, `${pointer}/*`);
  };
  walk(schema as unknown as Sub, '');
}

/** Los x-jdx-ref de un schema del documento como patrones de puntero. */
function refsInSchema(schema: { $defs: Record<string, Sub> }): RefSite[] {
  const out: RefSite[] = [];
  walkSchema(schema, (sub, pointer) => {
    if (typeof sub['x-jdx-ref'] === 'string') {
      const site: RefSite = { pattern: pointer, list: sub['x-jdx-ref'] as RefSite['list'] };
      if (Array.isArray(sub['x-jdx-ref-type'])) site.refTypes = sub['x-jdx-ref-type'] as string[];
      out.push(site);
    }
  });
  return out;
}

/**
 * Los x-jdx-personal-data de un schema del documento: `true` marca la propiedad;
 * una condición, el objeto que contiene la propiedad.
 */
function personalDataInSchema(schema: { $defs: Record<string, Sub> }): Pick<SchemaIndex, 'personalData' | 'personalDataWhen'> {
  const out: Pick<SchemaIndex, 'personalData' | 'personalDataWhen'> = { personalData: [], personalDataWhen: [] };
  walkSchema(schema, (sub, pointer) => {
    const mark = sub['x-jdx-personal-data'];
    if (mark === true) out.personalData.push(pointer);
    else if (typeof mark === 'object' && mark !== null) {
      const { path, in: values } = mark as { path: string; in: string[] };
      out.personalDataWhen.push({ pattern: pointer.slice(0, pointer.lastIndexOf('/')), path, in: values });
    }
  });
  return out;
}

describe('índice de punteros', () => {
  it('56 concrete ref sites', () => {
    // El archivo es la salida del generador.
    expect(INDEX).toEqual(generateIndex(MODEL, '1.0'));
    expect(INDEX.minor).toBe('1.0');
    expect(INDEX.refs).toHaveLength(56);
    expect(new Set(INDEX.refs.map((r) => r.pattern)).size).toBe(56);
    expect(INDEX.refs.slice(0, 3)).toEqual([
      { pattern: '/declaration/declarant', list: 'parties' },
      { pattern: '/parties/*/names/*/registrations/*/filing', list: 'media', refTypes: ['registrationFiling'] },
      { pattern: '/parties/*/names/*/registrations/*/certificate', list: 'media', refTypes: ['registrationCertificate'] },
    ]);
  });

  it('74 open-list sites over 27 lists', () => {
    expect(INDEX.openLists).toHaveLength(74);
    expect(new Set(INDEX.openLists.map((s) => s.list))).toEqual(new Set(Object.keys(MODEL.source.openLists)));
    for (const site of INDEX.openLists) expect(site.style, site.pattern).toBe(MODEL.source.openLists[site.list]?.style);
    expect(INDEX.openLists.filter((s) => s.list === 'instrumentSchemes').map((s) => s.pattern)).toEqual([
      '/works/*/instrumentation/instruments/*/scheme',
      '/recordings/*/performers/*/instruments/*/scheme',
    ]);
  });

  it('6 percent properties expand to their pointer patterns', () => {
    expect(INDEX.percents).toEqual([
      '/works/*/authorship/*/percent',
      '/works/*/shares/*/percent',
      '/recordings/*/producers/*/percent',
      '/agreements/*/publisherShare/percent',
      '/agreements/*/terms/values/retailPricePercent',
      '/agreements/*/terms/values/arrangementRetailPricePercent',
    ]);
  });

  it('34 date and 3 instant patterns', () => {
    expect(INDEX.dates).toHaveLength(34);
    expect(new Set(INDEX.dates).size).toBe(34);
    expect(INDEX.dates).toEqual(expect.arrayContaining(['/parties/*/birthDate', '/agreements/*/signatureDate', '/edition/publicationDate']));
    expect(INDEX.instants).toEqual([
      '/declaration/createdAt',
      '/media/*/evidence/esignature/timestamp/generatedAt',
      '/media/*/evidence/signers/*/signedAt',
    ]);
  });

  it('every x-jdx-ref in the open and strict schemas has an index entry and vice versa', () => {
    const key = (r: RefSite) => JSON.stringify([r.pattern, r.list, r.refTypes ?? null]);
    const fromIndex = INDEX.refs.map(key).sort();
    for (const file of ['schema/1.0/jdx.schema.json', 'schema/1.0/jdx.strict.schema.json']) {
      expect(refsInSchema(JSON.parse(read(file))).map(key).sort(), file).toEqual(fromIndex);
    }
  });

  it('site of /works/0/shares/2/agreement is agreements with its five refTypes', () => {
    expect(sitesAt(INDEX, '/works/0/shares/2/agreement')).toEqual({
      ref: {
        pattern: '/works/*/shares/*/agreement',
        list: 'agreements',
        refTypes: ['publishing', 'subPublishing', 'administration', 'assignment', 'writerSplit'],
      },
      openList: null,
      percent: false,
      date: false,
      instant: false,
      personalData: false,
      personalDataWhen: null,
    });
  });

  it('personal-data patterns include /parties/*/address', () => {
    expect(INDEX.personalData).toEqual([
      '/parties/*/gender',
      '/parties/*/birthDate',
      '/parties/*/deathDate',
      '/parties/*/nationality',
      '/parties/*/maritalStatus',
      '/parties/*/address',
      '/parties/*/contact',
      '/parties/*/contact/email',
      '/parties/*/contact/phone',
    ]);
    // Los nombres legales y los identificadores TAX_ID y NATIONAL_ID: el objeto, en cada lugar donde se usa su tipo, con su condición.
    expect(INDEX.personalDataWhen.filter((s) => s.path === 'type')).toEqual(
      [
        '/parties/*/names/*',
        '/works/*/version/original/external/writers/*/names/*',
        '/works/*/composite/components/*/external/writers/*/names/*',
        '/works/*/excerptOf/external/writers/*/names/*',
      ].map((pattern) => ({ pattern, path: 'type', in: ['legal'] })),
    );
    const identifiers = INDEX.personalDataWhen.filter((s) => s.path === 'scheme');
    expect(identifiers).toHaveLength(15);
    for (const site of identifiers) {
      expect(site, site.pattern).toEqual({ pattern: expect.stringMatching(/\/identifiers\/\*$/), path: 'scheme', in: ['TAX_ID', 'NATIONAL_ID'] });
    }
    expect(INDEX.personalDataWhen).toHaveLength(19);
    expect(sitesAt(INDEX, '/parties/3/birthDate')).toMatchObject({ date: true, personalData: true });
  });

  it('every x-jdx-personal-data in the open and strict schemas has an index entry and vice versa', () => {
    const sorted = (sites: Pick<SchemaIndex, 'personalData' | 'personalDataWhen'>) => ({
      personalData: [...sites.personalData].sort(),
      personalDataWhen: sites.personalDataWhen.map((s) => JSON.stringify([s.pattern, s.path, s.in])).sort(),
    });
    for (const file of ['schema/1.0/jdx.schema.json', 'schema/1.0/jdx.strict.schema.json']) {
      expect(sorted(personalDataInSchema(JSON.parse(read(file)))), file).toEqual(sorted(INDEX));
    }
  });

  it('conditional personal data marks the containing object: /parties/*/identifiers/*/value', () => {
    const taxIds: PersonalDataWhenSite = { pattern: '/parties/*/identifiers/*', path: 'scheme', in: ['TAX_ID', 'NATIONAL_ID'] };
    // El número de un identificador TAX_ID es dato personal: el índice da el objeto y su condición, que se
    // evalúa contra el documento (el scheme del identificador).
    for (const pointer of ['/parties/0/identifiers/1', '/parties/0/identifiers/1/value', '/parties/0/identifiers/1/scheme']) {
      expect(sitesAt(INDEX, pointer), pointer).toMatchObject({ personalData: false, personalDataWhen: taxIds });
    }
    expect(sitesAt(INDEX, '/parties/0/identifiers').personalDataWhen).toBeNull();
    for (const pointer of ['/parties/0/names/0/given', '/parties/0/names/0/family', '/parties/0/names/0/full']) {
      expect(sitesAt(INDEX, pointer).personalDataWhen, pointer).toEqual({ pattern: '/parties/*/names/*', path: 'type', in: ['legal'] });
    }
    // Un ISWC también es un Identifier: la condición dice que no es dato personal.
    expect(sitesAt(INDEX, '/works/0/identifiers/0/value').personalDataWhen).toEqual({ ...taxIds, pattern: '/works/*/identifiers/*' });
    // Lo que está dentro de un dato personal también lo es.
    expect(sitesAt(INDEX, '/parties/0/address/street')).toMatchObject({ personalData: true, personalDataWhen: null });
    expect(sitesAt(INDEX, '/parties/0/contact/email').personalData).toBe(true);
  });

  it('a media with personal data is flagged by its own personalData, not by the index', () => {
    // Lo personal es el archivo, no su registro en el documento: types.json no marca dato personal en Media, y
    // quien reparta archivos lee el personalData de cada media.
    const spec = MODEL.source.types.Media?.props.personalData;
    expect(spec?.type).toEqual({ scalar: 'boolean' });
    expect(spec?.required).toBe(false);
    expect(spec).not.toHaveProperty('personalData');
    const open = JSON.parse(read('schema/1.0/jdx.schema.json')) as { $defs: Record<string, { properties: Sub }> };
    expect(open.$defs.Media?.properties.personalData).toEqual({ type: 'boolean' });
    for (const pointer of ['/media/0', '/media/0/personalData', '/media/0/path']) {
      expect(sitesAt(INDEX, pointer), pointer).toMatchObject({ personalData: false, personalDataWhen: null });
    }
    expect([...INDEX.personalData, ...INDEX.personalDataWhen.map((s) => s.pattern)].filter((p) => p.startsWith('/media'))).toEqual([]);
  });

  it('sitesAt returns nulls outside any site', () => {
    const none = { ref: null, openList: null, percent: false, date: false, instant: false, personalData: false, personalDataWhen: null };
    for (const pointer of ['', '/works/0/titles/0/text', '/works/0', '/extensions/ar.jupiter.x/0', '/works/0/shares/2/agreement/x']) {
      expect(sitesAt(INDEX, pointer), pointer).toEqual(none);
    }
    expect(sitesAt(INDEX, '/works/1/shares/0/percent')).toEqual({ ...none, percent: true });
    expect(sitesAt(INDEX, '/media/0/kind').openList).toEqual({ pattern: '/media/*/kind', list: 'mediaKinds', style: 'enum' });
    expect(sitesAt(INDEX, '/recordings/0/works/1').ref).toEqual({ pattern: '/recordings/*/works/*', list: 'works' });
    expect(sitesAt(INDEX, '/declaration/createdAt')).toEqual({ ...none, instant: true });
  });
});
