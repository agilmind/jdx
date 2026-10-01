/**
 * El reporte de una validación, armado desde sus partes: los resultados, lo
 * que corrió y cómo terminó.
 *
 * - `summary` cuenta los resultados por nivel; `valid` es que no haya errores.
 * - La salida: 3 ante una falla interna (pisa a todas), 2 si falló el entorno,
 *   1 si hay errores o, con failOn warning, avisos; si no, 0. Con salida 2 o 3,
 *   `valid` y `disposition` son null.
 * - `disposition`, después de la salida: `reject` con salida 1; si no,
 *   `ignore` si hay JDX-DEC-005 y hay estado; si no, `ingest`. Sin estado no
 *   hay `ignore`.
 * - Cada bucket de `checks`: `notEvaluated` si no corrió; si corrió, `failed`
 *   con un error de sus reglas, `warning` con un aviso y si no `passed`. La
 *   firma usa `verified` o `absent` en lugar de `passed`, según su estado.
 * - El reporte siempre trae `signature.reason`, `document.issuer` y
 *   `document.media` (null si no hay), y no comparte objetos con las partes.
 *
 * exitCode recalcula solo la salida de un reporte, con otro failOn, para
 * mostrarla; el reporte no cambia.
 */
import type { CheckName, CheckStatus, Disposition, ExitCode, FailOn, Report, ReportParts, Result } from '../types.js';
import { catalogRule, sortResults } from './results.js';

const CHECKS: readonly CheckName[] = Object.freeze(['environment', 'json', 'schema', 'core', 'profile', 'policy', 'media', 'signature']);
const JDX_SUFFIX = '.jdx.json';

export function buildReport(parts: ReportParts): Report {
  const results = sortResults(parts.results, parts.catalog).map((r) => structuredClone(r));
  const summary = { error: 0, warning: 0, info: 0 };
  for (const r of results) summary[r.level]++;
  const completed = parts.outcome === 'completed';
  const code: ExitCode = parts.outcome === 'internal' ? 3 : parts.outcome === 'environment' ? 2 : fileExit(summary, parts.options.failOn);
  let disposition: Disposition | null = null;
  if (completed) {
    disposition = code === 1 ? 'reject' : parts.hasState && results.some((r) => r.ruleId === 'JDX-DEC-005') ? 'ignore' : 'ingest';
  }
  const document = structuredClone(parts.document);
  return {
    jdxReport: '1.0',
    valid: completed ? summary.error === 0 : null,
    disposition,
    exitCode: code,
    validator: structuredClone(parts.validator),
    options: structuredClone(parts.options),
    document: { ...document, issuer: document.issuer ?? null, media: document.media ?? null },
    appliedProfiles: [...parts.appliedProfiles],
    checks: checks(parts, results),
    signature: { ...structuredClone(parts.signature), reason: parts.signature.reason ?? null },
    trustList: parts.trustList === null ? null : { ...parts.trustList },
    summary,
    results,
  };
}

/** La salida del reporte con `failOn` (por defecto, el que se usó); 2 y 3 no cambian. */
export function exitCode(report: Report, failOn: FailOn = report.options.failOn): ExitCode {
  if (report.exitCode === 2 || report.exitCode === 3) return report.exitCode;
  return fileExit(report.summary, failOn);
}

/** El nombre del reporte: el nombre base del archivo sin `.jdx.json`, más `.report.json`. */
export function reportFileName(fileName: string): string {
  const base = fileName.slice(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
  return `${base.endsWith(JDX_SUFFIX) ? base.slice(0, -JDX_SUFFIX.length) : base}.report.json`;
}

function fileExit(summary: Report['summary'], failOn: FailOn): ExitCode {
  return summary.error > 0 || (failOn === 'warning' && summary.warning > 0) ? 1 : 0;
}

function checks(parts: ReportParts, results: readonly Result[]): Record<CheckName, CheckStatus> {
  const out = {} as Record<CheckName, CheckStatus>;
  for (const name of CHECKS) {
    const levels = new Set(results.filter((r) => catalogRule(parts.catalog, r.ruleId).check === name).map((r) => r.level));
    if (!parts.evaluated.has(name)) out[name] = 'notEvaluated';
    else if (levels.has('error')) out[name] = 'failed';
    else if (levels.has('warning')) out[name] = 'warning';
    else if (name === 'signature') out[name] = signatureCheck(parts.signature.status);
    else out[name] = 'passed';
  }
  return out;
}

/** El bucket de la firma sin errores ni avisos: lo dice el estado de la firma. */
function signatureCheck(status: ReportParts['signature']['status']): CheckStatus {
  if (status === 'verified' || status === 'absent' || status === 'notEvaluated') return status;
  return 'failed';
}
