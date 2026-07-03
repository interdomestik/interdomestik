import { describe, expect, it } from 'vitest';

import { CLAIM_STATUS_LIFECYCLE_STATE_MAP } from './lifecycle-state';
import { resolveClaimLifecycleCommandProjection } from './lifecycle-read-model';

describe('claim lifecycle command projection map', () => {
  it('keeps every status mapped to a unique lifecycle pair', () => {
    const pairKeys = Object.values(CLAIM_STATUS_LIFECYCLE_STATE_MAP).map(
      pair => `${pair.caseLifecycleState}:${pair.recoveryLifecycleState}`
    );

    expect(new Set(pairKeys).size).toBe(pairKeys.length);
  });

  it('uses lifecycle pairs and rejects legacy status fallback for command authority', () => {
    expect(
      resolveClaimLifecycleCommandProjection({
        caseLifecycleState: 'recovery',
        recoveryLifecycleState: 'court',
      })
    ).toEqual({
      authority: 'lifecycle',
      success: true,
      caseLifecycleState: 'recovery',
      recoveryLifecycleState: 'court',
      status: 'court',
    });

    expect(
      resolveClaimLifecycleCommandProjection({
        caseLifecycleState: null,
        recoveryLifecycleState: null,
      })
    ).toEqual({ success: false, error: 'invalid_lifecycle_state' });

    expect(
      resolveClaimLifecycleCommandProjection({
        caseLifecycleState: null,
        recoveryLifecycleState: null,
        status: 'evaluation',
      })
    ).toEqual({ success: false, error: 'invalid_lifecycle_state' });

    expect(
      resolveClaimLifecycleCommandProjection({
        caseLifecycleState: 'resolved',
        recoveryLifecycleState: 'not_started',
      })
    ).toEqual({ success: false, error: 'invalid_lifecycle_pair' });
  });
});
