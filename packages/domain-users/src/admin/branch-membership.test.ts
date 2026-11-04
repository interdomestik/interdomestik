import { describe, expect, it } from 'vitest';
import { conflictsWithBranchMembership, revokeLeavesForeignBranchGrant } from './branch-membership';
import type { RoleMutationTarget } from './role-target';

function target(overrides: Partial<RoleMutationTarget> = {}): RoleMutationTarget {
  return { role: 'member', branchId: null, grants: [], ...overrides };
}

describe('conflictsWithBranchMembership', () => {
  it('admits a first branch and the branch the user already belongs to', () => {
    expect(conflictsWithBranchMembership(target(), 'branch-a')).toBe(false);
    expect(conflictsWithBranchMembership(target({ branchId: 'branch-a' }), 'branch-a')).toBe(false);
    expect(
      conflictsWithBranchMembership(
        target({ grants: [{ role: 'staff', branchId: null }] }),
        'branch-a'
      )
    ).toBe(false);
  });

  it('rejects a branch other than the membership, even with no grant rows', () => {
    expect(conflictsWithBranchMembership(target({ branchId: 'branch-b' }), 'branch-a')).toBe(true);
  });

  it('rejects a grant in another branch, including the same role being replaced', () => {
    for (const role of ['agent', 'branch_manager']) {
      expect(
        conflictsWithBranchMembership(
          target({ grants: [{ role, branchId: 'branch-b' }] }),
          'branch-a'
        )
      ).toBe(true);
    }
  });
});

describe('revokeLeavesForeignBranchGrant', () => {
  it('allows revokes whose remaining branch-scoped grants name the membership branch', () => {
    const agent = target({
      role: 'agent',
      branchId: 'branch-a',
      grants: [
        { role: 'agent', branchId: 'branch-a' },
        { role: 'branch_manager', branchId: 'branch-a' },
      ],
    });
    expect(revokeLeavesForeignBranchGrant(agent, { role: 'agent', branchId: 'branch-a' })).toBe(
      false
    );
  });

  it('ignores the revoked grant itself even when it names another branch', () => {
    const legacy = target({
      branchId: 'branch-a',
      grants: [{ role: 'agent', branchId: 'branch-b' }],
    });
    expect(revokeLeavesForeignBranchGrant(legacy, { role: 'agent', branchId: 'branch-b' })).toBe(
      false
    );
  });

  it('fails closed when a cleared membership still has a branch-scoped grant', () => {
    // agent@branch-a, then granted staff: staff clears membership but keeps the agent grant.
    const staff = target({
      role: 'staff',
      grants: [
        { role: 'agent', branchId: 'branch-a' },
        { role: 'staff', branchId: null },
      ],
    });
    expect(revokeLeavesForeignBranchGrant(staff, { role: 'staff', branchId: null })).toBe(true);
    expect(revokeLeavesForeignBranchGrant(staff, { role: 'agent', branchId: 'branch-a' })).toBe(
      false
    );
  });

  it('fails closed for a non-primary revoke that leaves a grant in another branch', () => {
    const drifted = target({
      role: 'agent',
      branchId: 'branch-a',
      grants: [
        { role: 'agent', branchId: 'branch-a' },
        { role: 'branch_manager', branchId: 'branch-b' },
        { role: 'staff', branchId: null },
      ],
    });
    expect(revokeLeavesForeignBranchGrant(drifted, { role: 'staff', branchId: null })).toBe(true);
  });
});
