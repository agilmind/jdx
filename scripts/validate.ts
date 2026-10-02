/**
 * `npm run validate -- <archivo.jdx.json> [...]`: controla que cada archivo sea
 * I-JSON (JDX-JSN-001) y cumpla el schema estricto de su versión menor
 * (JDX-SCH-001). Una menor más nueva que las conocidas se valida con el schema
 * abierto de la última (aviso JDX-VER-003); otra versión mayor es JDX-VER-001.
 *
 * Las reglas del perfil, la firma y los archivos de la entrega los controla el
 * validador de referencia, en construcción.
 *
 * Código de salida, con el que termina el proceso: 0 si ningún archivo tiene
 * errores, 1 si alguno tiene, 2 si falta el argumento o un archivo no se puede
 * leer.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { files } from '../src/generated/data.js';
import { parseJson } from '../src/json/parse.js';
import { schemaBundle } from '../src/schema/bundle.js';
import { defaultValidators } from '../src/schema/validators.js';

export interface CheckOutcome {
  exitCode: 0 | 1;
  lines: string[];
}

/** Las versiones menores que trae el paquete, en orden. */
const KNOWN_MINORS: readonly string[] = schemaBundle(files).minors;

/** El resultado de un archivo: una línea por error o aviso, o una línea `ok`. */
export function checkDocument(bytes: Uint8Array, minors: readonly string[] = KNOWN_MINORS): CheckOutcome {
  const parsed = parseJson(bytes);
  if (!parsed.ok) {
    return {
      exitCode: 1,
      lines: parsed.failures.map((f) => `error JDX-JSN-001 ${f.pointer || '/'} ${f.reason} (byte ${f.offset})`),
    };
  }
  const value = parsed.json.value;
  const latest = minors.at(-1) as string;
  const [latestMajor, latestMinor] = latest.split('.').map(Number) as [number, number];
  const lines: string[] = [];
  let minor = latest;
  let strict = true;
  const jdx = typeof value === 'object' && value !== null && !Array.isArray(value) ? value.jdx : undefined;
  if (typeof jdx === 'string' && /^\d+\.\d+$/.test(jdx)) {
    const [major, sub] = jdx.split('.').map(Number) as [number, number];
    if (major !== latestMajor) return { exitCode: 1, lines: [`error JDX-VER-001 /jdx versión mayor no soportada: ${jdx}`] };
    if (minors.includes(jdx)) {
      minor = jdx;
    } else if (sub > latestMinor) {
      strict = false;
      lines.push(`aviso JDX-VER-003 /jdx la versión ${jdx} es más nueva que ${latest}: se valida con el schema abierto de ${latest}`);
    }
  }
  const errors = defaultValidators().validateDocument(minor, strict, value);
  for (const e of errors) lines.push(`error JDX-SCH-001 ${e.instanceLocation || '/'} ${e.keyword} ${JSON.stringify(e.params)}`);
  if (errors.length === 0) lines.push(`ok: JSON y schema ${strict ? 'estricto' : 'abierto'} ${minor}, sin errores`);
  return { exitCode: errors.length === 0 ? 0 : 1, lines };
}

function main(paths: readonly string[]): number {
  if (paths.length === 0) {
    console.error('uso: npm run validate -- <archivo.jdx.json> [...]');
    return 2;
  }
  let exitCode = 0;
  for (const path of paths) {
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(path);
    } catch (error) {
      console.error(`${path}: no se puede leer (${(error as Error).message})`);
      return 2;
    }
    const outcome = checkDocument(bytes);
    console.log([path, ...outcome.lines.map((line) => `  ${line}`)].join('\n'));
    exitCode = Math.max(exitCode, outcome.exitCode);
  }
  return exitCode;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
