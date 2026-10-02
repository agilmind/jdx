/**
 * Los archivos de la entrega que se controlan sin su carpeta (JDX-MED-001,
 * JDX-MED-004 y JDX-MED-009, del núcleo; cuentan en el bucket core).
 *
 * - MED-001: el texto de cada path (src/media/path.ts): absoluto, con un
 *   segmento vacío, `.` o `..`, con caracteres fuera de [A-Za-z0-9._-], o
 *   igual a uno anterior sin distinguir mayúsculas. Un resultado por archivo,
 *   con el primer problema; el repetido es el segundo y los que siguen.
 * - MED-004: delivery mayor que la revisión de la declaración.
 * - MED-009: el sha256 de un anexo (evidence.annexed) o del depósito
 *   (edition.deposit) distinto del sha256 del archivo al que apunta, con el
 *   context de ese archivo. Sin el archivo, sin su sha256 o con una
 *   referencia que no resuelve (ya tiene su JDX-REF-002), no se evalúa.
 *
 * Cada hallazgo de MED-001 y MED-004 va en el dato, con el id del archivo en
 * context.media.
 */
import { foldCase, pathProblem } from '../../media/path.js';
import type { Finding, Rule } from '../../types.js';

export const MED_001: Rule = {
  id: 'JDX-MED-001',
  evaluate(ctx) {
    const out: Finding[] = [];
    const seen = new Set<string>();
    (ctx.doc.media ?? []).forEach((media, i) => {
      if (media.path === undefined) return;
      let reason: string | null = pathProblem(media.path);
      if (reason === null) {
        const folded = foldCase(media.path);
        if (seen.has(folded)) reason = 'duplicate';
        else seen.add(folded);
      }
      if (reason !== null) out.push({ ruleId: 'JDX-MED-001', instanceLocation: `/media/${i}/path`, context: { media: media.id }, params: { path: media.path, reason } });
    });
    return out;
  },
};

export const MED_004: Rule = {
  id: 'JDX-MED-004',
  evaluate(ctx) {
    const { revision } = ctx.doc.declaration;
    const out: Finding[] = [];
    (ctx.doc.media ?? []).forEach((media, i) => {
      if (media.delivery !== undefined && media.delivery > revision) {
        out.push({ ruleId: 'JDX-MED-004', instanceLocation: `/media/${i}/delivery`, context: { media: media.id }, params: { delivery: media.delivery, revision } });
      }
    });
    return out;
  },
};

export const MED_009: Rule = {
  id: 'JDX-MED-009',
  evaluate(ctx) {
    const out: Finding[] = [];
    const check = (pointer: string, ref: string | undefined, sha256: string | undefined): void => {
      if (ref === undefined || sha256 === undefined) return;
      const declared = ctx.index.get('media', ref)?.obj.sha256;
      if (typeof declared === 'string' && declared !== sha256) out.push({ ruleId: 'JDX-MED-009', instanceLocation: pointer, context: { media: ref } });
    };
    (ctx.doc.media ?? []).forEach((media, i) => {
      (media.evidence?.annexed ?? []).forEach((annexed, j) => check(`/media/${i}/evidence/annexed/${j}/sha256`, annexed.media, annexed.sha256));
    });
    const deposit = ctx.doc.edition?.deposit;
    if (deposit !== undefined) check('/edition/deposit/sha256', deposit.copy, deposit.sha256);
    return out;
  },
};
