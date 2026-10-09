import type { ProtectedActionContext } from '@/lib/safe-action';
import { describe, expect, it } from 'vitest';

import { resolveVerificationReadScope, withSessionStaffBranch } from './read-access';

function readContext(userRole: string, branchId: string | null = null) {
  return { tenantId: 'tenant-ks', userRole, scope: { branchId } };
}

function actionContext(
  userRole: string,
  sessionUser: { role?: string; branchId?: string | null },
  scopeBranchId: string | null = null
): ProtectedActionContext {
  return {
    session: { user: { id: 'user-1', ...sessionUser } },
    tenantId: 'tenant-ks',
    requestHeaders: new Headers(),
    userRole,
    scope: { branchId: scopeBranchId, actorAgentId: null, attributedAgentId: null },
  } as unknown as ProtectedActionContext;
}

describe('resolveVerificationReadScope', () => {
  it.each(['admin', 'super_admin', 'tenant_admin'])(
    'admits %s tenant-wide regardless of scope branch',
    role => {
      expect(resolveVerificationReadScope(readContext(role, 'branch-1'))).toEqual({
        kind: 'tenant',
      });
    }
  );

  it.each(['branch_manager', 'staff'])('limits %s to the own branch', role => {
    expect(resolveVerificationReadScope(readContext(role, 'branch-1'))).toEqual({
      kind: 'branch',
      branchId: 'branch-1',
    });
  });

  it.each(['branch_manager', 'staff'])('gives branchless %s no scope', role => {
    expect(resolveVerificationReadScope(readContext(role, null))).toEqual({ kind: 'none' });
  });

  it.each(['member', 'agent', 'global_support', 'auditor', 'promoter', 'unknown', ''])(
    'rejects %j with the FORBIDDEN code understood by the action wrapper',
    role => {
      expect(() => resolveVerificationReadScope(readContext(role))).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' })
      );
    }
  );

  it('rejects a missing runtime role', () => {
    const ctx = { tenantId: 'tenant-ks', userRole: undefined, scope: { branchId: null } };
    expect(() => resolveVerificationReadScope(ctx as never)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' })
    );
  });
});

describe('withSessionStaffBranch', () => {
  it('restores the verified session branch for staff', () => {
    const ctx = actionContext('staff', { role: 'staff', branchId: 'branch-1' });

    expect(withSessionStaffBranch(ctx).scope.branchId).toBe('branch-1');
  });

  it('keeps branchless staff without a branch', () => {
    const ctx = actionContext('staff', { role: 'staff', branchId: null });

    expect(withSessionStaffBranch(ctx).scope.branchId).toBeNull();
  });

  it('fails closed when the context role and session role disagree', () => {
    const ctx = actionContext('staff', { role: 'admin', branchId: 'branch-1' }, 'branch-9');

    expect(withSessionStaffBranch(ctx).scope.branchId).toBeNull();
  });

  it.each(['admin', 'branch_manager', 'tenant_admin'])('leaves %s context untouched', role => {
    const ctx = actionContext(role, { role, branchId: 'branch-1' }, 'branch-2');

    expect(withSessionStaffBranch(ctx)).toBe(ctx);
  });
});
