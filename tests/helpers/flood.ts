/**
 * Entradas hostiles para los tests de reglas.
 *
 * - flood(change, item) arma el ejemplo con una lista de `item` tan larga
 *   como entra en MAX_DOCUMENT_BYTES, en el lugar donde `change` pone el
 *   marcador.
 * - measured(run) valida de punta a punta (validateWithDeps), escribe el
 *   reporte y lo vuelve a leer, como lo hará ack, y dice cuánto tardó todo.
 */
import { parseJson } from '../../src/json/parse.js';
import { MAX_DOCUMENT_BYTES } from '../../src/validate/jsonStage.js';
import type { JsonValue, Report } from '../../src/types.js';
import { exampleText } from './docBuilder.js';
import { type ExampleRun, validateExample } from './ruleContext.js';

export type Doc = { [k: string]: JsonValue };

const MARKER = '@@';
const encode = (text: string) => new TextEncoder().encode(text);

export function flood(change: (doc: Doc, marker: string) => void, item: string, base: string = exampleText()): { text: string; count: number } {
  const doc = JSON.parse(base) as Doc;
  change(doc, MARKER);
  const template = JSON.stringify(doc);
  const quoted = JSON.stringify(MARKER);
  if (!template.includes(quoted)) throw new Error('flood: el cambio no puso el marcador');
  // Lo fijo, con los corchetes de la lista; cada ítem suma su largo y una coma.
  const fixed = encode(template).length - encode(quoted).length + 2;
  const count = Math.floor((MAX_DOCUMENT_BYTES - fixed + 1) / (encode(item).length + 1));
  return { text: template.replace(quoted, () => `[${Array<string>(count).fill(item).join(',')}]`), count };
}

export async function measured(run: ExampleRun): Promise<{ report: Report; chars: number; readBack: boolean; ms: number }> {
  const started = performance.now();
  const report = await validateExample(run);
  const text = JSON.stringify(report, null, 2);
  const back = parseJson(encode(text));
  return { report, chars: text.length, readBack: back.ok, ms: performance.now() - started };
}
