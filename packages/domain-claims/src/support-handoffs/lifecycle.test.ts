import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupportHandoffSession } from './types';
import {
  acceptSupportHandoffCore,
  closeSupportHandoffCore,
  reassignSupportHandoffCore,
} from './lifecycle';

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));

  return {
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    db: {
      query: {
        user: {
          findFirst: vi.fn(),
        },
      },
      update: vi.fn(() => ({ set: updateSet })),
    },
    ensureTenantId: vi.fn(() => 'tenant-1'),
    eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
    logAuditEvent: vi.fn(),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    })),
    supportHandoffs: {
      branchId: 'support_handoffs.branch_id',
      closedAt: 'support_handoffs.closed_at',
      closedById: 'support_handoffs.closed_by_id',
      closeReason: 'support_handoffs.close_reason',
      id: 'support_handoffs.id',
      lifecycleVersion: 'support_handoffs.lifecycle_version',
      staffId: 'support_handoffs.staff_id',
      status: 'support_handoffs.status',
      tenantId: 'support_handoffs.tenant_id',
      updatedAt: 'support_handoffs.updated_at',
    },
    updateReturning,
    updateSet,
    updateWhere,
    user: {
      branchId: 'user.branch_id',
      id: 'user.id',
      role: 'user.role',
      tenantId: 'user.tenant_id',
    },
    withTenant: vi.fn((_tenantId, _column, condition) => ({ condition, scoped: true })),
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  db: mocks.db,
  eq: mocks.eq,
  sql: mocks.sql,
  supportHandoffs: mocks.supportHandoffs,
  user: mocks.user,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

function staffSession(overrides: Partial<SupportHandoffSession['user']> = {}) {
  return {
    user: {
      branchId: 'branch-1',
      id: 'staff-1',
      role: 'staff',
      tenantId: 'tenant-1',
      ...overrides,
    },
  } as SupportHandoffSession;
}

describe('support handoff lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.query.user.findFirst.mockResolvedValue({ id: 'staff-2' });
    mocks.db.update.mockReturnValue({ set: mocks.updateSet });
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
    mocks.updateReturning.mockResolvedValue([{ lifecycleVersion: 2 }]);
  });

  it('accepts only open handoffs at the expected lifecycle version', async () => {
    const result = await acceptSupportHandoffCore(
      {
        expectedVersion: 4,
        handoffId: 'handoff-1',
        session: staffSession(),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ data: { lifecycleVersion: 2 }, success: true });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedById: 'staff-1',
        staffId: 'staff-1',
        status: 'accepted',
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.status', 'open');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.lifecycle_version', 4);
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-1');
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'support_handoff.accepted' })
    );
  });

  it('reports an optimistic concurrency miss without audit logging', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);

    const result = await acceptSupportHandoffCore({
      expectedVersion: 7,
      handoffId: 'handoff-1',
      session: staffSession(),
    });

    expect(result).toEqual({
      error: 'Handoff changed before it could be accepted',
      success: false,
    });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('denies branch managers from mutating lifecycle state', async () => {
    const result = await acceptSupportHandoffCore({
      handoffId: 'handoff-1',
      session: staffSession({ role: 'branch_manager' }),
    });

    expect(result).toEqual({ error: 'Unauthorized', success: false });
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it('fails closed when staff support lifecycle has no branch scope', async () => {
    const result = await acceptSupportHandoffCore({
      handoffId: 'handoff-1',
      session: staffSession({ branchId: null }),
    });

    expect(result).toEqual({ error: 'Unauthorized', success: false });
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it('requires scoped target staff and a reason before reassignment', async () => {
    const missingReason = await reassignSupportHandoffCore({
      expectedVersion: 1,
      handoffId: 'handoff-1',
      nextStaffId: 'staff-2',
      reason: ' ',
      session: staffSession(),
    });

    expect(missingReason).toEqual({
      error: 'Reassignment reason is required',
      success: false,
    });
    expect(mocks.db.query.user.findFirst).not.toHaveBeenCalled();

    mocks.db.query.user.findFirst.mockResolvedValueOnce(null);
    const outOfScope = await reassignSupportHandoffCore({
      expectedVersion: 1,
      handoffId: 'handoff-1',
      nextStaffId: 'staff-9',
      reason: 'Coverage handoff',
      session: staffSession(),
    });

    expect(outOfScope).toEqual({
      error: 'Staff member not found or out of scope',
      success: false,
    });
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });

  it('reassigns only handoffs owned by the acting staff member', async () => {
    const result = await reassignSupportHandoffCore({
      expectedVersion: 5,
      handoffId: 'handoff-1',
      nextStaffId: 'staff-2',
      reason: 'Coverage handoff',
      session: staffSession(),
    });

    expect(result).toEqual({ data: { lifecycleVersion: 2 }, success: true });
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.status', 'accepted');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.lifecycle_version', 5);
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-1');
  });

  it('closes only handoffs owned by the acting staff member', async () => {
    const result = await closeSupportHandoffCore({
      expectedVersion: 3,
      handoffId: 'handoff-1',
      reason: 'Resolved by phone',
      session: staffSession(),
    });

    expect(result).toEqual({ data: { lifecycleVersion: 2 }, success: true });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        closeReason: 'Resolved by phone',
        closedById: 'staff-1',
        status: 'closed',
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.lifecycle_version', 3);
  });
});
