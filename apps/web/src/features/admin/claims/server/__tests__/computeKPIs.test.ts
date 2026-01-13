import { describe, expect, it } from 'vitest';
import type { ClaimOperationalRow } from '../../types';
import { computeAssigneeOverview, computeKPIsFromPool } from '../computeKPIs';

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
    memberNumber: 'MEM-2026-0001',
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

describe('computeAssigneeOverview', () => {
  const currentUserId = 'user-123';
  const otherUserId = 'user-456';

  // Helper imports
  // Helper imports handled at top of file

  it('should bucket "Me", "Unassigned", and "Staff" correctly', () => {
    const rows = [
      // 1. Me (Staff-Owned, Open)
      mockRow({
        id: 'me-1',
        assigneeId: currentUserId,
        status: 'negotiation',
        isStuck: true,
      }),
      // 2. Unassigned (Staff-Owned, Open)
      mockRow({
        id: 'unassigned-1',
        isUnassigned: true,
        status: 'submitted',
        assigneeId: null,
      }),
      // 3. Other Staff (Staff-Owned, Open)
      mockRow({
        id: 'staff-1',
        assigneeId: otherUserId,
        ownerName: 'Other Staff',
        status: 'evaluation',
      }),
    ];

    const result = computeAssigneeOverview(rows, currentUserId);

    // Me Summary
    expect(result.meSummary.countOpen).toBe(1);
    expect(result.meSummary.countNeedsAction).toBe(1); // Stuck

    // Unassigned Summary
    expect(result.unassignedSummary.countOpen).toBe(1);
    expect(result.unassignedSummary.countNeedsAction).toBe(1); // Unassigned + StaffOwned = Risk

    // Staff List - Should NOW include Me + Other Staff
    // Sorting: Open desc. Me=1, Other=1. Tie break staffId? or Name?
    // We just check that both claim owners are present.
    expect(result.assignees).toHaveLength(2);
    const staffIds = result.assignees.map(a => a.staffId);
    expect(staffIds).toContain(currentUserId);
    expect(staffIds).toContain(otherUserId);
  });

  it('should exclude member-owned statuses from staff workload', () => {
    const rows = [
      mockRow({
        id: '1',
        assigneeId: otherUserId,
        status: 'draft', // Member owned
      }),
      mockRow({
        id: '2',
        assigneeId: currentUserId,
        status: 'verification', // Member owned
      }),
    ];

    const result = computeAssigneeOverview(rows, currentUserId);

    expect(result.meSummary.countOpen).toBe(0);
    expect(result.assignees).toHaveLength(0); // No staff-owned claims found
  });

  it('should exclude terminal statuses entirely', () => {
    const rows = [
      mockRow({
        id: '1',
        assigneeId: currentUserId,
        status: 'resolved',
      }),
      mockRow({
        id: '2',
        assigneeId: otherUserId,
        status: 'rejected',
      }),
    ];

    const result = computeAssigneeOverview(rows, currentUserId);

    expect(result.meSummary.countOpen).toBe(0);
    expect(result.assignees).toHaveLength(0); // Should be filtered out or 0
  });

  it('should sort staff by Open(desc) -> Risk(desc) -> Name(asc) -> StaffID(asc)', () => {
    const rows = [
      // Staff A: 1 Open, 0 Risk
      mockRow({ id: 'a', assigneeId: 'staff-a', ownerName: 'A Staff', status: 'negotiation' }),
      // Staff B: 2 Open, 0 Risk
      mockRow({ id: 'b1', assigneeId: 'staff-b', ownerName: 'B Staff', status: 'negotiation' }),
      mockRow({ id: 'b2', assigneeId: 'staff-b', ownerName: 'B Staff', status: 'negotiation' }),
      // Staff C: 1 Open, 1 Risk
      mockRow({
        id: 'c',
        assigneeId: 'staff-c',
        ownerName: 'C Staff',
        status: 'negotiation',
        isStuck: true,
      }),
      // Staff D1 & D2: Same Name "D Staff", Same Stats (1 Open). Tie-break by ID.
      mockRow({ id: 'd1', assigneeId: 'staff-d2', ownerName: 'D Staff', status: 'negotiation' }),
      mockRow({ id: 'd2', assigneeId: 'staff-d1', ownerName: 'D Staff', status: 'negotiation' }),
    ];

    const { assignees } = computeAssigneeOverview(rows, currentUserId);

    // Order:
    // 1. Staff B (2 Open)
    // 2. Staff C (1 Open, 1 Risk)
    // 3. Staff A (1 Open, 0 Risk)
    // 4. Staff D1 (ID "staff-d1")
    // 5. Staff D2 (ID "staff-d2")

    expect(assignees[0].staffId).toBe('staff-b');
    expect(assignees[1].staffId).toBe('staff-c');
    expect(assignees[2].staffId).toBe('staff-a');
    expect(assignees[3].staffId).toBe('staff-d1');
    expect(assignees[4].staffId).toBe('staff-d2');
  });

  it('should cap staff list to top 10', () => {
    // Create 12 staff members, each with 1 open claim
    const rows = Array.from({ length: 12 }, (_, i) =>
      mockRow({
        id: `claim-${i}`,
        assigneeId: `staff-${i}`, // staff-0 to staff-11
        ownerName: `Staff ${i.toString().padStart(2, '0')}`, // "Staff 00" ... "Staff 11"
        status: 'negotiation',
      })
    );

    const { assignees } = computeAssigneeOverview(rows, currentUserId);

    // Should return top 10 sorted by Name (Staff 00...Staff 09)
    expect(assignees).toHaveLength(10);
    expect(assignees[0].name).toBe('Staff 00');
    expect(assignees[9].name).toBe('Staff 09');
  });

  it('should use row.isUnassigned from policy, not assigneeId===null', () => {
    const rows = [
      // Case: assigneeId is null, but isUnassigned is FALSE (e.g. member owned or not routed)
      mockRow({
        isUnassigned: false,
        assigneeId: null,
        status: 'draft',
      }),
      // Case: assigneeId is null, isUnassigned is TRUE, Status is Staff Owned
      mockRow({
        isUnassigned: true,
        assigneeId: null,
        status: 'submitted',
      }),
    ];

    const { unassignedSummary } = computeAssigneeOverview(rows, currentUserId);

    expect(unassignedSummary.countOpen).toBe(1); // Only the second one counts
  });
});
