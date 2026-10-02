/**
 * La declaración contra el nombre del archivo y contra el estado del receptor
 * (JDX-DEC-002 a JDX-DEC-005, del núcleo).
 *
 * - DEC-002: el nombre base del archivo (lo que sigue a la última `/` o `\`)
 *   es `<declaration.id>.r<declaration.revision>.jdx.json`, en minúscula y con
 *   la revisión sin ceros a la izquierda. Es del archivo entero: va en `''`.
 * - Con el estado del receptor (las tres lo piden), su entrada para
 *   declaration.id:
 *   - DEC-003: un recibo de la misma revisión con otro sha256, con cualquier
 *     estado de ack (una revisión rechazada también cuenta). Lleva el sha256
 *     que ya se recibió: el del primer recibo con otro sha256.
 *   - DEC-004: el owner del estado no es declaration.issuer.id.
 *   - DEC-005: la revisión no es mayor que lastIngestedRevision (informativa:
 *     la declaración se ignora).
 */
import type { DeclarationState, Rule, RuleContext } from '../../types.js';

export const DEC_002: Rule = {
  id: 'JDX-DEC-002',
  evaluate(ctx) {
    const { id, revision } = ctx.doc.declaration;
    const fileName = ctx.input.fileName;
    const base = fileName.slice(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
    const expected = `${id}.r${revision}.jdx.json`;
    return base === expected ? [] : [{ ruleId: 'JDX-DEC-002', instanceLocation: '', params: { fileName: base, expected } }];
  },
};

export const DEC_003: Rule = {
  id: 'JDX-DEC-003',
  requires: ['state'],
  evaluate(ctx) {
    const { revision } = ctx.doc.declaration;
    const other = entryOf(ctx)?.receipts.find((r) => r.revision === revision && r.sha256 !== ctx.input.sha256);
    return other === undefined ? [] : [{ ruleId: 'JDX-DEC-003', instanceLocation: '/declaration/revision', params: { revision, sha256: other.sha256 } }];
  },
};

export const DEC_004: Rule = {
  id: 'JDX-DEC-004',
  requires: ['state'],
  evaluate(ctx) {
    const owner = entryOf(ctx)?.owner;
    const issuer = ctx.doc.declaration.issuer.id;
    return owner === undefined || owner === issuer ? [] : [{ ruleId: 'JDX-DEC-004', instanceLocation: '/declaration/issuer/id', params: { owner, issuer } }];
  },
};

export const DEC_005: Rule = {
  id: 'JDX-DEC-005',
  requires: ['state'],
  evaluate(ctx) {
    const last = entryOf(ctx)?.lastIngestedRevision;
    const { revision } = ctx.doc.declaration;
    return last === undefined || revision > last ? [] : [{ ruleId: 'JDX-DEC-005', instanceLocation: '/declaration/revision', params: { revision, lastIngestedRevision: last } }];
  },
};

/** La entrada del estado para la declaración del archivo, si hay estado y la trae. */
function entryOf(ctx: RuleContext): DeclarationState | undefined {
  const declarations = ctx.state?.declarations;
  const id = ctx.doc.declaration.id;
  return declarations !== undefined && Object.hasOwn(declarations, id) ? declarations[id] : undefined;
}
