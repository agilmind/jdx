/**
 * Los archivos de la carpeta de la entrega que no están declarados
 * (JDX-MED-003, del perfil; pide la carpeta y cuenta en el bucket media).
 *
 * Recorre ctx.media.list(), que ya omite los patrones --ignore del receptor, y
 * no cuenta los artefactos de esta declaración: los archivos regulares de la
 * raíz que se llaman como ella, su firma o su reporte, en cualquier revisión
 * (`<id>.r<n>.jdx.json`, `<id>.r<n>.jdx.json.jws`, `<id>.r<n>.report.json`,
 * con su declaration.id), y `jdx-trust.json`. Los de otra declaración no son
 * artefactos, ni nada de una carpeta, ni un enlace, un fifo o una carpeta con
 * esos nombres. MED-003 corre solo con el documento leído. Una entrada
 * está declarada si un path declarado, de cualquier entrega y válido como
 * texto (sin MED-001), resuelve a ella (MediaResolver.stat):
 * - es el path, tal cual;
 * - es el enlace u otra entrada que no es un archivo donde termina el path (su
 *   MED-008 ya lo dice); un fifo o un archivo por el que el path tendría que
 *   seguir no lo detiene: el path no está;
 * - o coincide con el path sin distinguir mayúsculas de A a Z y es el archivo
 *   regular que resuelve el path, o uno con su tamaño y su sha256. Así una
 *   variante de mayúsculas con otros bytes nunca pasa por declarada, aunque
 *   el receptor ignore la exacta.
 * Cada una de las demás da un resultado en `''`, con params.path. Guarda solo
 * los primeros que lista el reporte y cuenta los demás (firstFindings): la
 * memoria no crece con los archivos de la carpeta.
 */
import { foldCase } from '../../media/path.js';
import { settleAll } from '../../media/settle.js';
import { firstFindings } from '../../report/results.js';
import type { Finding, MediaResolver, Rule } from '../../types.js';
import { locate } from '../core/mediaDir.js';

/** Lo que sigue al id en los nombres de la declaración, su firma y su reporte: la revisión y la extensión. */
const ARTIFACT = /^\.r[1-9][0-9]*\.(?:jdx\.json(?:\.jws)?|report\.json)$/u;

type Entry = { path: string; type: 'file' | 'symlink' | 'other' };
/** El archivo regular que resuelve un path declarado: dónde está y su tamaño. */
type Target = { at: string; size: number; declared: string };

/** Cuántas variantes se comparan a la vez. */
const AT_ONCE = 16;

export const MED_003: Rule = {
  id: 'JDX-MED-003',
  requires: ['media'],
  async evaluate(ctx) {
    const resolver = ctx.media as MediaResolver;
    // Dónde termina cada path declarado (buscado una vez para todas las reglas de la carpeta): la entrada que no es
    // un archivo, o el archivo regular, por sus mayúsculas plegadas.
    const declared = new Set<string>();
    const stops = new Set<string>();
    const targets = new Map<string, Target[]>();
    for (const { media: { path }, found: end } of await locate(ctx)) {
      declared.add(path);
      if (end === null) continue;
      if (end.type !== 'file') for (const at of end.path === undefined ? prefixes(path) : [end.path]) stops.add(at);
      else {
        const key = foldCase(path);
        targets.set(key, [...(targets.get(key) ?? []), { at: end.path ?? path, size: end.size, declared: path }]);
      }
    }

    // De los no declarados se guardan solo los primeros en el orden del reporte; los demás se cuentan.
    const out = firstFindings();
    // Las variantes se comparan de a varias mientras sigue la lista: cada falla queda tomada al empezar, y si algo
    // falla, MED-003 falla después de que terminan las comparaciones que ya empezaron.
    const pending: Promise<void>[] = [];
    const judge = (entry: Entry): void => {
      const work = sameFileAs(resolver, entry, targets.get(foldCase(entry.path)) ?? []).then((same) => {
        if (!same) out.add(finding(entry));
      });
      work.catch(() => undefined);
      pending.push(work);
    };
    try {
      for await (const entry of resolver.list()) {
        if (declared.has(entry.path) || isArtifact(entry, ctx.doc.declaration.id)) continue;
        if (entry.type !== 'file') {
          if (!stops.has(entry.path)) out.add(finding(entry));
        } else if (targets.has(foldCase(entry.path))) {
          judge(entry);
          if (pending.length >= AT_ONCE) await settleAll(pending.splice(0));
        } else {
          out.add(finding(entry));
        }
      }
    } catch (error) {
      await Promise.allSettled(pending);
      throw error;
    }
    await settleAll(pending);
    return out.result();
  },
};

function finding(entry: Entry): Finding {
  return { ruleId: 'JDX-MED-003', instanceLocation: '', params: { path: entry.path } };
}

/** Un artefacto de esta declaración: un archivo regular de la raíz con su nombre, el de su firma o su reporte, o jdx-trust.json. */
function isArtifact(entry: Entry, id: string): boolean {
  if (entry.type !== 'file') return false;
  return entry.path === 'jdx-trust.json' || (entry.path.startsWith(id) && ARTIFACT.test(entry.path.slice(id.length)));
}

/** Si el archivo es el que resuelve un path declarado con esas mayúsculas, o uno con su tamaño y su sha256. */
async function sameFileAs(resolver: MediaResolver, entry: Entry, targets: readonly Target[]): Promise<boolean> {
  if (targets.length === 0) return false;
  if (targets.some((t) => t.at === entry.path)) return true;
  const found = await resolver.stat(entry.path);
  if (found?.type !== 'file') return false;
  for (const target of targets) {
    if (target.size === found.size && (await resolver.sha256(entry.path)) === (await resolver.sha256(target.declared))) return true;
  }
  return false;
}

/** Un path y cada uno de sus prefijos de segmentos: dónde puede terminar, si el resolver no lo dice. */
function prefixes(path: string): string[] {
  const out: string[] = [];
  for (let i = path.indexOf('/'); i >= 0; i = path.indexOf('/', i + 1)) out.push(path.slice(0, i));
  out.push(path);
  return out;
}
