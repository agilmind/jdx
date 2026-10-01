/**
 * Los formatos de JDX como constantes: las 26 expresiones exactas (docs/campos.md, «Formatos»).
 *
 * - El schema las usa como `pattern` (nunca `format`), con `PATTERNS.x.source`.
 *   Ajv compila `pattern` con la bandera u; acá también la llevan, así lo que se
 *   prueba es lo mismo que valida el schema.
 * - `$` sin la bandera m solo calza al final del texto: un salto de línea final
 *   no pasa.
 * - La validez de calendario (NUM-002) y el texto del porcentaje (NUM-001) los
 *   controla el código: src/conventions/time.ts y decimal.ts.
 */
import type { PatternName, ScalarName } from '../types.js';

export const PATTERNS: Readonly<Record<PatternName, RegExp>> = Object.freeze({
  instant: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/u,
  date: /^\d{4}-\d{2}-\d{2}$/u,
  duration: /^P(?!$)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/u,
  percent: /^(100(\.0{1,4})?|[1-9]?[0-9](\.[0-9]{1,4})?)$/u,
  amount: /^\d+(\.\d{1,4})?$/u,
  currency: /^[A-Z]{3}$/u,
  sha256: /^[0-9a-f]{64}$/u,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  localId: /^[a-z][a-z0-9-]{0,63}$/u,
  issuerId: /^[a-z][a-z0-9-]{0,63}$/u,
  kid: /^[A-Za-z0-9_-]{43}$/u,
  country: /^[A-Z]{2}$/u,
  subdivision: /^[A-Z]{2}-[A-Z0-9]{1,3}$/u,
  tis: /^\d{4}$/u,
  society: /^(\d{3}|X_JDX_[A-Z0-9_]+)$/u,
  language: /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/u,
  url: /^https?:\/\/\S+$/u,
  uri: /^https:\/\/\S+$/u,
  email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/u,
  phone: /^\+[1-9]\d{6,14}$/u,
  mediaType: /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u,
  fraction: /^[1-9]\d*\/[1-9]\d*$/u,
  schemaVersion: /^\d+\.\d+$/u,
  enumValue: /^([a-z][A-Za-z0-9]*|X_[A-Z0-9]+(_[A-Z0-9]+)*)$/u,
  schemeValue: /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/u,
  extensionKey: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/u,
});

/**
 * Escalar de types.json → su patrón. `text`, `boolean`, los enteros, `year` y
 * `percent` no tienen: el schema los controla con `type`, `minimum` y
 * `maximum` (percent es un número de 0 a 100; su texto lo mira NUM-001 con
 * `PATTERNS.percent`).
 */
export const SCALAR_PATTERN: Readonly<Partial<Record<ScalarName, PatternName>>> = Object.freeze({
  instant: 'instant',
  date: 'date',
  duration: 'duration',
  amount: 'amount',
  currency: 'currency',
  sha256: 'sha256',
  uuid: 'uuid',
  localId: 'localId',
  issuerId: 'issuerId',
  kid: 'kid',
  country: 'country',
  subdivision: 'subdivision',
  tis: 'tis',
  society: 'society',
  language: 'language',
  url: 'url',
  uri: 'uri',
  email: 'email',
  phone: 'phone',
  mediaType: 'mediaType',
  fraction: 'fraction',
  schemaVersion: 'schemaVersion',
});
