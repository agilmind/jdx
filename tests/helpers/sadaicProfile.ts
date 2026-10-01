/**
 * El perfil sadaic/0.1 completo, literal: sociedad 061, firma opcional, todas
 * las reglas como aviso, 35 reglas (JDX-IDN-004 no entra) y los params de
 * cada una. Cada llamada da un objeto nuevo, para que un test lo modifique
 * sin tocar a otro.
 */
import type { Profile } from '../../src/types.js';

export function sadaicProfile(): Profile {
  return {
    id: 'https://jdx.jupiter.ar/profiles/sadaic/0.1', version: '0.1.0', jdx: '1.x',
    catalog: '1.0', requiresValidator: '>=1.0.0 <2.0.0', society: '061',
    signature: 'optional', defaultLevel: 'warning',
    rules: [
      { ruleId: 'JDX-DEC-001' },
      { ruleId: 'JDX-SHR-002' },
      { ruleId: 'JDX-SHR-004' },
      { ruleId: 'JDX-SHR-006' },
      { ruleId: 'JDX-SHR-007' },
      { ruleId: 'JDX-SHR-008' },
      { ruleId: 'JDX-AGR-001' },
      { ruleId: 'JDX-AGR-002' },
      { ruleId: 'JDX-AGR-003', params: { cap: 25, capWithCondition: { value: 33.3333, conditionScheme: 'SADAIC_ART8' } } },
      { ruleId: 'JDX-AGR-004', params: { types: ['publishing'] } },
      { ruleId: 'JDX-AGR-005' },
      { ruleId: 'JDX-AGR-006', params: { retailMin: 20, arrangementRetailMin: 10 } },
      { ruleId: 'JDX-WRK-001' },
      { ruleId: 'JDX-ROL-001' },
      { ruleId: 'JDX-MIN-001', params: { ageOfMajority: 18 } },
      { ruleId: 'JDX-IDN-001' },
      { ruleId: 'JDX-IDN-002' },
      { ruleId: 'JDX-IDN-003' },
      { ruleId: 'JDX-IDN-005' },
      { ruleId: 'JDX-IDN-006' },
      { ruleId: 'JDX-TER-001' },
      { ruleId: 'JDX-SOC-001' },
      { ruleId: 'JDX-CLS-001' },
      { ruleId: 'JDX-REF-003' },
      { ruleId: 'JDX-REF-004' },
      { ruleId: 'JDX-EDN-001' },
      { ruleId: 'JDX-MED-003' },
      { ruleId: 'JDX-MED-010' },
      { ruleId: 'JDX-CMP-001' },
      { ruleId: 'JDX-CMP-002', params: { scheme: 'SADAIC_GENRE' } },
      { ruleId: 'JDX-CMP-003', params: { registry: 'DNDA_AR' } },
      { ruleId: 'JDX-CMP-004' },
      { ruleId: 'JDX-CMP-005' },
      { ruleId: 'JDX-CMP-006', params: { country: 'AR' } },
      { ruleId: 'JDX-CMP-007' },
    ],
  };
}

/** Los params de una regla en sadaic/0.1, o `{}` si no lleva. */
export function sadaicParams(ruleId: string): NonNullable<Profile['rules'][number]['params']> {
  return sadaicProfile().rules.find((r) => r.ruleId === ruleId)?.params ?? {};
}
