/**
 * Los archivos de la carpeta de la entrega que no están declarados
 * (JDX-MED-003, del perfil; pide la carpeta y cuenta en el bucket media).
 *
 * Recorre ctx.media.list(), que ya omite los patrones --ignore del receptor, y
 * no cuenta los artefactos de JDX (`*.jdx.json`, `*.jdx.json.jws`,
 * `*.report.json` y `jdx-trust.json`, a cualquier profundidad y distinguiendo
 * mayúsculas). Una entrada de la carpeta está declarada si un path declarado,
 * de cualquier entrega y válido como texto (sin MED-001), resuelve a ella:
 * - es el path, tal cual;
 * - es el enlace o la carpeta que no se puede leer donde se detiene el path
 *   (el path pasa por ella);
 * - o, sin una entrada exacta, coincide con el path sin distinguir mayúsculas
 *   de A a Z y es un archivo regular con el mismo tamaño y sha256 que el que
 *   resuelve el path (MediaResolver.stat). Así una variante de mayúsculas con
 *   otros bytes nunca pasa por declarada, aunque el receptor ignore la exacta.
 * Cada una de las demás da un resultado en `''`, con params.path.
 */
import { matchDeliveryGlob } from '../../media/glob.js';
import { foldCase, pathProblem } from '../../media/path.js';
import type { Finding, MediaResolver, Rule } from '../../types.js';

/** Los artefactos de JDX que una entrega trae además de sus archivos. */
const ARTIFACTS = ['*.jdx.json', '*.jdx.json.jws', '*.report.json', 'jdx-trust.json'];

type Entry = { path: string; type: 'file' | 'symlink' | 'other' };

/** Cuántos paths se comparan a la vez con sus variantes. */
const AT_ONCE = 16;

export const MED_003: Rule = {
  id: 'JDX-MED-003',
  requires: ['media'],
  async evaluate(ctx) {
    const resolver = ctx.media as MediaResolver;
    const declared = new Set<string>();
    for (const media of ctx.doc.media ?? []) if (media.path !== undefined && pathProblem(media.path) === null) declared.add(media.path);
    const sorted = [...declared].sort();

    const entries: Entry[] = [];
    for await (const entry of resolver.list()) entries.push(entry);
    const listed = new Set(entries.map((e) => e.path));
    const covered = new Set<string>();
    const byFold = new Map<string, Entry[]>();
    for (const entry of entries) {
      if (declared.has(entry.path) || (entry.type !== 'file' && startsAny(sorted, `${entry.path}/`))) covered.add(entry.path);
      else {
        const key = foldCase(entry.path);
        const same = byFold.get(key);
        if (same === undefined) byFold.set(key, [entry]);
        else same.push(entry);
      }
    }
    // Las variantes de mayúsculas de un path sin entrada exacta: declaradas si son el archivo que resuelve el path.
    const pending: { path: string; variants: Entry[] }[] = [];
    for (const path of declared) {
      const variants = listed.has(path) ? [] : (byFold.get(foldCase(path)) ?? []).filter((e) => e.type === 'file');
      if (variants.length > 0) pending.push({ path, variants });
    }
    for (let start = 0; start < pending.length; start += AT_ONCE) {
      const batch = pending.slice(start, start + AT_ONCE);
      for (const same of await Promise.all(batch.map(({ path, variants }) => sameFile(resolver, path, variants)))) for (const path of same) covered.add(path);
    }

    const out: Finding[] = [];
    for (const entry of entries) {
      if (!covered.has(entry.path) && !ARTIFACTS.some((pattern) => matchDeliveryGlob(pattern, entry.path))) {
        out.push({ ruleId: 'JDX-MED-003', instanceLocation: '', params: { path: entry.path } });
      }
    }
    return out;
  },
};

/** Las variantes que son el archivo regular que resuelve el path: mismo tamaño y mismo sha256. */
async function sameFile(resolver: MediaResolver, path: string, variants: readonly Entry[]): Promise<string[]> {
  const target = await resolver.stat(path);
  if (target?.type !== 'file') return [];
  const targetSha = await resolver.sha256(path);
  const same: string[] = [];
  for (const variant of variants) {
    const found = await resolver.stat(variant.path);
    if (found?.type === 'file' && found.size === target.size && (await resolver.sha256(variant.path)) === targetSha) same.push(variant.path);
  }
  return same;
}

/** Si algún texto de la lista ordenada empieza con `prefix` (búsqueda binaria). */
function startsAny(sorted: readonly string[], prefix: string): boolean {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] as string) < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo < sorted.length && (sorted[lo] as string).startsWith(prefix);
}
