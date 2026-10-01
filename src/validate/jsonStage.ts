/**
 * El paso de JSON (JDX-JSN-001).
 *
 * - Un documento de más de MAX_DOCUMENT_BYTES no se lee: un solo JDX-JSN-001
 *   `size`, con `offset` en el primer byte que no entra. Con ese tope, lo que
 *   cuesta leer y validar un documento hostil queda acotado: las fallas del
 *   parser suman a lo sumo 1 000 000 de caracteres de puntero más el de la
 *   última, que no pasa del doble del largo de la entrada, y ningún texto se
 *   acerca al largo máximo de un string de V8.
 * - Si no, un JDX-JSN-001 por falla del parser (a lo sumo 100), con su razón y
 *   su `offset`, en el puntero de la falla.
 */
import { parseJson } from '../json/parse.js';
import type { Finding, ParsedJson } from '../types.js';

/** Bytes que puede tener un documento JDX (2 MiB). */
export const MAX_DOCUMENT_BYTES = 2_097_152;

export type JsonStageOutcome = { ok: true; json: ParsedJson } | { ok: false; findings: Finding[] };

export function jsonStage(bytes: Uint8Array): JsonStageOutcome {
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    return { ok: false, findings: [{ ruleId: 'JDX-JSN-001', instanceLocation: '', params: { reason: 'size', offset: MAX_DOCUMENT_BYTES } }] };
  }
  const parsed = parseJson(bytes);
  if (parsed.ok) return { ok: true, json: parsed.json };
  return {
    ok: false,
    findings: parsed.failures.map((f) => ({ ruleId: 'JDX-JSN-001', instanceLocation: f.pointer, params: { reason: f.reason, offset: f.offset } })),
  };
}
