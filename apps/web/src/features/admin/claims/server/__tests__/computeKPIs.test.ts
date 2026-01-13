import { describe, expect, it } from 'vitest';
import type { ClaimOperationalRow } from '../../types';
import { computeKPIsFromPool } from '../computeKPIs';

// Partial mock helper
function mockRow(overrides: Partial<ClaimOperationalRow>): ClaimOperationalRow {
  return {
    id: 'test-id',
    code: 'TEST-1',
    title: 'Test Claim',
    lifecycleStage: 'intake',
    stageStartedAt: new Date(),
    daysInStage: 0,
    ownerRole: 'staff',
    ownerName: null,
    assigneeId: null,
    isStuck: false,
    hasSlaBreach: false,
    isUnassigned: false,
    waitingOn: 'staff',
    hasCashPending: false,
    memberName: 'Member',
    memberEmail: 'member@test.com',
    branchCode: 'B1',
    agentName: null,
    category: 'test',
    status: 'submitted',
    originType: 'portal',
    originRefId: null,
    originDisplayName: null,
    claimNumber: 'CLM-TEST',
    memberId: 'member-123',
    ...overrides,
  };
}

describe('computeKPIsFromPool', () => {
  const userId = 'user-123';

  it('should calculate basic counts correctly', () => {
    const rows = [
      mockRow({ id: '1', hasSlaBreach: true, status: 'submitted' }), // SLA
      mockRow({ id: '2', isUnassigned: true, status: 'submitted' }), // Unassigned
      mockRow({ id: '3', isStuck: true, status: 'negotiation' }), // Stuck
    ];

    const kpis = computeKPIsFromPool(rows, userId);

    expect(kpis.slaBreach).toBe(1);
    expect(kpis.unassigned).toBe(1);
    expect(kpis.stuck).toBe(1);
    expect(kpis.totalOpen).toBe(3);
    // Needs Action is OR of all risks (no overlap here)
    expect(kpis.needsAction).toBe(3);
  });

  it('should deduplicate needsAction for overlapping risks', () => {
    const rows = [
      mockRow({
        id: '1',
        hasSlaBreach: true,
        isStuck: true,
        status: 'submitted',
      }),
    ];

    const kpis = computeKPIsFromPool(rows, userId);

    expect(kpis.slaBreach).toBe(1);
    expect(kpis.stuck).toBe(1);
    // Needs Action should be 1, not 2
    expect(kpis.needsAction).toBe(1);
  });

  it('should count waitingOnMember only for non-terminal statuses', () => {
    const rows = [
      mockRow({
        id: '1',
        waitingOn: 'member',
        status: 'verification',
      }), // Counted
      mockRow({
        id: '2',
        waitingOn: 'member',
        status: 'resolved',
      }), // Ignored (terminal)
    ];

    const kpis = computeKPIsFromPool(rows, userId);
    expect(kpis.waitingOnMember).toBe(1);
  });

  it('should count assignedToMe only for active staff-owned statuses', () => {
    const rows = [
      mockRow({
        id: '1',
        assigneeId: userId,
        status: 'negotiation',
      }), // Counted
      mockRow({
        id: '2',
        assigneeId: 'other-user',
        status: 'negotiation',
      }), // Ignored (other user)
      mockRow({
        id: '3',
        assigneeId: userId,
        status: 'resolved',
      }), // Ignored (terminal)
      mockRow({
        id: '4',
        assigneeId: userId,
        status: 'draft', // Ignored (member owned)
      }),
    ];

    const kpis = computeKPIsFromPool(rows, userId);
    expect(kpis.assignedToMe).toBe(1);
  });

  it('should only count unassigned if status is staff-owned', () => {
    const rows = [
      mockRow({
        id: '1',
        isUnassigned: true,
        status: 'submitted',
      }), // Counted (status=staff)
      mockRow({
        id: '2',
        isUnassigned: true, //Technically shouldn't happen but testing filter logic
        status: 'draft',
      }), // Ignored (status=member)
    ];

    const kpis = computeKPIsFromPool(rows, userId);
    expect(kpis.unassigned).toBe(1);
  });
});
