/**
 * La carpeta de la entrega que el validador no puede usar. validate la
 * devuelve como JDX-ENV-011 (salida 2): ni aceptar ni rechazar la declaración
 * es seguro, porque lo que no se puede leer podría esconder archivos no
 * declarados. El receptor lo corrige y vuelve a validar.
 *
 * `reason` es params.cause del resultado: la carpeta no existe (`missingDir`)
 * o no es una carpeta (`notDirectory`); falta permiso para leer algo de
 * adentro (`permission`); una ruta es más larga de lo que admite el sistema
 * (`tooLong`); otra falla del disco (`io`); o la carpeta cambió mientras se
 * leía (`modified`). `path` es dónde, relativo a la carpeta ('' es la carpeta
 * misma), como lo da list().
 *
 * Un MediaResolver propio la lanza igual: validate la toma en el paso de
 * entorno (MediaResolver.check) o mientras corren las reglas.
 */

export type MediaFolderCause = 'missingDir' | 'notDirectory' | 'permission' | 'tooLong' | 'io' | 'modified';

/** Las causas, en el orden del catálogo. */
export const MEDIA_FOLDER_CAUSES: readonly MediaFolderCause[] = Object.freeze(['missingDir', 'notDirectory', 'permission', 'tooLong', 'io', 'modified']);

const MESSAGES: Readonly<Record<MediaFolderCause, string>> = Object.freeze({
  missingDir: 'no existe',
  notDirectory: 'no es una carpeta',
  permission: 'falta permiso para leer',
  tooLong: 'una ruta es más larga de lo que admite el sistema',
  io: 'falla el disco',
  modified: 'cambió mientras se leía',
});

export class MediaFolderError extends Error {
  override readonly name = 'MediaFolderError';

  constructor(
    readonly reason: MediaFolderCause,
    readonly path: string,
    options?: { cause?: unknown },
  ) {
    super(`la carpeta de la entrega no se puede usar: ${MESSAGES[reason]} (${path === '' ? 'la carpeta' : path})`, options);
  }
}

/**
 * La falla de la carpeta que corresponde a un error del sistema de archivos en
 * `path`: sin permiso, un nombre largo, algo que dejó de estar (`modified` si
 * se había visto; `missingDir` si es la raíz), u otra falla del disco. Lo que
 * no es un error del sistema de archivos se devuelve tal cual: no es de la
 * carpeta.
 */
export function folderFailure(error: unknown, path: string, seen: boolean): unknown {
  if (error instanceof MediaFolderError) return error;
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (typeof code !== 'string' || !(error instanceof Error)) return error;
  const reason: MediaFolderCause =
    code === 'EACCES' || code === 'EPERM' ? 'permission'
      : code === 'ENAMETOOLONG' ? 'tooLong'
        : code === 'ENOENT' || code === 'ENOTDIR' || code === 'ELOOP' ? (seen ? 'modified' : 'missingDir')
          : 'io';
  return new MediaFolderError(reason, path, { cause: error });
}
