/**
 * Esquemas con lista empaquetada (JDX-CLS-001): el código de una
 * clasificación (`SADAIC_GENRE`), una condición (`SADAIC_ART8`) o un contrato
 * tipo (`SADAIC_CONTRACT`) se controla contra la lista de su esquema; un esquema
 * sin lista no se evalúa. Las listas de la condición del art. 8 y del contrato
 * tipo tienen el formato de las listas abiertas.
 */
import { describe, expect, it } from 'vitest';
import { files } from '../../../src/generated/data.js';
import type { OpenValueList } from '../../../src/types.js';
import { loadValues } from '../../../src/values/load.js';
import { SCHEME_LISTS, schemeHasCode } from '../../../src/values/schemeLists.js';

const VALUES = loadValues(files);
const codes = (list: OpenValueList): string[] => list.values.map((entry) => entry.code);

describe('esquemas con lista', () => {
  it('sadaic-art8 has promotionalRecords and commercialRecording', () => {
    expect(VALUES.sadaicArt8.list).toBe('sadaic-art8');
    expect(codes(VALUES.sadaicArt8)).toEqual(['promotionalRecords', 'commercialRecording']);
    for (const entry of VALUES.sadaicArt8.values) expect(Object.keys(entry.name ?? {}), entry.code).toEqual(['es', 'pt', 'en']);
    expect(schemeHasCode(VALUES, 'SADAIC_ART8', 'promotionalRecords')).toBe(true);
    expect(schemeHasCode(VALUES, 'SADAIC_ART8', 'commercialRecording')).toBe(true);
    // El nombre no cuenta fuera de los géneros, y otro código no está.
    expect(schemeHasCode(VALUES, 'SADAIC_ART8', 'commercialRecording', 'otro nombre')).toBe(true);
    expect(schemeHasCode(VALUES, 'SADAIC_ART8', 'promotionalRecord')).toBe(false);
    expect(schemeHasCode(VALUES, 'SADAIC_ART8', 'CONTRATO_TIPO')).toBe(false);
  });

  it('sadaic-contract has CONTRATO_TIPO', () => {
    expect(VALUES.sadaicContract.list).toBe('sadaic-contract');
    expect(VALUES.sadaicContract.values).toEqual([
      { code: 'CONTRATO_TIPO', name: { es: 'Contrato tipo SADAIC', pt: 'Contrato-padrão da SADAIC', en: 'SADAIC standard contract' } },
    ]);
    expect(schemeHasCode(VALUES, 'SADAIC_CONTRACT', 'CONTRATO_TIPO', 'Contrato tipo SADAIC')).toBe(true);
    expect(schemeHasCode(VALUES, 'SADAIC_CONTRACT', 'contrato_tipo')).toBe(false);
  });

  it('SCHEME_LISTS covers SADAIC_GENRE, SADAIC_ART8, SADAIC_CONTRACT', () => {
    expect(SCHEME_LISTS).toEqual({ SADAIC_GENRE: 'sadaicGenres', SADAIC_ART8: 'sadaicArt8', SADAIC_CONTRACT: 'sadaicContract' });
    expect(Object.isFrozen(SCHEME_LISTS)).toBe(true);
    // Cada uno es un valor de la lista abierta de esquemas de su uso.
    expect(codes(VALUES.open.get('classificationSchemes') as OpenValueList)).toContain('SADAIC_GENRE');
    expect(codes(VALUES.open.get('conditionSchemes') as OpenValueList)).toContain('SADAIC_ART8');
    expect(codes(VALUES.open.get('contractTemplateSchemes') as OpenValueList)).toContain('SADAIC_CONTRACT');
  });

  it('schemeHasCode for genres needs the pair', () => {
    expect(schemeHasCode(VALUES, 'SADAIC_GENRE', '311', 'CHACARERA')).toBe(true);
    expect(schemeHasCode(VALUES, 'SADAIC_GENRE', '345', 'ZAMBA')).toBe(true);
    expect(schemeHasCode(VALUES, 'SADAIC_GENRE', '311', 'ZAMBA')).toBe(false);
    expect(schemeHasCode(VALUES, 'SADAIC_GENRE', '114', 'JINGLE')).toBe(true);
    expect(schemeHasCode(VALUES, 'SADAIC_GENRE', '114', 'MELODIA')).toBe(true);
    expect(schemeHasCode(VALUES, 'SADAIC_GENRE', '302', 'MELODIA')).toBe(false);
    // Sin nombre no hay par; el nombre se compara en NFC y sin cambiar mayúsculas.
    expect(schemeHasCode(VALUES, 'SADAIC_GENRE', '311')).toBe(false);
    expect(schemeHasCode(VALUES, 'SADAIC_GENRE', '501', 'AIRES ESPAÑOLES'.normalize('NFD'))).toBe(true);
    expect(schemeHasCode(VALUES, 'SADAIC_GENRE', '311', 'Chacarera')).toBe(false);
    expect(schemeHasCode(VALUES, 'SADAIC_GENRE', '0311', 'CHACARERA')).toBe(false);
  });

  it('unknown scheme returns null', () => {
    for (const scheme of ['X_SADAIC_GENRE', 'SADAIC_GENRES', 'ISWC', '', 'constructor', '__proto__', 'toString']) {
      expect(schemeHasCode(VALUES, scheme, '311', 'CHACARERA'), scheme).toBeNull();
    }
  });
});
