/**
 * Los archivos de la carpeta de la entrega que no están declarados
 * (JDX-MED-003, del perfil; pide la carpeta y cuenta en el bucket media).
 *
 * Recorre ctx.media.list(), que ya omite los patrones --ignore del receptor, y
 * no cuenta los artefactos de JDX: los archivos regulares de la raíz que se
 * llaman como una declaración, su firma o su reporte
 * (`<uuid>.r<n>.jdx.json`, `<uuid>.r<n>.jdx.json.jws`,
 * `<uuid>.r<n>.report.json`) y `jdx-trust.json`. Nada de una carpeta, ni un
 * enlace, un fifo o una carpeta con esos nombres, es un artefacto. Una entrada
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
 * Cada una de las demás da un resultado en `''`, con params.path.
 */
import { foldCase } from '../../media/path.js';
import type { Finding, MediaResolver, Rule } from '../../types.js';
import { locate } from '../core/mediaDir.js';

/** Los nombres de la declaración, su firma y su reporte en la raíz de la entrega. */
const ARTIFACT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.r[1-9][0-9]*\.(?:jdx\.json(?:\.jws)?|report\.json)$/u;

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

    const out: Finding[] = [];
    const pending: Promise<void>[] = [];
    const judge = async (entry: Entry): Promise<void> => {
      if (!(await sameFileAs(resolver, entry, targets.get(foldCase(entry.path)) ?? []))) out.push(finding(entry));
    };
    for await (const entry of resolver.list()) {
      if (declared.has(entry.path) || isArtifact(entry)) continue;
      if (entry.type !== 'file') {
        if (!stops.has(entry.path)) out.push(finding(entry));
        continue;
      }
      pending.push(judge(entry));
      if (pending.length >= AT_ONCE) await Promise.all(pending.splice(0));
    }
    await Promise.all(pending);
    // Las variantes se comparan a la vez: el orden es el de las rutas.
    return out.sort((a, b) => ((a.params?.path as string) < (b.params?.path as string) ? -1 : 1));
  },
};

function finding(entry: Entry): Finding {
  return { ruleId: 'JDX-MED-003', instanceLocation: '', params: { path: entry.path } };
}

/** Un artefacto de JDX: un archivo regular de la raíz con el nombre de una declaración, su firma o su reporte, o jdx-trust.json. */
function isArtifact(entry: Entry): boolean {
  return entry.type === 'file' && (entry.path === 'jdx-trust.json' || ARTIFACT.test(entry.path));
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
