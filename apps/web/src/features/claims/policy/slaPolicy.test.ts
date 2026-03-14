import { describe, expect, it } from 'vitest';

import { deriveClaimSlaPhase } from './slaPolicy';

describe('deriveClaimSlaPhase', () => {
  it('returns not_applicable when the status has no SLA threshold', () => {
    expect(deriveClaimSlaPhase('draft')).toBe('not_applicable');
    expect(deriveClaimSlaPhase('court')).toBe('not_applicable');
    expect(deriveClaimSlaPhase('resolved')).toBe('not_applicable');
    expect(deriveClaimSlaPhase('rejected')).toBe('not_applicable');
  });

  it('returns incomplete when SLA is waiting on missing member information', () => {
    expect(deriveClaimSlaPhase('verification')).toBe('incomplete');
  });

  it('returns running when the SLA is active and not waiting on the member', () => {
    expect(deriveClaimSlaPhase('submitted')).toBe('running');
    expect(deriveClaimSlaPhase('evaluation')).toBe('running');
    expect(deriveClaimSlaPhase('negotiation')).toBe('running');
  });
});
