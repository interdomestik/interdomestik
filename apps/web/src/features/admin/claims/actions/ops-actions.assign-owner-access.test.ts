import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  directDbAccess: [] as string[],
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@interdomestik/domain-claims/claims/transition-guard', () => ({
  isClaimStatusTransitionInGraph: () => true,
}));
vi.mock('./ops-status-action', () => ({ updateStatusAction: vi.fn() }));
vi.mock('@interdomestik/database', async () => {
  const fixture = await import('./ops-assignment.test-fixture');
  return fixture.createDatabaseModuleMock(mocks.withTenantContext, mocks.directDbAccess);
});

import { assignOwner, unassignOwner } from './ops-actions';
import { ASSIGNMENT_TARGET_DENIED_ERROR } from './ops-assignment';
import { createFakeTx, routeTenantContext, sessionFor, sqlOf } from './ops-assignment.test-fixture';

function expectNoAssignmentSideEffects() {
  expect(mocks.withTenantContext).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
  expect(mocks.directDbAccess).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.directDbAccess.length = 0;
});

describe('assignOwner exercised-role authorization', () => {
  it('denies anonymous requests before any tenant read', async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });
    expectNoAssignmentSideEffects();
  });

  it.each([
    ['staff', {}],
    ['branch_manager', { branchId: 'branch-1' }],
    ['branch_manager', { branchId: null }],
    ['branch_manager', { branchId: 'branch-other' }],
    ['agent', {}],
    ['member', {}],
    ['user', {}],
    ['support', {}],
    ['global_support', {}],
    ['auditor', {}],
    ['promoter', {}],
    ['unknown_role', {}],
    ['', {}],
  ])('denies exercised role "%s" %o before any tenant read', async (role, user) => {
    mocks.getSession.mockResolvedValue(sessionFor(role, user));
    await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });
    expectNoAssignmentSideEffects();
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'allows %s inside its session access tenant',
    async role => {
      mocks.getSession.mockResolvedValue(sessionFor(role));
      const { tx } = createFakeTx();
      routeTenantContext(mocks.withTenantContext, tx);

      await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toMatchObject({
        success: true,
      });
      expect(mocks.withTenantContext).toHaveBeenCalledWith(
        { tenantId: 'tenant-1', role },
        expect.any(Function)
      );
      expect(mocks.directDbAccess).toEqual([]);
    }
  );
});

describe('assignOwner tenant and target input', () => {
  it('uses the access tenant, not the home tenant, for every read and the audit', async () => {
    mocks.getSession.mockResolvedValue(
      sessionFor('tenant_admin', { tenantId: 'tenant-home', accessTenantId: 'tenant-access' })
    );
    const { tx, auditValues } = createFakeTx();
    routeTenantContext(mocks.withTenantContext, tx);

    await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toMatchObject({
      success: true,
    });

    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-access', role: 'tenant_admin' },
      expect.any(Function)
    );
    const claimRead = sqlOf(tx.query.claims.findFirst.mock.calls[0][0].where);
    const targetRead = sqlOf(tx.query.user.findFirst.mock.calls[0][0].where);
    expect(claimRead.params).toContain('tenant-access');
    expect(claimRead.params).not.toContain('tenant-home');
    expect(targetRead.params).toEqual(
      expect.arrayContaining(['tenant-access', 'staff-1', 'staff'])
    );
    expect(targetRead.params).not.toContain('tenant-home');
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-access' })
    );
  });

  it('fails closed without a home fallback when the session has no tenant', async () => {
    mocks.getSession.mockResolvedValue(
      sessionFor('admin', { tenantId: null, accessTenantId: null })
    );
    const result = await assignOwner('claim-1', 'staff-1', 'en');
    expect(result.success).toBe(false);
    expectNoAssignmentSideEffects();
  });

  it.each([
    ['self target', 'actor-1'],
    ['blank target', '   '],
    ['empty target', ''],
  ])('denies a %s before any tenant read', async (_label, staffId) => {
    mocks.getSession.mockResolvedValue(sessionFor('admin'));
    await expect(assignOwner('claim-1', staffId, 'en')).resolves.toEqual({
      success: false,
      error: ASSIGNMENT_TARGET_DENIED_ERROR,
    });
    expectNoAssignmentSideEffects();
  });
});

describe('unassignOwner shares the assignment actor guard', () => {
  it.each(['staff', 'branch_manager', 'agent', 'member', 'auditor'])(
    'denies %s before any claim read or write',
    async role => {
      mocks.getSession.mockResolvedValue(sessionFor(role));
      await expect(unassignOwner('claim-1', 'en')).resolves.toEqual({
        success: false,
        error: 'Unauthorized',
      });
      expectNoAssignmentSideEffects();
    }
  );
});
