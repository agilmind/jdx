/**
 * Las rutas de la entrega como texto: lo que JDX-MED-001 controla de cada
 * `path` y cómo se comparan sin distinguir mayúsculas.
 *
 * - Un path válido son segmentos de [A-Za-z0-9._-] separados por `/`, sin
 *   barra inicial y sin segmentos vacíos, `.` ni `..`. pathProblem da el
 *   primer problema: absoluto, un segmento, o caracteres fuera de esos.
 * - foldCase pasa a minúscula solo de A a Z: es la comparación sin
 *   mayúsculas de las rutas de la entrega, igual en cualquier sistema de
 *   archivos y sin depender del idioma. Otra letra no se pliega.
 *
 * Las reglas de la carpeta de la entrega no buscan un path inválido: solo da
 * JDX-MED-001.
 */

export type PathProblem = 'absolute' | 'segment' | 'characters';

const SEGMENT = /^[A-Za-z0-9._-]+$/u;

export function pathProblem(path: string): PathProblem | null {
  if (path.startsWith('/')) return 'absolute';
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return 'segment';
  return segments.every((s) => SEGMENT.test(s)) ? null : 'characters';
}

export function foldCase(path: string): string {
  return path.replace(/[A-Z]+/gu, (upper) => upper.toLowerCase());
}
