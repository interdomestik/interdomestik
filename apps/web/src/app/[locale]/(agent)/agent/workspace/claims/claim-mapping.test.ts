import { describe, expect, it } from 'vitest';
import { mapToAgentProClaim, type ClaimRow } from './claim-mapping';

describe('agent claim number mapping', () => {
  it.each([null, '', '   '])('preserves a missing number (%s) for title fallback', claimNumber => {
    const row: ClaimRow = {
      id: 'GOLDEN_K_INTERNAL',
      title: 'Property damage claim',
      claimNumber,
      caseLifecycleState: 'submitted',
      recoveryLifecycleState: 'not_started',
      createdAt: null,
      updatedAt: null,
    };
    expect(mapToAgentProClaim(row)).toMatchObject({ claimNumber: null, title: row.title });
  });
});
