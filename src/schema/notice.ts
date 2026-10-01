/**
 * Aviso de cada schema publicado: el `$comment` con la autoría y la anotación
 * `x-jdx-license`, legible por máquina, con el identificador SPDX de la
 * licencia de JDX y la URL de su texto. Los emite el generador; los schemas
 * auxiliares, escritos a mano, llevan los mismos valores, y
 * tests/repo/schema-comment.test.ts los controla en todo `*.schema.json`.
 */

/** `$comment` de todo schema publicado. */
export const SCHEMA_COMMENT = 'JDX 1.0. Creado por Agilmind SRL. Condiciones de uso: ver x-jdx-license.';

/** Valor de la anotación `x-jdx-license` de todo schema publicado. */
export interface SchemaLicense {
  readonly spdx: string;
  readonly url: string;
}

export const SCHEMA_LICENSE: SchemaLicense = Object.freeze({
  spdx: 'LicenseRef-Agilmind-JDX',
  url: 'https://github.com/agilmind/jdx/blob/HEAD/LICENSE',
});
