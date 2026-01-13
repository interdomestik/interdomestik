// Phase 2.8: Priority Sort Unit Tests
import { describe, expect, it } from 'vitest';

import { computePriorityScore, sortByPriority } from '../../../server/prioritySort';
import type { ClaimOperationalRow } from '../../../types';
import { isStaffOwnedStatus } from '../../../types';

// Test helper to create minimal claim row
function createClaimRow(overrides: Partial<ClaimOperationalRow>): ClaimOperationalRow {
  return {
    id: 'test-id',
    code: 'TEST1234',
    title: 'Test Claim',
    lifecycleStage: 'processing',
    stageStartedAt: new Date(),
    daysInStage: 5,
    ownerRole: 'staff',
    ownerName: null,
    assigneeId: null,
    isStuck: false,
    hasSlaBreach: false,
    isUnassigned: false,
    waitingOn: 'staff',
    hasCashPending: false,
    memberName: 'Test User',
    memberEmail: 'test@example.com',
    branchCode: 'BR001',
    agentName: null,
    category: null,
    status: 'evaluation',
    originType: 'portal',
    originRefId: null,
    originDisplayName: null,
    claimNumber: 'CLM-TEST',
    memberId: 'member-123',
    memberNumber: 'MEM-2026-0001',
    ...overrides,
  };
}

describe('isStaffOwnedStatus', () => {
  it('returns true for submitted', () => {
    expect(isStaffOwnedStatus('submitted')).toBe(true);
  });

  it('returns true for evaluation', () => {
    expect(isStaffOwnedStatus('evaluation')).toBe(true);
  });

  it('returns true for negotiation', () => {
    expect(isStaffOwnedStatus('negotiation')).toBe(true);
  });

  it('returns true for court', () => {
    expect(isStaffOwnedStatus('court')).toBe(true);
  });

  it('returns false for member-owned statuses', () => {
    expect(isStaffOwnedStatus('draft')).toBe(false);
    expect(isStaffOwnedStatus('verification')).toBe(false);
  });

  it('returns false for system-owned statuses', () => {
    expect(isStaffOwnedStatus('resolved')).toBe(false);
    expect(isStaffOwnedStatus('rejected')).toBe(false);
  });
});

describe('computePriorityScore', () => {
  it('SLA breach adds 1000 points', () => {
    const claim = createClaimRow({ hasSlaBreach: true });
    const score = computePriorityScore(claim);
    expect(score).toBeGreaterThanOrEqual(1000);
  });

  it('unassigned staff-owned adds 500 points', () => {
    const claim = createClaimRow({
      isUnassigned: true,
      status: 'evaluation',
      hasSlaBreach: false,
      isStuck: false,
      daysInStage: 0,
    });
    expect(computePriorityScore(claim)).toBe(500);
  });

  it('unassigned non-staff-owned does not add 500 points', () => {
    const claim = createClaimRow({
      isUnassigned: true,
      status: 'verification',
      hasSlaBreach: false,
      isStuck: false,
      daysInStage: 0,
    });
    expect(computePriorityScore(claim)).toBe(0);
  });

  it('stuck adds 250 points', () => {
    const claim = createClaimRow({
      isStuck: true,
      hasSlaBreach: false,
      isUnassigned: false,
      daysInStage: 0,
    });
    expect(computePriorityScore(claim)).toBe(250);
  });

  it('daysInStage adds up to 100 points', () => {
    const claim = createClaimRow({
      daysInStage: 50,
      hasSlaBreach: false,
      isUnassigned: false,
      isStuck: false,
    });
    expect(computePriorityScore(claim)).toBe(50);
  });

  it('daysInStage is capped at 100', () => {
    const claim = createClaimRow({
      daysInStage: 200,
      hasSlaBreach: false,
      isUnassigned: false,
      isStuck: false,
    });
    expect(computePriorityScore(claim)).toBe(100);
  });

  it('SLA breach outranks unassigned staff-owned', () => {
    const slaClaim = createClaimRow({ hasSlaBreach: true, isUnassigned: false });
    const unassignedClaim = createClaimRow({
      hasSlaBreach: false,
      isUnassigned: true,
      status: 'evaluation',
    });

    expect(computePriorityScore(slaClaim)).toBeGreaterThan(computePriorityScore(unassignedClaim));
  });

  it('unassigned staff-owned outranks stuck', () => {
    const unassignedClaim = createClaimRow({
      isUnassigned: true,
      status: 'evaluation',
      isStuck: false,
      hasSlaBreach: false,
    });
    const stuckClaim = createClaimRow({
      isStuck: true,
      isUnassigned: false,
      hasSlaBreach: false,
    });

    expect(computePriorityScore(unassignedClaim)).toBeGreaterThan(computePriorityScore(stuckClaim));
  });

  it('stuck outranks high daysInStage', () => {
    const stuckClaim = createClaimRow({
      isStuck: true,
      daysInStage: 0,
      hasSlaBreach: false,
      isUnassigned: false,
    });
    const oldClaim = createClaimRow({
      daysInStage: 100,
      isStuck: false,
      hasSlaBreach: false,
      isUnassigned: false,
    });

    expect(computePriorityScore(stuckClaim)).toBeGreaterThan(computePriorityScore(oldClaim));
  });
});

describe('sortByPriority', () => {
  it('sorts claims by priority score descending', () => {
    const claims = [
      createClaimRow({
        id: 'low',
        hasSlaBreach: false,
        isUnassigned: false,
        isStuck: false,
        daysInStage: 1,
      }),
      createClaimRow({ id: 'high', hasSlaBreach: true }),
      createClaimRow({ id: 'medium', isStuck: true }),
    ];

    const sorted = sortByPriority(claims);

    expect(sorted[0].id).toBe('high');
    expect(sorted[1].id).toBe('medium');
    expect(sorted[2].id).toBe('low');
  });

  it('preserves order for equal scores (stable sort)', () => {
    const claims = [
      createClaimRow({ id: 'first', daysInStage: 5 }),
      createClaimRow({ id: 'second', daysInStage: 5 }),
    ];

    const sorted = sortByPriority(claims);

    // Both have equal score, should preserve original order
    expect(sorted.map(c => c.id)).toEqual(['first', 'second']);
  });

  it('does not mutate original array', () => {
    const claims = [
      createClaimRow({ id: 'a', hasSlaBreach: false }),
      createClaimRow({ id: 'b', hasSlaBreach: true }),
    ];
    const originalOrder = claims.map(c => c.id);

    sortByPriority(claims);

    expect(claims.map(c => c.id)).toEqual(originalOrder);
  });
});
