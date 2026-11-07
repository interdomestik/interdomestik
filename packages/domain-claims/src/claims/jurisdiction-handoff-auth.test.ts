import { describe, expect, it } from 'vitest';

import { canInitiateHandoff } from './jurisdiction-handoff-auth';
import { baseClaim } from './jurisdiction-handoff-test-fixtures';

describe('canInitiateHandoff', () => {
  it('allows assigned staff and denies same-branch unassigned staff', () => {
    expect(
      canInitiateHandoff({ branchId: 'branch-a', id: 'staff-1', role: 'staff' }, baseClaim)
    ).toBe(true);

    expect(
      canInitiateHandoff({ branchId: 'branch-a', id: 'staff-2', role: 'staff' }, baseClaim)
    ).toBe(false);
  });

  it.each(['staff', 'admin', 'tenant_admin', 'super_admin', 'global_support', 'branch_manager'])(
    'denies %s a handoff of a member draft or a claim without a lifecycle',
    role => {
      const actor = { branchId: 'branch-a', id: 'staff-1', role };
      expect(canInitiateHandoff(actor, { ...baseClaim, caseLifecycleState: 'draft' })).toBe(false);
      expect(canInitiateHandoff(actor, { ...baseClaim, caseLifecycleState: null })).toBe(false);
      expect(canInitiateHandoff(actor, baseClaim)).toBe(true);
    }
  );

  it('keeps branch managers branch-scoped', () => {
    expect(
      canInitiateHandoff(
        { branchId: 'branch-a', id: 'manager-1', role: 'branch_manager' },
        baseClaim
      )
    ).toBe(true);

    expect(
      canInitiateHandoff(
        { branchId: 'branch-b', id: 'manager-1', role: 'branch_manager' },
        baseClaim
      )
    ).toBe(false);
  });
});
