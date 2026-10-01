/**
 * El paso de versión y schema (JDX-VER-001 a -003, JDX-SCH-001 y, si el perfil
 * no admite la versión del documento, JDX-ENV-006).
 *
 * - `jdx` es la versión `M.m` del documento. Una mayor de la que el validador
 *   no trae schemas da JDX-VER-001 y nada más: el archivo tiene un defecto
 *   (salida 1), lo mande quien lo mande.
 * - Con una mayor que el validador lee, el perfil tiene que admitir la versión
 *   (admitsJdx): si no, JDX-ENV-006 `jdxNotAdmitted` y nada más, porque la
 *   configuración del receptor no sirve para ese archivo (salida 2).
 * - Una menor que el validador trae se valida con su schema estricto. Una más
 *   nueva que la última que trae, con el abierto de esa última, y da
 *   JDX-VER-003.
 * - `$schema` tiene que ser la URL del schema abierto de la menor de `jdx`: la
 *   del estricto, o la de otra menor, da JDX-VER-002, y el error del schema en
 *   `/$schema` no se repite. Una URL que no es de un schema de JDX la controla
 *   el schema.
 * - Un `jdx` que no es una versión (falta, no es texto, `1.01`) se valida con
 *   el schema estricto de la menor más nueva, que dice qué está mal.
 * - Un JDX-SCH-001 por error del schema, como los da el validador (a lo sumo
 *   MAX_SCHEMA_ERRORS, src/schema/ajv.ts), con `keywordLocation` y la palabra
 *   del schema en `params.keyword`.
 * - Con un error, el resultado no trae el documento: lo que sigue no corre.
 */
import type { JdxDocument } from '../generated/jdx-types.js';
import { admitsJdx } from '../profile/resolve.js';
import type { Finding, JsonValue, ParsedJson, Profile, SchemaBundle, SchemaIndex, SchemaStageOutcome, SchemaValidators } from '../types.js';

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
/** La URL de un schema de JDX: la menor y si es el estricto. */
const SCHEMA_URL = /^https:\/\/jdx\.jupiter\.ar\/schema\/(\d+\.\d+)\/jdx(\.strict)?\.schema\.json$/u;

export interface SchemaStageDeps { bundle: SchemaBundle; validators: SchemaValidators; profile: Profile }

export function schemaStage(json: ParsedJson, deps: SchemaStageDeps): SchemaStageOutcome {
  const value = json.value;
  const root = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
  const jdx = root?.jdx;
  const version = typeof jdx === 'string' ? VERSION.exec(jdx) : null;
  const findings: Finding[] = [];
  let minor = newest(deps.bundle.minors);
  let strict = true;
  let schemaUrlChecked = false;

  if (typeof jdx === 'string' && version !== null) {
    const known = deps.bundle.minors.filter((m) => m.split('.')[0] === version[1]);
    if (known.length === 0) return { kind: 'failed', findings: [{ ruleId: 'JDX-VER-001', instanceLocation: '/jdx', params: { jdx } }] };
    if (!admitsJdx(deps.profile, jdx)) {
      return { kind: 'environment', findings: [{ ruleId: 'JDX-ENV-006', instanceLocation: '', params: { reason: 'jdxNotAdmitted', jdx } }] };
    }
    if (known.includes(jdx)) minor = jdx;
    else {
      // Una menor que no trae: la más nueva de esa mayor, con su abierto. Las menores intermedias
      // siempre viajan en el bundle, así que es una menor más nueva.
      minor = newest(known);
      strict = false;
      if (Number(version[2]) > Number(minor.split('.')[1])) {
        findings.push({ ruleId: 'JDX-VER-003', instanceLocation: '/jdx', params: { jdx, validatedWith: minor } });
      }
    }
    const url = root?.$schema;
    const found = typeof url === 'string' ? SCHEMA_URL.exec(url) : null;
    if (typeof url === 'string' && found !== null && (found[2] !== undefined || found[1] !== jdx)) {
      schemaUrlChecked = true;
      findings.push({ ruleId: 'JDX-VER-002', instanceLocation: '/$schema', params: { jdx, schemaUrl: url } });
    }
  }

  for (const e of deps.validators.validateDocument(minor, strict, value)) {
    if (schemaUrlChecked && e.instanceLocation === '/$schema') continue;
    const params: { [k: string]: JsonValue } = { keyword: e.keyword, ...e.params };
    findings.push({ ruleId: 'JDX-SCH-001', instanceLocation: e.instanceLocation, keywordLocation: e.keywordLocation, params });
  }
  if (findings.some((f) => f.ruleId !== 'JDX-VER-003')) return { kind: 'failed', findings };
  return { kind: 'passed', doc: value as unknown as JdxDocument, minor, schemaIndex: indexOf(deps.bundle, minor), findings };
}

/** La menor más nueva de una lista ordenada, como la da el bundle. */
function newest(minors: readonly string[]): string {
  const last = minors[minors.length - 1];
  if (last === undefined) throw new Error('el bundle no trae schemas de documento');
  return last;
}

function indexOf(bundle: SchemaBundle, minor: string): SchemaIndex {
  const index = Object.hasOwn(bundle.index, minor) ? bundle.index[minor] : undefined;
  if (index === undefined) throw new Error(`el bundle no trae el índice de la menor ${minor}`);
  return index;
}
