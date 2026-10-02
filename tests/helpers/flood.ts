/**
 * Entradas hostiles para los tests de reglas.
 *
 * - flood(change, item) arma el ejemplo con una lista de `item` tan larga
 *   como entra en MAX_DOCUMENT_BYTES, en el lugar donde `change` pone el
 *   marcador. `item` es un texto o una función del índice que da textos del
 *   mismo largo (ids que no se repiten).
 * - measured(run) valida de punta a punta (validateWithDeps), escribe el
 *   reporte y lo vuelve a leer, como lo hará ack, y dice cuánto tardó todo.
 * - resultsOf(report, ...codes) y omittedOf(report, ...codes): los resultados
 *   y los omitidos de esos códigos. Las aserciones de punta a punta miran los
 *   suyos: las reglas que se registren después suman los de ellas.
 */
import { parseJson } from '../../src/json/parse.js';
import { MAX_DOCUMENT_BYTES } from '../../src/validate/jsonStage.js';
import type { JsonValue, OmittedResult, Report, Result, RuleId } from '../../src/types.js';
import { exampleText } from './docBuilder.js';
import { type ExampleRun, validateExample } from './ruleContext.js';

export type Doc = { [k: string]: JsonValue };

const MARKER = '@@';
const encode = (text: string) => new TextEncoder().encode(text);

export function flood(
  change: (doc: Doc, marker: string) => void,
  item: string | ((i: number) => string),
  base: string = exampleText(),
): { text: string; count: number } {
  const doc = JSON.parse(base) as Doc;
  change(doc, MARKER);
  const template = JSON.stringify(doc);
  const quoted = JSON.stringify(MARKER);
  if (!template.includes(quoted)) throw new Error('flood: el cambio no puso el marcador');
  const itemAt = typeof item === 'string' ? () => item : item;
  const size = encode(itemAt(0)).length;
  // Lo fijo, con los corchetes de la lista; cada ítem suma su largo y una coma.
  const fixed = encode(template).length - encode(quoted).length + 2;
  const count = Math.floor((MAX_DOCUMENT_BYTES - fixed + 1) / (size + 1));
  const items = Array.from({ length: count }, (_, i) => itemAt(i));
  if (encode(items[count - 1] as string).length !== size) throw new Error('flood: los ítems no tienen todos el mismo largo');
  return { text: template.replace(quoted, () => `[${items.join(',')}]`), count };
}

export async function measured(run: ExampleRun): Promise<{ report: Report; chars: number; readBack: boolean; ms: number }> {
  const started = performance.now();
  const report = await validateExample(run);
  const text = JSON.stringify(report, null, 2);
  const back = parseJson(encode(text));
  return { report, chars: text.length, readBack: back.ok, ms: performance.now() - started };
}

export function resultsOf(report: Report, ...codes: RuleId[]): Result[] {
  return report.results.filter((r) => codes.includes(r.ruleId));
}

export function omittedOf(report: Report, ...codes: RuleId[]): OmittedResult[] {
  return (report.omitted ?? []).filter((o) => codes.includes(o.ruleId));
}
