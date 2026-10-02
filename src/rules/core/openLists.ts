/**
 * Las listas abiertas contra sus archivos de valores empaquetados
 * (JDX-VER-004, del núcleo, aviso; cuenta en el bucket schema).
 *
 * - Cada valor de un lugar de lista abierta del índice del schema que no está
 *   en values/<lista>.json da VER-004 { list, value }, con el context del
 *   objeto de la lista raíz que lo contiene.
 * - Un valor cuyo archivo dice para qué esquemas vale (`schemes`, como cada
 *   tipo de identificador) está en la lista solo con uno de ellos como
 *   `scheme` del mismo objeto: si no, VER-004 { list, value, scheme }.
 * - Los valores X_ son propios de un emisor o una sociedad y no se controlan;
 *   con un `scheme` X_, tampoco el esquema de un valor.
 *
 * Las listas son las de la validación (ctx.values). Una que falta es un error
 * del empaquetado y lanza.
 */
import type { Finding, JsonValue, OpenValueList, Rule, ValueEntry } from '../../types.js';
import { valuesAt } from '../../validate/docIndex.js';

const OWN = 'X_';

export const VER_004: Rule = {
  id: 'JDX-VER-004',
  evaluate(ctx) {
    // La lista y sus códigos de cada lugar, antes de recorrer.
    const sites = new Map<string, { list: string; codes: ReadonlyMap<string, ValueEntry> }>();
    for (const site of ctx.schemaIndex.openLists) {
      const list = ctx.values.open.get(site.list);
      if (list === undefined) throw new Error(`${site.list}: no está en las listas de valores`);
      sites.set(site.pattern, { list: site.list, codes: codesOf(list) });
    }
    const out: Finding[] = [];
    valuesAt(ctx.doc, [...sites.keys()], (pointer, value, context, container, pattern) => {
      if (typeof value !== 'string' || value.startsWith(OWN)) return;
      const { list, codes } = sites.get(pattern) as { list: string; codes: ReadonlyMap<string, ValueEntry> };
      const entry = codes.get(value);
      const scheme = entry?.schemes === undefined ? undefined : schemeOf(container);
      if (entry !== undefined && (scheme === undefined || entry.schemes?.includes(scheme) === true)) return;
      out.push({
        ruleId: 'JDX-VER-004',
        instanceLocation: pointer,
        ...(context === undefined ? {} : { context }),
        params: { list, value, ...(entry === undefined ? {} : { scheme: scheme as string }) },
      });
    });
    return out;
  },
};

/** El `scheme` del objeto que tiene el valor, salvo uno propio (X_). */
function schemeOf(container: JsonValue): string | undefined {
  if (typeof container !== 'object' || container === null || Array.isArray(container)) return undefined;
  const scheme = Object.hasOwn(container, 'scheme') ? container.scheme : undefined;
  return typeof scheme === 'string' && !scheme.startsWith(OWN) ? scheme : undefined;
}

const byList = new WeakMap<OpenValueList, ReadonlyMap<string, ValueEntry>>();

/** Los valores de una lista por código, una vez por lista. */
function codesOf(list: OpenValueList): ReadonlyMap<string, ValueEntry> {
  let codes = byList.get(list);
  if (codes === undefined) {
    codes = new Map(list.values.map((entry) => [entry.code, entry]));
    byList.set(list, codes);
  }
  return codes;
}
