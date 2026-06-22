import { describe, expect, it } from 'vitest';

import { CLAIM_STATUS_LIFECYCLE_STATE_MAP } from './lifecycle-state';
import {
  resolveClaimLifecycleCommandProjection,
  resolveClaimLifecycleReadProjection,
} from './lifecycle-read-model';

describe('claim lifecycle command projection map', () => {
  it('keeps every status mapped to a unique lifecycle pair', () => {
    const pairKeys = Object.values(CLAIM_STATUS_LIFECYCLE_STATE_MAP).map(
      pair => `${pair.caseLifecycleState}:${pair.recoveryLifecycleState}`
    );

    expect(new Set(pairKeys).size).toBe(pairKeys.length);
  });

  it('requires valid lifecycle values and pairs without status fallback', () => {
    expect(
      resolveClaimLifecycleCommandProjection({
        caseLifecycleState: 'recovery',
        recoveryLifecycleState: 'court',
      })
    ).toEqual({
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
        caseLifecycleState: 'resolved',
        recoveryLifecycleState: 'not_started',
      })
    ).toEqual({ success: false, error: 'invalid_lifecycle_pair' });
  });
});

describe('resolveClaimLifecycleReadProjection', () => {
  it('keeps lifecycle states authoritative when they match compat status', () => {
    expect(
      resolveClaimLifecycleReadProjection({
        caseLifecycleState: 'recovery',
        recoveryLifecycleState: 'negotiation',
        status: 'negotiation',
      })
    ).toEqual({
      authority: 'lifecycle',
      caseLifecycleState: 'recovery',
      consistency: 'consistent',
      recoveryLifecycleState: 'negotiation',
      status: 'negotiation',
    });
  });

  it('falls back from status for legacy rows with null lifecycle fields', () => {
    expect(
      resolveClaimLifecycleReadProjection({
        caseLifecycleState: null,
        recoveryLifecycleState: null,
        status: 'evaluation',
      })
    ).toEqual({
      authority: 'status_fallback',
      ...CLAIM_STATUS_LIFECYCLE_STATE_MAP.evaluation,
      consistency: 'consistent',
      status: 'evaluation',
    });
  });

  it('uses lifecycle fields over mismatched compat status', () => {
    expect(
      resolveClaimLifecycleReadProjection({
        caseLifecycleState: 'recovery',
        recoveryLifecycleState: 'court',
        status: 'evaluation',
      })
    ).toMatchObject({
      authority: 'lifecycle',
      caseLifecycleState: 'recovery',
      consistency: 'status_mismatch',
      recoveryLifecycleState: 'court',
      status: 'court',
    });
  });

  it('marks valid lifecycle values that do not form a compat status pair', () => {
    expect(
      resolveClaimLifecycleReadProjection({
        caseLifecycleState: 'resolved',
        recoveryLifecycleState: 'not_started',
        status: 'submitted',
      })
    ).toEqual({
      authority: 'lifecycle',
      caseLifecycleState: 'resolved',
      consistency: 'invalid_lifecycle_pair',
      recoveryLifecycleState: 'not_started',
      status: 'submitted',
    });
  });

  it('falls back deterministically for invalid status and missing lifecycle state', () => {
    expect(
      resolveClaimLifecycleReadProjection({
        caseLifecycleState: undefined,
        recoveryLifecycleState: undefined,
        status: 'in_review',
      })
    ).toEqual({
      authority: 'status_fallback',
      caseLifecycleState: 'draft',
      consistency: 'consistent',
      recoveryLifecycleState: 'not_started',
      status: 'draft',
    });
  });

  it('falls back to draft when legacy status and lifecycle fields are all null', () => {
    expect(
      resolveClaimLifecycleReadProjection({
        caseLifecycleState: null,
        recoveryLifecycleState: null,
        status: null,
      })
    ).toEqual({
      authority: 'status_fallback',
      caseLifecycleState: 'draft',
      consistency: 'consistent',
      recoveryLifecycleState: 'not_started',
      status: 'draft',
    });
  });
});
