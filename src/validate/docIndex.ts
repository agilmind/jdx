/**
 * El índice del documento: los objetos de las cinco listas raíz por su id y
 * cada referencia del documento con el objeto al que apunta (JDX-REF-001 y
 * JDX-REF-002).
 *
 * - Un id local es único en todo el archivo, en las cinco listas. Cada
 *   repetición después de la primera da JDX-REF-001 en su `/id`, en el orden
 *   parties, works, recordings, agreements y media, y en cada lista en el del
 *   archivo. `byId` guarda la primera; `get(list, id)` busca en esa lista.
 * - Las referencias están en los lugares que anota x-jdx-ref (SchemaIndex.refs).
 *   Una que no es el id de un objeto de su lista da JDX-REF-002 { value, list },
 *   con el context del objeto de la lista raíz que la contiene (ninguno en
 *   `declaration` ni en `edition`). Que el contrato o el archivo sea del tipo que
 *   pide x-jdx-ref-type lo controla el perfil.
 * - `unresolved(puntero)` dice si dentro de ese lugar hay una referencia que no
 *   resuelve: una regla que depende de una referencia no evalúa ese objeto.
 *
 * Recibe un documento que ya cumple su schema.
 */
import type { JdxDocument } from '../generated/jdx-types.js';
import { segmentsOf } from '../json/pointer.js';
import type { DocIndex, Finding, FindingContext, IndexedObject, JsonPointer, JsonValue, ResolvedRef, RootList, SchemaIndex } from '../types.js';

const ROOT_LISTS: readonly RootList[] = ['parties', 'works', 'recordings', 'agreements', 'media'];

/** La clave de context de cada lista raíz. */
const CONTEXT_KEY: Readonly<Record<RootList, keyof FindingContext>> = Object.freeze({
  parties: 'party', works: 'work', recordings: 'recording', agreements: 'agreement', media: 'media',
});

const INDEX = /^(?:0|[1-9]\d*)$/u;

type JsonObject = { [k: string]: JsonValue };

export function buildDocIndex(doc: JdxDocument, index: SchemaIndex): { index: DocIndex; findings: Finding[] } {
  const root = doc as unknown as JsonValue;
  const findings: Finding[] = [];
  const byId = new Map<string, IndexedObject>();
  const byList = new Map<RootList, Map<string, IndexedObject>>();
  for (const list of ROOT_LISTS) {
    const inList = new Map<string, IndexedObject>();
    byList.set(list, inList);
    listOf(root, list).forEach((obj, i) => {
      if (!isObject(obj) || typeof obj.id !== 'string') return;
      const entry: IndexedObject = { list, index: i, pointer: `/${list}/${i}`, id: obj.id, obj };
      if (byId.has(obj.id)) findings.push({ ruleId: 'JDX-REF-001', instanceLocation: `${entry.pointer}/id`, params: { id: obj.id } });
      else byId.set(obj.id, entry);
      if (!inList.has(obj.id)) inList.set(obj.id, entry);
    });
  }

  const refs: ResolvedRef[] = [];
  const unresolved = new Set<JsonPointer>();
  for (const site of index.refs) {
    for (const { pointer, value } of valuesAt(root, segmentsOf(site.pattern))) {
      if (typeof value !== 'string') continue;
      const target = byList.get(site.list)?.get(value) ?? null;
      refs.push({ pointer, value, site, target });
      if (target !== null) continue;
      const context = contextAt(root, pointer);
      findings.push({ ruleId: 'JDX-REF-002', instanceLocation: pointer, ...(context === undefined ? {} : { context }), params: { value, list: site.list } });
      for (const prefix of prefixesOf(pointer)) unresolved.add(prefix);
    }
  }

  return {
    index: {
      byId,
      refs,
      get: (list, id) => byList.get(list)?.get(id),
      unresolved: (pointerPrefix) => unresolved.has(pointerPrefix),
    },
    findings,
  };
}

/**
 * El context de un lugar: el id del objeto de la lista raíz que lo contiene
 * (`/works/1/…` → `{ work: 'w2' }`), o nada fuera de las listas raíz. Mira solo
 * los dos primeros segmentos, así no recorre un puntero largo.
 */
export function contextAt(doc: JdxDocument | JsonValue, pointer: JsonPointer): FindingContext | undefined {
  const second = pointer.indexOf('/', 1);
  if (!pointer.startsWith('/') || second < 0) return undefined;
  const list = pointer.slice(1, second) as RootList;
  if (!ROOT_LISTS.includes(list)) return undefined;
  const third = pointer.indexOf('/', second + 1);
  const index = pointer.slice(second + 1, third < 0 ? undefined : third);
  if (!INDEX.test(index)) return undefined;
  const obj = listOf(doc as unknown as JsonValue, list)[Number(index)];
  return isObject(obj) && typeof obj.id === 'string' ? { [CONTEXT_KEY[list]]: obj.id } : undefined;
}

function listOf(root: JsonValue, list: RootList): readonly JsonValue[] {
  const value = isObject(root) && Object.hasOwn(root, list) ? root[list] : undefined;
  return Array.isArray(value) ? value : [];
}

/** Los valores de los lugares de un patrón (`*` es un segmento cualquiera), en el orden del documento. */
function* valuesAt(value: JsonValue, pattern: readonly string[], at = 0, pointer = ''): Generator<{ pointer: JsonPointer; value: JsonValue }> {
  if (at === pattern.length) {
    yield { pointer, value };
    return;
  }
  const segment = pattern[at] as string;
  if (Array.isArray(value)) {
    if (segment === '*') for (const [i, item] of value.entries()) yield* valuesAt(item, pattern, at + 1, `${pointer}/${i}`);
    else if (INDEX.test(segment) && Number(segment) < value.length) yield* valuesAt(value[Number(segment)] as JsonValue, pattern, at + 1, `${pointer}/${segment}`);
  } else if (isObject(value)) {
    const keys = segment === '*' ? Object.keys(value) : Object.hasOwn(value, segment) ? [segment] : [];
    for (const key of keys) yield* valuesAt(value[key] as JsonValue, pattern, at + 1, `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`);
  }
}

/** El puntero y cada uno de sus prefijos, hasta '' incluido. */
function prefixesOf(pointer: JsonPointer): JsonPointer[] {
  const out = [pointer];
  for (let i = pointer.lastIndexOf('/'); i >= 0; i = i === 0 ? -1 : pointer.lastIndexOf('/', i - 1)) out.push(pointer.slice(0, i));
  return out;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
