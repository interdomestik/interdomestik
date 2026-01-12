import { describe, expect, it } from 'vitest';
import { isStaffOwnedStatus, isTerminalStatus } from '../../types';
import type { RawClaimRow } from '../mapClaimToOperationalRow';
import { mapClaimToOperationalRow } from '../mapClaimToOperationalRow';

// Mock helper
function mockRawRow(overrides: Partial<RawClaimRow['claim']>): RawClaimRow {
  return {
    claim: {
      id: 'test-id',
      title: 'Test Claim',
      status: 'submitted',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      assignedAt: null,
      staffId: null,
      category: 'retail',
      currency: 'EUR',
      statusUpdatedAt: null,
      origin: 'portal',
      originRefId: null,
      ...overrides,
    },
    claimant: { name: 'Claimant', email: 'c@test.com' },
    staff: overrides.staffId ? { name: 'Staff', email: 's@test.com' } : null,
    branch: { id: 'b1', code: 'B1', name: 'Branch 1' },
    agent: null,
  };
}

describe('mapClaimToOperationalRow', () => {
  it('CRITICAL INVARIANT: isUnassigned matches (staffId==null && staffOwned && !terminal)', () => {
    // Case 1: Unassigned + Staff Owned (submitted) => isUnassigned=true
    const row1 = mapClaimToOperationalRow(mockRawRow({ status: 'submitted', staffId: null }));
    expect(row1.isUnassigned).toBe(true);

    // Invariant check
    expect(row1.isUnassigned).toBe(
      row1.assigneeId === null && isStaffOwnedStatus(row1.status) && !isTerminalStatus(row1.status)
    );

    // Case 2: Assigned + Staff Owned => isUnassigned=false
    const row2 = mapClaimToOperationalRow(mockRawRow({ status: 'submitted', staffId: 'staff-1' }));
    expect(row2.isUnassigned).toBe(false);
    expect(row2.assigneeId).toBe('staff-1');

    // Case 3: Unassigned + Terminal (resolved) => isUnassigned=false
    const row3 = mapClaimToOperationalRow(mockRawRow({ status: 'resolved', staffId: null }));
    expect(row3.isUnassigned).toBe(false);

    // Case 4: Unassigned + Member Owned (draft) => isUnassigned=false
    const row4 = mapClaimToOperationalRow(mockRawRow({ status: 'draft', staffId: null }));
    expect(row4.isUnassigned).toBe(false);
  });

  it('correctly calculates daysInStage using statusUpdatedAt preference', () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    // Case A: statusUpdatedAt exists
    const rowA = mapClaimToOperationalRow(
      mockRawRow({
        statusUpdatedAt: tenDaysAgo,
        updatedAt: fiveDaysAgo, // Should be ignored
      })
    );
    expect(rowA.daysInStage).toBe(10);

    // Case B: Fallback to updatedAt if statusUpdatedAt missing
    const rowB = mapClaimToOperationalRow(
      mockRawRow({
        statusUpdatedAt: null,
        updatedAt: fiveDaysAgo,
      })
    );
    expect(rowB.daysInStage).toBe(5);
  });
});
