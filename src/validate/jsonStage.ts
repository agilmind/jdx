/**
 * El paso de JSON (JDX-JSN-001).
 *
 * - Un documento de más de MAX_DOCUMENT_BYTES no se lee: un solo JDX-JSN-001
 *   `size`, con `offset` en el primer byte que no entra. Uno así se puede pasar
 *   sin sus bytes, con su tamaño y su sha256 (jsonStageOf). Con ese tope y el
 *   de resultados de cada regla (capFindings, src/report/results.ts), validar
 *   un documento hostil cuesta del orden de un segundo: las fallas del parser
 *   suman a lo sumo 1 000 000 de caracteres de puntero más el de la última, que
 *   no pasa del doble del largo de la entrada, y ningún texto se acerca al
 *   largo máximo de un string de V8.
 * - Si no, un JDX-JSN-001 por falla del parser (a lo sumo 100), con su razón y
 *   su `offset`, en el puntero de la falla. Si el parser dejó de leer en su
 *   tope (la falla 100, o la que lleva sus punteros a 1 000 000 de
 *   caracteres), `capped`: puede haber más.
 */
import { MAX_FAILURE_POINTER_CHARS, MAX_FAILURES, parseJson } from '../json/parse.js';
import type { Finding, ParsedJson, ValidateInput } from '../types.js';

/** Bytes que puede tener un documento JDX (2 MiB). */
export const MAX_DOCUMENT_BYTES = 2_097_152;

export type JsonStageOutcome = { ok: true; json: ParsedJson } | { ok: false; findings: Finding[]; capped?: true };

const SHA256 = /^[0-9a-f]{64}$/u;

export function jsonStage(bytes: Uint8Array): JsonStageOutcome {
  if (bytes.length > MAX_DOCUMENT_BYTES) return tooLarge();
  const parsed = parseJson(bytes);
  if (parsed.ok) return { ok: true, json: parsed.json };
  const pointerChars = parsed.failures.reduce((n, f) => n + f.pointer.length, 0);
  return {
    ok: false,
    findings: parsed.failures.map((f) => ({ ruleId: 'JDX-JSN-001', instanceLocation: f.pointer, params: { reason: f.reason, offset: f.offset } })),
    ...(parsed.failures.length >= MAX_FAILURES || pointerChars >= MAX_FAILURE_POINTER_CHARS ? { capped: true as const } : {}),
  };
}

/**
 * El paso de JSON de una entrada de validate: con sus bytes, jsonStage; sin
 * bytes, un archivo de más de MAX_DOCUMENT_BYTES, que da JDX-JSN-001 `size`
 * sin leer nada. Una entrada que no es ninguna de las dos formas, o sin bytes
 * con un tamaño que entra en el tope, es un error de programación y lanza.
 */
export function jsonStageOf(input: ValidateInput): JsonStageOutcome {
  const bytes = inputBytes(input);
  return bytes === null ? tooLarge() : jsonStage(bytes);
}

/** Los bytes de la entrada, o null en la forma sin bytes (controlada). */
export function inputBytes(input: ValidateInput): Uint8Array | null {
  const { bytes, size, sha256 } = input as { bytes?: unknown; size?: unknown; sha256?: unknown };
  if (bytes !== undefined) {
    if (size !== undefined || sha256 !== undefined) throw new Error('la entrada trae bytes y también size o sha256');
    return bytes as Uint8Array;
  }
  if (size === undefined || sha256 === undefined) throw new Error('la entrada no trae bytes ni size y sha256');
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= MAX_DOCUMENT_BYTES || typeof sha256 !== 'string' || !SHA256.test(sha256)) {
    throw new Error(`sin bytes, solo un archivo de más de ${MAX_DOCUMENT_BYTES} bytes, con un size entero y un sha256 en hexadecimal: size ${String(size)}`);
  }
  return null;
}

function tooLarge(): JsonStageOutcome {
  return { ok: false, findings: [{ ruleId: 'JDX-JSN-001', instanceLocation: '', params: { reason: 'size', offset: MAX_DOCUMENT_BYTES } }] };
}
