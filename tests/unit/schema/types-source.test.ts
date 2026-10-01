/**
 * Fuente canónica de los tipos: schema/src/types.json (tipos, campos, listas
 * abiertas y descripciones) y schema/src/types.overlay.json (las 18
 * restricciones, los datos personales condicionales y las traducciones). Los
 * dos cumplen su meta-schema y son coherentes entre sí.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createAjv } from '../../../src/schema/ajv.js';
import { loadModel, TYPES_OVERLAY_SCHEMA, TYPES_SOURCE_SCHEMA } from '../../../src/schema/model.js';
import type { JsonValue, TypeRef, TypesOverlay, TypesSource } from '../../../src/types.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string): string => readFileSync(`${ROOT}${rel}`, 'utf8');
const SOURCE = JSON.parse(read('schema/src/types.json')) as TypesSource;
const OVERLAY = JSON.parse(read('schema/src/types.overlay.json')) as TypesOverlay;

/** Los 80 tipos, en el orden de types.json. */
const TYPES = [
  'Document', 'Declaration', 'Issuer', 'Recipient',
  'Name', 'Identifier', 'Classification', 'Condition', 'StandardContract', 'Territories', 'Address', 'Place',
  'Subdivision', 'Contact', 'Amount', 'Registration', 'WorkRegistration',
  'Party', 'Affiliation', 'LegalRepresentative', 'Successor', 'Representative',
  'Work', 'Title', 'Lyrics', 'FirstPerformance', 'WorkRef', 'External', 'ExternalWriter', 'Version', 'Composite',
  'Component', 'Commission', 'Ai', 'AiElement', 'Instrumentation', 'Instrument', 'Origin',
  'Contributor', 'Authorship', 'Share',
  'Recording', 'IsrcIssuer', 'FirstPublication', 'Producer', 'PLine', 'Release', 'Performer', 'PerformerInstrument',
  'SocietyCategory', 'Participation', 'RecordingContributor', 'Sample', 'ExternalRecording', 'RecordingAi',
  'RecordingAiElement', 'Link',
  'Agreement', 'AgreementParty', 'AgreementParent', 'ExcludedRight', 'Term', 'Renewal', 'PostTermCollection',
  'PublisherShare', 'Terms', 'Template', 'TermValues', 'InvestedAmount', 'Observation',
  'Edition', 'PrintRun', 'Deposit',
  'Media', 'Evidence', 'ESignature', 'Timestamp', 'Signer', 'Annexed', 'Anchor',
];

const leafOf = (ref: TypeRef): TypeRef => ('array' in ref ? leafOf(ref.array) : ref);

/** Cada propiedad de cada lugar del documento, bajando desde Document: puntero concreto (`*` por índice) y hoja. */
function concretePointers(source: TypesSource): { pointer: string; leaf: TypeRef }[] {
  const out: { pointer: string; leaf: TypeRef }[] = [];
  const visit = (typeName: string, prefix: string, path: readonly string[]): void => {
    if (path.includes(typeName)) throw new Error(`ciclo de tipos: ${[...path, typeName].join(' → ')}`);
    for (const [prop, spec] of Object.entries(source.types[typeName]?.props ?? {})) {
      let pointer = `${prefix}/${prop}`;
      let leaf = spec.type;
      while ('array' in leaf) {
        pointer += '/*';
        leaf = leaf.array;
      }
      out.push({ pointer, leaf });
      if ('type' in leaf) visit(leaf.type, pointer, [...path, typeName]);
    }
  };
  visit('Document', '', []);
  return out;
}

