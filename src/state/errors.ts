/**
 * La falla del estado del receptor: no se puede leer, es de otra versión o de
 * otro entorno, o está bloqueado más de lo que se espera. `validate` la
 * devuelve como JDX-ENV-005 con la misma razón (y, si está bloqueado, desde
 * cuándo); `ack` la deja pasar.
 */
import type { JsonValue } from '../types.js';

export type StateErrorReason = 'unreadable' | 'version' | 'env' | 'locked';

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
