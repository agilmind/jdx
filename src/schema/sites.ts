/**
 * Qué es cada lugar del documento según el índice de su menor (SchemaIndex):
 * la referencia, la lista abierta, o si es un porcentaje, una fecha, un
 * instante o un dato personal. Un patrón calza con un puntero si tienen los
 * mismos segmentos, y `*` calza con cualquier segmento (como matchPattern).
 *
 * Los datos personales calzan también con lo que tienen adentro: su patrón
 * calza con el puntero que empieza con sus segmentos. `personalData` dice si
 * el lugar es siempre un dato personal; `personalDataWhen` da el objeto que lo
 * es según una de sus propiedades (un Name legal, un Identifier TAX_ID o
 * NATIONAL_ID), con la condición: quien tiene el documento la evalúa sobre el
 * objeto del patrón (su propiedad `path` vale uno de `in`).
 *
 * Cada índice se prepara una vez (sus patrones partidos en segmentos), y cada
 * consulta parte el puntero una sola vez.
 */
import { segmentsOf } from '../json/pointer.js';
import type { JsonPointer, OpenListSite, PersonalDataWhenSite, RefSite, SchemaIndex } from '../types.js';

export interface Sites {
  ref: RefSite | null;
  openList: OpenListSite | null;
  percent: boolean;
  date: boolean;
  instant: boolean;
  personalData: boolean;
  personalDataWhen: PersonalDataWhenSite | null;
}

type Split<T> = readonly { segments: readonly string[]; site: T }[];
interface Prepared {
  refs: Split<RefSite>;
  openLists: Split<OpenListSite>;
  percents: Split<string>;
  dates: Split<string>;
  instants: Split<string>;
  personalData: Split<string>;
  personalDataWhen: Split<PersonalDataWhenSite>;
}

const prepared = new WeakMap<SchemaIndex, Prepared>();

function prepare(index: SchemaIndex): Prepared {
  let p = prepared.get(index);
  if (p === undefined) {
    const split = <T>(sites: readonly T[], pattern: (site: T) => string): Split<T> =>
      sites.map((site) => ({ segments: segmentsOf(pattern(site)), site }));
    p = {
      refs: split(index.refs, (s) => s.pattern),
      openLists: split(index.openLists, (s) => s.pattern),
      percents: split(index.percents, (s) => s),
      dates: split(index.dates, (s) => s),
      instants: split(index.instants, (s) => s),
      personalData: split(index.personalData, (s) => s),
      personalDataWhen: split(index.personalDataWhen, (s) => s.pattern),
    };
    prepared.set(index, p);
  }
  return p;
}

/** El patrón calza con el puntero entero o, con `within`, con su comienzo. */
function matches(pattern: readonly string[], pointer: readonly string[], within: boolean): boolean {
  const fits = within ? pattern.length <= pointer.length : pattern.length === pointer.length;
  return fits && pattern.every((s, i) => s === '*' || s === pointer[i]);
}

function find<T>(sites: Split<T>, pointer: readonly string[], within = false): T | null {
  return sites.find((s) => matches(s.segments, pointer, within))?.site ?? null;
}

export function sitesAt(index: SchemaIndex, pointer: JsonPointer): Sites {
  const p = prepare(index);
  const segments = segmentsOf(pointer);
  return {
    ref: find(p.refs, segments),
    openList: find(p.openLists, segments),
    percent: find(p.percents, segments) !== null,
    date: find(p.dates, segments) !== null,
    instant: find(p.instants, segments) !== null,
    personalData: find(p.personalData, segments, true) !== null,
    personalDataWhen: find(p.personalDataWhen, segments, true),
  };
}