describe('schema/src/types.json y types.overlay.json', () => {
  it('types.json conforms to its meta-schema', () => {
    // El archivo del meta-schema es el texto de la constante de src/schema/model.ts.
    expect(read('schema/src/types.schema.json')).toBe(`${JSON.stringify(TYPES_SOURCE_SCHEMA, null, 2)}\n`);
    const validate = createAjv().compile(JSON.parse(read('schema/src/types.schema.json')));
    expect(validate(SOURCE)).toBe(true);
    const type = (props: object) => ({ ...SOURCE, types: { Document: { group: 'g', description: 'd', extensions: false, props } } });
    expect(validate(type({ a: { type: { scalar: 'texto' }, required: true, description: 'd' } }))).toBe(false);
    // Cada campo lleva su descripción, no vacía.
    expect(validate(type({ a: { type: { scalar: 'text' }, required: true } }))).toBe(false);
    expect(validate(type({ a: { type: { scalar: 'text' }, required: true, description: '' } }))).toBe(false);
    expect(validate(type({ a: { type: { scalar: 'text' }, required: true, description: 'd' } }))).toBe(true);
  });

  it('overlay conforms to its meta-schema', () => {
    expect(read('schema/src/types.overlay.schema.json')).toBe(`${JSON.stringify(TYPES_OVERLAY_SCHEMA, null, 2)}\n`);
    const validate = createAjv().compile(JSON.parse(read('schema/src/types.overlay.schema.json')));
    expect(validate(OVERLAY)).toBe(true);
    // Un requiredIf sin `when` no es ninguna de las cuatro formas de restricción.
    const broken = { ...OVERLAY, constraints: [{ id: 'x', kind: 'requiredIf', type: 'Term', props: ['duration'] }] };
    expect(validate(broken)).toBe(false);
    // Las traducciones son de un tipo o de un campo, en pt o en.
    expect(validate({ ...OVERLAY, translations: { Party: { pt: 'Pessoa' }, 'Party.kind': { en: 'Kind' } } })).toBe(true);
    expect(validate({ ...OVERLAY, translations: { 'Party.kind': { fr: 'Genre' } } })).toBe(false);
  });

  it('has the 80 types and 380 properties', () => {
    expect(TYPES).toHaveLength(80);
    expect(Object.keys(SOURCE.types)).toEqual(TYPES);
    expect(Object.values(SOURCE.types).reduce((n, t) => n + Object.keys(t.props).length, 0)).toBe(380);
  });

  it('every type is reachable from Document', () => {
    const reached = new Set(['Document']);
    for (const { leaf } of concretePointers(SOURCE)) if ('type' in leaf) reached.add(leaf.type);
    expect([...reached].sort()).toEqual([...TYPES].sort());
  });

  it('every type and property has a description, and each group is contiguous', () => {
    const groups: string[] = [];
    for (const [name, type] of Object.entries(SOURCE.types)) {
      expect(type.description, name).toMatch(/\S.*\.$/u);
      for (const [prop, spec] of Object.entries(type.props)) expect(spec.description, `${name}.${prop}`).toMatch(/\S.*\.$/u);
      if (groups.at(-1) !== type.group) groups.push(type.group);
    }
    expect(groups).toEqual(['Raíz y declaración', 'Tipos comunes', 'Personas', 'Obras', 'Derechos', 'Grabaciones', 'Contratos', 'Edición', 'Archivos']);
  });

  it('instrumentSchemes is an open list of schemes without initial values', () => {
    expect(SOURCE.openLists.instrumentSchemes).toEqual({ initial: [], style: 'scheme' });
    expect(SOURCE.types.Instrument?.props.scheme?.type).toEqual({ open: 'instrumentSchemes' });
    expect(SOURCE.types.PerformerInstrument?.props.scheme?.type).toEqual({ open: 'instrumentSchemes' });
  });

  it('open-list style follows the values (UPPER_SNAKE → scheme, lowerCamel → enum)', () => {
    expect(Object.keys(SOURCE.openLists)).toHaveLength(27);
    for (const [list, { initial, style }] of Object.entries(SOURCE.openLists)) {
      const expected = initial.length === 0 || initial.every((v) => /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(v)) ? 'scheme' : 'enum';
      expect(style, list).toBe(expected);
      if (style === 'enum') for (const v of initial) expect(v, list).toMatch(/^[a-z][A-Za-z0-9]*$/);
    }
    expect(SOURCE.openLists.identifierSchemes?.style).toBe('scheme');
    expect(SOURCE.openLists.titleTypes?.style).toBe('enum');
  });

  it('enumerations: 108 places with a closed or open list', () => {
    const sites = concretePointers(SOURCE).filter(({ leaf }) => 'closed' in leaf || 'open' in leaf);
    expect(sites).toHaveLength(108);
    // Un tipo que se usa en varios lugares aparece una vez por lugar: los registros, en siete.
    expect(sites.filter(({ pointer }) => pointer.endsWith('/registrations/*/registry'))).toHaveLength(7);
    expect(sites.map(({ pointer }) => pointer)).toContain('/recordings/*/performers/*/instruments/*/scheme');
    // Cada lista abierta la usa algún campo.
    const used = new Set(sites.flatMap(({ leaf }) => ('open' in leaf ? [leaf.open] : [])));
    expect([...used].sort()).toEqual(Object.keys(SOURCE.openLists).sort());
  });

  it('overlay declares 18 constraints with unique ids', () => {
    const ids = OVERLAY.constraints.map((c) => c.id);
    expect(ids).toHaveLength(18);
    expect(new Set(ids).size).toBe(18);
    const kinds: Record<string, number> = {};
    for (const c of OVERLAY.constraints) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
    expect(kinds).toEqual({ anyOfRequired: 3, oneOfRequired: 4, requiredIf: 5, forbiddenIf: 4, requiredIff: 1, itemsIf: 1 });
  });

  it('overlay constraints, personal-data conditions and translations name existing types and props', () => {
    expect(loadModel(SOURCE as unknown as JsonValue, OVERLAY as unknown as JsonValue).overlay.constraints).toHaveLength(18);
    const broken: JsonValue = {
      constraints: [
        { id: 'a', kind: 'anyOfRequired', type: 'Nombre', props: ['full', 'family'] },
        { id: 'b', kind: 'requiredIf', type: 'Term', when: { path: 'basis', in: ['fixd'] }, props: ['durationn'] },
        { id: 'c', kind: 'forbiddenIf', type: 'Agreement', when: { path: 'term.base', in: ['fixed'] }, props: ['endDate'] },
        { id: 'c', kind: 'itemsIf', type: 'Party', when: { path: 'kind', in: ['organization'] }, items: 'names', require: ['fulll'], forbid: [] },
      ],
      personalDataWhen: { 'Party.kind': { path: 'kind', in: ['person'] }, 'Name.type': { path: 'type', in: ['Legal'] } },
      translations: { 'Foo.bar': { en: 'x' }, Foo: { pt: 'x' }, Party: { pt: 'Pessoa' } },
    };
    expect(() => loadModel(SOURCE as unknown as JsonValue, broken)).toThrow(
      [
        'modelo de tipos inválido:',
        'restricción a: el tipo Nombre no existe',
        'restricción b: Term no tiene la propiedad durationn',
        'restricción b: "fixd" no es un valor de Term.basis',
        'restricción c: Term no tiene la propiedad base',
        'restricción c: id repetido',
        'restricción c: Name no tiene la propiedad fulll',
        'datos personales Party.kind: types.json no la marca personalData',
        'datos personales Name.type: "Legal" no es un valor de Name.type',
        'traducciones Foo.bar: la propiedad no existe',
        'traducciones Foo: el tipo no existe',
      ].join('\n'),
    );
  });

  it('extensions only in Document, Party, Work, Recording, Agreement, Edition, Media', () => {
    const withExtensions = Object.entries(SOURCE.types).filter(([, t]) => t.extensions).map(([name]) => name);
    expect(withExtensions).toEqual(['Document', 'Party', 'Work', 'Recording', 'Agreement', 'Edition', 'Media']);
    // `extensions` no es una propiedad: queda solo como la marca del tipo.
    for (const type of Object.values(SOURCE.types)) expect(Object.keys(type.props)).not.toContain('extensions');
  });

  it('personal data: the marked properties and the two conditional objects', () => {
    const marked = Object.entries(SOURCE.types).flatMap(([t, type]) =>
      Object.entries(type.props).filter(([, spec]) => spec.personalData).map(([p]) => `${t}.${p}`),
    );
    expect(marked.sort()).toEqual([
      'Contact.email', 'Contact.phone', 'Identifier.scheme', 'Name.type', 'Party.address', 'Party.birthDate',
      'Party.contact', 'Party.deathDate', 'Party.gender', 'Party.maritalStatus', 'Party.nationality',
    ]);
    // Un nombre legal y un identificador TAX_ID o NATIONAL_ID: dato personal con condición, en el overlay.
    expect(OVERLAY.personalDataWhen).toEqual({
      'Name.type': { path: 'type', in: ['legal'] },
      'Identifier.scheme': { path: 'scheme', in: ['TAX_ID', 'NATIONAL_ID'] },
    });
    expect(SOURCE.types.Party?.props.names?.type).toEqual({ array: { type: 'Name' } });
    expect(SOURCE.types.Party?.props.identifiers?.type).toEqual({ array: { type: 'Identifier' } });
    // Un media lo dice con su propio campo `personalData`.
    expect(SOURCE.types.Media?.props.personalData?.type).toEqual({ scalar: 'boolean' });
    expect(leafOf(SOURCE.types.Party?.props.address?.type ?? { scalar: 'text' })).toEqual({ type: 'Address' });
  });
});
