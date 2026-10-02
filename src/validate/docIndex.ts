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
 * - contextAt y valuesAt dan a las reglas el context de un lugar y los valores
 *   de los lugares de los patrones del índice, con el mismo context que las
 *   referencias.
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
  // Los lugares que contienen una referencia que no resuelve, y las referencias mismas: su conjunto se arma
  // recién si una regla pregunta por una.
  const containers = new Set<JsonPointer>();
  const unresolvedRefs: JsonPointer[] = [];
  let unresolvedSet: ReadonlySet<JsonPointer> | undefined;
  for (const site of index.refs) {
    const inList = byList.get(site.list) as ReadonlyMap<string, IndexedObject>;
    visitPattern(root, segmentsOf(site.pattern), (pointer, value, context, parent) => {
      if (typeof value !== 'string') return;
      const target = inList.get(value) ?? null;
      refs.push({ pointer, value, site, target });
      if (target !== null) return;
      findings.push({ ruleId: 'JDX-REF-002', instanceLocation: pointer, ...(context === undefined ? {} : { context }), params: { value, list: site.list } });
      unresolvedRefs.push(pointer);
      markContainers(containers, parent);
    });
  }

  return {
    index: {
      byId,
      refs,
      get: (list, id) => byList.get(list)?.get(id),
      unresolved: (pointerPrefix) => containers.has(pointerPrefix) || (unresolvedSet ??= new Set(unresolvedRefs)).has(pointerPrefix),
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

/**
 * Cada valor de los lugares de uno o varios patrones del índice del schema (`*`
 * es un segmento cualquiera): su puntero, el context del objeto de la lista
 * raíz que lo contiene (el de contextAt), el objeto o la lista que lo tiene y
 * el patrón. Los patrones bajan juntos por lo que comparten, en un solo
 * recorrido, y solo por sus caminos: cada puntero es corto aunque el documento
 * tenga claves largas en otro lugar, y cada valor de un camino se mira una vez
 * aunque decenas de patrones pasen por él.
 */
export function valuesAt(
  doc: JdxDocument | JsonValue,
  patterns: string | readonly string[],
  visit: (pointer: JsonPointer, value: JsonValue, context: FindingContext | undefined, container: JsonValue, pattern: string) => void,
): void {
  const step = (node: JsonValue, tree: PatternTree, depth: number, pointer: JsonPointer, container: JsonValue, list: RootList | undefined, context: FindingContext | undefined): void => {
    if (depth === 2 && list !== undefined && isObject(node) && typeof node.id === 'string') context = { [CONTEXT_KEY[list]]: node.id };
    for (const pattern of tree.ends) visit(pointer, node, context, container, pattern);
    if (Array.isArray(node)) {
      if (tree.star !== null) for (let i = 0; i < node.length; i++) step(node[i] as JsonValue, tree.star, depth + 1, `${pointer}/${i}`, node, list, context);
      for (const [segment, next] of tree.children) {
        if (INDEX.test(segment) && Number(segment) < node.length) step(node[Number(segment)] as JsonValue, next, depth + 1, `${pointer}/${segment}`, node, list, context);
      }
    } else if (isObject(node)) {
      const member = (key: string, next: PatternTree): void => {
        const inList = depth === 0 ? ROOT_LISTS.find((l) => l === key) : list;
        step(node[key] as JsonValue, next, depth + 1, `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, node, inList, context);
      };
      if (tree.star !== null) for (const key of Object.keys(node)) member(key, tree.star);
      for (const [segment, next] of tree.children) if (Object.hasOwn(node, segment)) member(segment, next);
    }
  };
  step(doc as unknown as JsonValue, treeOf(typeof patterns === 'string' ? [patterns] : patterns), 0, '', doc as unknown as JsonValue, undefined, undefined);
}

/** Los patrones como un árbol de segmentos: los que comparten un prefijo comparten sus nodos. */
interface PatternTree { readonly children: Map<string, PatternTree>; star: PatternTree | null; readonly ends: string[] }

function treeOf(patterns: readonly string[]): PatternTree {
  const node = (): PatternTree => ({ children: new Map(), star: null, ends: [] });
  const root = node();
  for (const pattern of patterns) {
    let at = root;
    for (const segment of segmentsOf(pattern)) {
      if (segment === '*') at = at.star ??= node();
      else {
        let next = at.children.get(segment);
        if (next === undefined) at.children.set(segment, (next = node()));
        at = next;
      }
    }
    at.ends.push(pattern);
  }
  return root;
}

function listOf(root: JsonValue, list: RootList): readonly JsonValue[] {
  const value = isObject(root) && Object.hasOwn(root, list) ? root[list] : undefined;
  return Array.isArray(value) ? value : [];
}

type Visit = (pointer: JsonPointer, value: JsonValue, context: FindingContext | undefined, parent: JsonPointer) => void;

/**
 * Cada valor de los lugares de un patrón (`*` es un segmento cualquiera), en el
 * orden del documento, con el context del objeto de la lista raíz que lo
 * contiene (el de contextAt, armado una vez por objeto) y el puntero de su
 * padre (el mismo texto para todos los de un mismo lugar).
 */
function visitPattern(root: JsonValue, pattern: readonly string[], visit: Visit): void {
  const list = ROOT_LISTS.find((l) => l === pattern[0]);
  const step = (node: JsonValue, at: number, pointer: JsonPointer, parent: JsonPointer, context: FindingContext | undefined): void => {
    if (at === 2 && list !== undefined && isObject(node) && typeof node.id === 'string') context = { [CONTEXT_KEY[list]]: node.id };
    if (at === pattern.length) {
      visit(pointer, node, context, parent);
      return;
    }
    const segment = pattern[at] as string;
    if (Array.isArray(node)) {
      if (segment === '*') for (let i = 0; i < node.length; i++) step(node[i] as JsonValue, at + 1, `${pointer}/${i}`, pointer, context);
      else if (INDEX.test(segment) && Number(segment) < node.length) step(node[Number(segment)] as JsonValue, at + 1, `${pointer}/${segment}`, pointer, context);
    } else if (isObject(node)) {
      const keys = segment === '*' ? Object.keys(node) : Object.hasOwn(node, segment) ? [segment] : [];
      for (const key of keys) step(node[key] as JsonValue, at + 1, `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, pointer, context);
    }
  };
  step(root, 0, '', '', undefined);
}

/**
 * Marca un lugar y cada uno de sus prefijos, hasta ''. Un prefijo que ya está
 * tiene los suyos: con miles de referencias en el mismo lugar, cada una mira
 * solo a su padre.
 */
function markContainers(set: Set<JsonPointer>, pointer: JsonPointer): void {
  if (set.has(pointer)) return;
  set.add(pointer);
  for (let i = pointer.lastIndexOf('/'); i >= 0; i = i === 0 ? -1 : pointer.lastIndexOf('/', i - 1)) {
    const prefix = pointer.slice(0, i);
    if (set.has(prefix)) return;
    set.add(prefix);
  }
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
