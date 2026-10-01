/**
 * La falla del estado del receptor: no se puede leer, es de otra versión o de
 * otro entorno, o está bloqueado más de lo que se espera. `validate` la
 * devuelve como JDX-ENV-005 con la misma razón (y, si está bloqueado, desde
 * cuándo; si no se puede leer, por qué); `ack` la deja pasar.
 *
 * Por qué no se puede leer (`details.cause`): la carpeta no existe o no es una
 * carpeta (`missingDir`), falta permiso (`permission`), state.json no es
 * I-JSON (`json`, con la razón del parser) o no cumple jdx-state.schema.json
 * (`schema`, con dónde y qué palabra), state.lock no se puede usar (`lock`) u
 * otra falla del disco (`io`); las dos del disco, con su código.
 */
import type { JsonValue } from '../types.js';

export type StateErrorReason = 'unreadable' | 'version' | 'env' | 'locked';
export type StateUnreadableCause = 'missingDir' | 'permission' | 'json' | 'schema' | 'lock' | 'io';

/** Las causas de `unreadable`, en el orden del catálogo. */
export const STATE_UNREADABLE_CAUSES: readonly StateUnreadableCause[] = Object.freeze(['missingDir', 'permission', 'json', 'schema', 'lock', 'io']);

const MESSAGES: Readonly<Record<StateErrorReason, string>> = Object.freeze({
  unreadable: 'el estado del receptor no se puede leer',
  version: 'el estado del receptor es de otra versión',
  env: 'el estado del receptor es de otro entorno',
  locked: 'el estado del receptor está bloqueado',
});

export class StateError extends Error {
  override readonly name = 'StateError';

  constructor(
    readonly reason: StateErrorReason,
    readonly details?: { [k: string]: JsonValue },
  ) {
    super(details === undefined ? MESSAGES[reason] : `${MESSAGES[reason]} (${JSON.stringify(details)})`);
  }
}
