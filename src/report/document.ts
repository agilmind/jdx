/**
 * Lo que el reporte dice del documento validado (`document`).
 *
 * - `fileName`, `sha256` y `size` salen de la entrada: el nombre tal como
 *   llegó y los bytes, también cuando el JSON no se puede leer. Un archivo de
 *   más del tope puede llegar sin sus bytes, con su tamaño y su sha256.
 * - Con JSON ilegible no hay valor (el parser no da uno parcial): todo lo que
 *   se lee del contenido es null.
 * - `declarationId`, `revision` y `jdx` son null solo si no cumplen su patrón
 *   (UUID en minúsculas, entero ≥ 1, `M.m`); otro error del schema, aun dentro
 *   de `declaration`, no los anula: así `ack` guarda el recibo del rechazo y
 *   la revisión repetida se sigue controlando.
 * - `declaredProfiles` es `profiles` del archivo si es una lista de textos.
 * - `issuer` (de `declaration.issuer`, si su id y su nombre cumplen) y `media`
 *   (los que viajan en la entrega, con path, delivery, size y sha256) solo se
 *   leen si el schema pasó; si no, null.
 */
import { createHash } from 'node:crypto';
import { PATTERNS } from '../conventions/patterns.js';
import type { JsonValue, MediaRecord, ParsedJson, ReportDocument, ValidateInput } from '../types.js';

export function documentFacts(input: ValidateInput, json: ParsedJson | null, schemaPassed: boolean): ReportDocument {
  const fileName = input.fileName;
  const bytes = 'bytes' in input ? input.bytes : undefined;
  const sha256 = bytes !== undefined ? createHash('sha256').update(bytes).digest('hex') : (input as { sha256: string }).sha256;
  const size = bytes !== undefined ? bytes.length : (input as { size: number }).size;
  if (json === null) {
    return { fileName, declarationId: null, revision: null, jdx: null, sha256, size, declaredProfiles: null, issuer: null, media: null };
  }
  const doc = record(json.value);
  const declaration = record(doc?.declaration);
  const id = declaration?.id;
  const revision = declaration?.revision;
  const profiles = doc?.profiles;
  return {
    fileName,
    declarationId: typeof id === 'string' && PATTERNS.uuid.test(id) ? id : null,
    revision: typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 1 ? revision : null,
    jdx: typeof doc?.jdx === 'string' && PATTERNS.schemaVersion.test(doc.jdx) ? doc.jdx : null,
    sha256,
    size,
    declaredProfiles: Array.isArray(profiles) && profiles.every((p) => typeof p === 'string') ? [...(profiles as string[])] : null,
    issuer: schemaPassed ? issuerOf(declaration?.issuer) : null,
    media: schemaPassed ? mediaOf(doc?.media) : null,
  };
}

function issuerOf(value: JsonValue | undefined): { id: string; name: string } | null {
  const issuer = record(value);
  return issuer !== undefined && typeof issuer.id === 'string' && PATTERNS.issuerId.test(issuer.id) && typeof issuer.name === 'string'
    ? { id: issuer.id, name: issuer.name }
    : null;
}

/** Los media que viajan en la entrega (delivered distinto de false) con sus cuatro datos, en el orden del archivo. */
function mediaOf(value: JsonValue | undefined): MediaRecord[] {
  const out: MediaRecord[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const m = record(item);
    if (m === undefined || m.delivered === false) continue;
    const { path, delivery, size, sha256 } = m;
    if (
      typeof path === 'string' &&
      typeof delivery === 'number' && Number.isSafeInteger(delivery) && delivery >= 1 &&
      typeof size === 'number' && Number.isSafeInteger(size) && size >= 0 &&
      typeof sha256 === 'string' && PATTERNS.sha256.test(sha256)
    ) {
      out.push({ path, delivery, size, sha256 });
    }
  }
  return out;
}

function record(value: JsonValue | undefined): { [k: string]: JsonValue } | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}
