/**
 * Lo que el schema no ve de un número o de una fecha (JDX-NUM-001 y
 * JDX-NUM-002, del núcleo).
 *
 * - NUM-001: el texto de cada porcentaje, tal como está en el archivo, cumple
 *   el formato de porcentaje: hasta 4 decimales, sin exponente ni -0. El
 *   schema solo ve el número, entre 0 y 100.
 * - NUM-002: cada fecha y cada instante existen en el calendario (un 30 de
 *   febrero, la hora 25 o el segundo 60 fuera del último minuto del día UTC,
 *   no).
 *
 * Las dos bajan por el documento según los lugares del índice del schema, que
 * son propiedades fijas e índices, todos en un recorrido (valuesAt): cada
 * puntero es corto, y el texto de un porcentaje se lee con numberTexts.get.
 * Nunca recorren todos los números del archivo, que pueden estar debajo de una
 * clave tan larga como la entrada.
 * Cada hallazgo lleva el context del objeto de la lista raíz que contiene el
 * dato (ninguno en la declaración ni en la edición).
 */
import { PATTERNS } from '../../conventions/patterns.js';
import { isCalendarDate, isCalendarInstant } from '../../conventions/time.js';
import type { Finding, FindingContext, JsonPointer, Rule, RuleId } from '../../types.js';
import { valuesAt } from '../../validate/docIndex.js';

function finding(ruleId: RuleId, pointer: JsonPointer, context: FindingContext | undefined, text: string): Finding {
  return { ruleId, instanceLocation: pointer, ...(context === undefined ? {} : { context }), params: { text } };
}

export const NUM_001: Rule = {
  id: 'JDX-NUM-001',
  evaluate(ctx) {
    const out: Finding[] = [];
    valuesAt(ctx.doc, ctx.schemaIndex.percents, (pointer, value, context) => {
      if (typeof value !== 'number') return;
      const text = ctx.json.numberTexts.get(pointer);
      if (text !== undefined && !PATTERNS.percent.test(text)) out.push(finding('JDX-NUM-001', pointer, context, text));
    });
    return out;
  },
};

export const NUM_002: Rule = {
  id: 'JDX-NUM-002',
  evaluate(ctx) {
    const out: Finding[] = [];
    const instants = new Set(ctx.schemaIndex.instants);
    valuesAt(ctx.doc, [...ctx.schemaIndex.dates, ...instants], (pointer, value, context, _container, pattern) => {
      if (typeof value !== 'string') return;
      if (!(instants.has(pattern) ? isCalendarInstant(value) : isCalendarDate(value))) out.push(finding('JDX-NUM-002', pointer, context, value));
    });
    return out;
  },
};
