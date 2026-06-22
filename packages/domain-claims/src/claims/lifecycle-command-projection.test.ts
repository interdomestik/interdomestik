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

  it('uses lifecycle pairs and preserves status fallback for legacy rows', () => {
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
    ).toEqual({
      authority: 'status_fallback',
      success: true,
      caseLifecycleState: 'evaluation',
      recoveryLifecycleState: 'not_started',
      status: 'evaluation',
    });

    expect(
      resolveClaimLifecycleCommandProjection({
        caseLifecycleState: 'resolved',
        recoveryLifecycleState: 'not_started',
      })
    ).toEqual({ success: false, error: 'invalid_lifecycle_pair' });
  });
});
