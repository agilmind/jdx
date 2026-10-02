/**
 * Los archivos de la entrega contra su carpeta y contra el estado del
 * receptor (JDX-MED-002, -006, -007 y -008, del núcleo).
 *
 * Con la carpeta (las tres piden media; cuentan en el bucket media), cada
 * archivo con un path válido como texto (sin el MED-001 de un absoluto, un
 * segmento o un carácter) y delivered distinto de false se busca en ella:
 * - MED-007: no está, y viaja en esta revisión (delivery igual a revision).
 * - MED-008: está, y no es un archivo regular o es un enlace.
 * - MED-002: es un archivo regular con otro tamaño o, si el tamaño coincide o
 *   no se declaró, con otro sha256: un resultado por archivo, con
 *   params.field. Sin size ni sha256 no se compara.
 * Con el estado (MED-006 lo pide; cuenta en core), cada archivo de una
 * entrega anterior (delivery menor que revision): el estado lo registra, por
 * path sin distinguir mayúsculas, con otro size o sha256 (changed), o no lo
 * registra y no está en la carpeta (notFound). Sin carpeta, no estar en el
 * estado es no estar.
 *
 * Cada archivo se busca una vez por validación, aunque lo miren varias
 * reglas, y su sha256 se calcula solo si hace falta.
 */
import type { Media } from '../../generated/jdx-types.js';
import { foldCase, pathProblem } from '../../media/path.js';
import type { Finding, MediaRecord, MediaResolver, Rule, RuleContext } from '../../types.js';

/** Un archivo declarado que se busca en la carpeta, con lo que dio stat. */
interface Located {
  index: number;
  media: Media & { path: string };
  found: Awaited<ReturnType<MediaResolver['stat']>>;
}

/** Cuántos archivos se buscan a la vez. */
const AT_ONCE = 16;

const located = new WeakMap<RuleContext, Promise<readonly Located[]>>();

/** Los archivos de la carpeta que se buscan, cada uno una vez por validación. */
function locate(ctx: RuleContext): Promise<readonly Located[]> {
  let found = located.get(ctx);
  if (found === undefined) {
    found = locateAll(ctx.media, lookedUp(ctx));
    located.set(ctx, found);
  }
  return found;
}

/** Los archivos que viajan con un path válido, con su índice. */
function lookedUp(ctx: RuleContext): { index: number; media: Media & { path: string } }[] {
  const out: { index: number; media: Media & { path: string } }[] = [];
  (ctx.doc.media ?? []).forEach((media, index) => {
    if (media.delivered !== false && media.path !== undefined && pathProblem(media.path) === null) out.push({ index, media: media as Media & { path: string } });
  });
  return out;
}

async function locateAll(resolver: MediaResolver | null, wanted: readonly { index: number; media: Media & { path: string } }[]): Promise<readonly Located[]> {
  if (resolver === null) return [];
  const out: Located[] = [];
  for (let start = 0; start < wanted.length; start += AT_ONCE) {
    const batch = wanted.slice(start, start + AT_ONCE);
    const stats = await Promise.all(batch.map(({ media }) => resolver.stat(media.path)));
    batch.forEach((item, k) => out.push({ ...item, found: stats[k] ?? null }));
  }
  return out;
}

function finding(ruleId: Finding['ruleId'], item: { index: number; media: Media & { path: string } }, at: string, params: Finding['params']): Finding {
  return { ruleId, instanceLocation: `/media/${item.index}/${at}`, context: { media: item.media.id }, params: { path: item.media.path, ...params } };
}

export const MED_002: Rule = {
  id: 'JDX-MED-002',
  requires: ['media'],
  async evaluate(ctx) {
    const resolver = ctx.media as MediaResolver;
    // Con otro tamaño ya no coincide; si no, el sha256, de a varios archivos a la vez.
    const compared = (await locate(ctx)).filter((item) => item.found?.type === 'file' && (item.media.size !== undefined || item.media.sha256 !== undefined));
    const field: ('size' | 'sha256' | null)[] = [];
    for (let start = 0; start < compared.length; start += AT_ONCE) {
      const batch = compared.slice(start, start + AT_ONCE);
      field.push(...(await Promise.all(batch.map(async ({ media, found }) => {
        if (media.size !== undefined && found?.size !== media.size) return 'size' as const;
        return media.sha256 !== undefined && (await resolver.sha256(media.path)) !== media.sha256 ? ('sha256' as const) : null;
      }))));
    }
    const out: Finding[] = [];
    compared.forEach((item, k) => {
      const which = field[k];
      if (which !== null && which !== undefined) out.push(finding('JDX-MED-002', item, which, { field: which }));
    });
    return out;
  },
};

export const MED_007: Rule = {
  id: 'JDX-MED-007',
  requires: ['media'],
  async evaluate(ctx) {
    const { revision } = ctx.doc.declaration;
    return (await locate(ctx)).filter((item) => item.found === null && item.media.delivery === revision).map((item) => finding('JDX-MED-007', item, 'path', {}));
  },
};

export const MED_008: Rule = {
  id: 'JDX-MED-008',
  requires: ['media'],
  async evaluate(ctx) {
    return (await locate(ctx)).filter((item) => item.found !== null && item.found.type !== 'file').map((item) => finding('JDX-MED-008', item, 'path', {}));
  },
};

export const MED_006: Rule = {
  id: 'JDX-MED-006',
  requires: ['state'],
  async evaluate(ctx) {
    const { id, revision } = ctx.doc.declaration;
    const declarations = ctx.state?.declarations ?? {};
    const recorded = new Map<string, MediaRecord>();
    for (const record of Object.hasOwn(declarations, id) ? (declarations[id]?.media ?? []) : []) {
      if (!recorded.has(foldCase(record.path))) recorded.set(foldCase(record.path), record);
    }
    const previous = lookedUp(ctx).filter(({ media }) => media.delivery !== undefined && media.delivery < revision);
    if (previous.length === 0) return [];
    const inFolder = new Set((await locate(ctx)).filter((item) => item.found !== null).map((item) => item.index));
    const out: Finding[] = [];
    for (const item of previous) {
      const record = recorded.get(foldCase(item.media.path));
      const { size, sha256 } = item.media;
      if (record !== undefined) {
        if ((size !== undefined && size !== record.size) || (sha256 !== undefined && sha256 !== record.sha256)) out.push(finding('JDX-MED-006', item, 'path', { reason: 'changed' }));
      } else if (!inFolder.has(item.index)) {
        out.push(finding('JDX-MED-006', item, 'path', { reason: 'notFound' }));
      }
    }
    return out;
  },
};
