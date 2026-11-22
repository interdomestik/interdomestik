import { SalesClosedError } from '@interdomestik/database/pilot-switch';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  selectRows: vi.fn(),
  selectWhere: vi.fn(),
  decidedRows: vi.fn(),
  paidRows: vi.fn(),
  insertValues: vi.fn(),
  assertNewSalesOpen: vi.fn(),
  rollback: vi.fn(),
  updates: [] as { table: unknown; values: Record<string, unknown> }[],
  convertLeadToMember: vi.fn(),
  notify: vi.fn(),
  inTransaction: false,
}));

vi.mock('@/lib/notifications', () => ({ notifyPaymentVerificationUpdate: hoisted.notify }));
vi.mock('@/lib/member-activation-invite', () => ({
  sendMemberActivationInvite: async () => ({ sent: false, reason: 'email_suppressed' }),
}));
vi.mock('@interdomestik/database/pilot-switch', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database/pilot-switch')>()),
  assertNewSalesOpen: hoisted.assertNewSalesOpen,
}));
vi.mock('@interdomestik/domain-leads/convert', () => ({
  convertLeadToMember: hoisted.convertLeadToMember,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: async (_authority: unknown, callback: (tx: unknown) => unknown) => {
    hoisted.inTransaction = true;
    try {
      return await callback(createTx());
    } catch (error) {
      hoisted.rollback(error);
      throw error;
    } finally {
      hoisted.inTransaction = false;
    }
  },
}));

import { memberLeads } from '@interdomestik/database/schema/leads';
import type { ProtectedActionContext } from '@/lib/safe-action';
import { verifyCashAttemptCore } from './verify-attempt';

function createTx() {
  const selectChain = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: hoisted.selectWhere.mockImplementation(() => selectChain),
    limit: () => hoisted.selectRows(),
  };
  return {
    select: () => selectChain,
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          hoisted.updates.push({ table, values });
          return { returning: table === memberLeads ? hoisted.paidRows : hoisted.decidedRows };
        },
      }),
    }),
    insert: () => ({ values: hoisted.insertValues }),
  };
}

function contextFor(role: string, branchId: string | null = null): ProtectedActionContext {
  return {
    tenantId: 'tenant-1',
    userRole: role,
    session: { user: { id: 'staff-1', role, branchId } },
    authority: mintTestTenantAuthority('tenant-1'),
    scope: { branchId: null, actorAgentId: null, attributedAgentId: null },
  } as unknown as ProtectedActionContext;
}
const ctx = contextFor('tenant_admin');

function row(status: string, leadStatus = 'payment_pending', method = 'cash') {
  return [
    {
      attempt: { id: 'att-1', leadId: 'lead-1', status, method, amount: 1000, currency: 'EUR' },
      lead: {
        id: 'lead-1',
        agentId: 'agent-1',
        branchId: 'branch-1',
        status: leadStatus,
        firstName: 'A',
        lastName: 'B',
      },
      agentEmail: 'agent@example.test',
    },
  ];
}

const approve = { attemptId: 'att-1', decision: 'approve' as const };
const leadUpdates = () => hoisted.updates.filter(update => update.table === memberLeads);
const verifiedCash = { leadId: 'lead-1', admission: { kind: 'verified_cash', attemptId: 'att-1' } };

describe('verifyCashAttemptCore approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.updates.length = 0;
    hoisted.decidedRows.mockResolvedValue([{ id: 'att-1' }]);
    hoisted.paidRows.mockResolvedValue([{ id: 'lead-1' }]);
    hoisted.assertNewSalesOpen.mockResolvedValue(undefined);
  });

  it('marks the lead paid, leaving conversion to mark it converted with its member', async () => {
    hoisted.selectRows.mockResolvedValue(row('pending'));
    hoisted.assertNewSalesOpen.mockImplementationOnce(() => {
      expect(hoisted.inTransaction).toBe(true);
      expect(hoisted.updates).toEqual([]);
    });
    hoisted.convertLeadToMember.mockResolvedValue({
      userId: 'usr-1',
      subscriptionId: 'sub-1',
      memberNumber: 'M-1',
    });

    const result = await verifyCashAttemptCore(ctx, approve);

    expect(leadUpdates().map(update => update.values.status)).toEqual(['paid']);
    expect(hoisted.assertNewSalesOpen).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      'tenant-1'
    );
    expect(hoisted.assertNewSalesOpen).toHaveBeenCalledBefore(hoisted.decidedRows);
    expect(hoisted.convertLeadToMember).toHaveBeenCalledWith(ctx.authority, verifiedCash);
    expect(result).toMatchObject({ success: true, memberNumber: 'M-1', userId: 'usr-1' });
  });

  it('refuses a pending card attempt as missing before any write', async () => {
    const card = row('pending', 'payment_pending', 'card');
    hoisted.selectRows.mockImplementationOnce(() => {
      const predicate = new PgDialect().sqlToQuery(hoisted.selectWhere.mock.calls[0][0]);
      expect(predicate.sql).toBe(
        '("lead_payment_attempts"."id" = $1 and "lead_payment_attempts"."tenant_id" = $2 and "lead_payment_attempts"."method" = $3)'
      );
      expect(predicate.params).toEqual(['att-1', 'tenant-1', 'cash']);
      return card.filter(({ attempt }) => attempt.method === predicate.params[2]);
    });

    await expect(verifyCashAttemptCore(ctx, approve)).rejects.toThrow('Payment attempt not found.');
    expect(hoisted.updates).toEqual([]);
    expect(hoisted.insertValues).not.toHaveBeenCalled();
    expect(hoisted.assertNewSalesOpen).not.toHaveBeenCalled();
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
  });

  it('returns CLOSED before changing the pending attempt, lead, or audit', async () => {
    hoisted.selectRows.mockResolvedValue(row('pending'));
    hoisted.assertNewSalesOpen.mockRejectedValue(new SalesClosedError());

    await expect(verifyCashAttemptCore(ctx, approve)).rejects.toMatchObject({ code: 'CLOSED' });
    expect(hoisted.updates).toEqual([]);
    expect(hoisted.insertValues).not.toHaveBeenCalled();
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
  });

  it('records a failed switch read and refuses approval without writes', async () => {
    const error = new Error('switch read failed');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    hoisted.selectRows.mockResolvedValue(row('pending'));
    hoisted.assertNewSalesOpen.mockRejectedValue(error);

    try {
      await expect(verifyCashAttemptCore(ctx, approve)).rejects.toMatchObject({ code: 'CLOSED' });
      expect(log).toHaveBeenCalledWith('Lead sales switch read failed', error);
      expect(hoisted.updates).toEqual([]);
      expect(hoisted.insertValues).not.toHaveBeenCalled();
      expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('throws inside the approval transaction when no lead row changes and returns CONFLICT', async () => {
    hoisted.selectRows.mockResolvedValue(row('pending', 'cancelled'));
    hoisted.paidRows.mockResolvedValue([]);

    await expect(verifyCashAttemptCore(ctx, approve)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(hoisted.decidedRows).toHaveBeenCalledTimes(1);
    expect(hoisted.paidRows).toHaveBeenCalledTimes(1);
    expect(hoisted.rollback).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: 'CONFLICT' })
    );
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
  });

  it('retries a succeeded approval with the same evidence after sales close', async () => {
    hoisted.assertNewSalesOpen.mockRejectedValue(new SalesClosedError());
    hoisted.selectRows.mockResolvedValue(row('succeeded', 'paid'));
    hoisted.convertLeadToMember.mockResolvedValue({
      userId: 'usr-2',
      subscriptionId: 'sub-2',
      memberNumber: 'M-2',
    });

    const result = await verifyCashAttemptCore(ctx, approve);

    expect(hoisted.updates).toEqual([]);
    expect(hoisted.insertValues).not.toHaveBeenCalled();
    expect(hoisted.assertNewSalesOpen).not.toHaveBeenCalled();
    expect(hoisted.convertLeadToMember).toHaveBeenCalledWith(ctx.authority, verifiedCash);
    expect(result).toMatchObject({ success: true, userId: 'usr-2' });
  });

  it('reports an already converted lead as already approved', async () => {
    hoisted.selectRows.mockResolvedValue(row('succeeded', 'converted'));
    hoisted.convertLeadToMember.mockResolvedValue(null);

    const result = await verifyCashAttemptCore(ctx, approve);

    expect(result).toMatchObject({ success: true, message: 'Already approved' });
  });

  it('allows a rejection while closed without converting', async () => {
    hoisted.selectRows.mockResolvedValue(row('pending'));
    hoisted.assertNewSalesOpen.mockRejectedValue(new SalesClosedError());

    await expect(
      verifyCashAttemptCore(ctx, { attemptId: 'att-1', decision: 'reject', note: 'no' })
    ).resolves.toMatchObject({ success: true, status: 'rejected' });

    expect(leadUpdates()).toEqual([]);
    expect(hoisted.assertNewSalesOpen).not.toHaveBeenCalled();
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
  });

  it('refuses decisions without an operations role or outside the staff branch', async () => {
    hoisted.selectRows.mockResolvedValue(row('pending'));
    for (const role of ['member', 'agent', 'auditor'])
      await expect(verifyCashAttemptCore(contextFor(role), approve)).rejects.toThrow(/Forbidden/);
    await expect(verifyCashAttemptCore(contextFor('staff', null), approve)).rejects.toThrow(
      'Payment attempt not found.'
    );
    await expect(verifyCashAttemptCore(contextFor('staff', 'branch-2'), approve)).rejects.toThrow(
      'Payment attempt not found.'
    );
    expect(hoisted.updates).toEqual([]);
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();

    await verifyCashAttemptCore(contextFor('staff', 'branch-1'), approve);
    expect(hoisted.convertLeadToMember).toHaveBeenCalledTimes(1);
  });

  it('lets only one concurrent decision move the attempt; the loser converts nothing', async () => {
    hoisted.selectRows.mockResolvedValue(row('pending'));
    hoisted.decidedRows.mockResolvedValue([]);

    await expect(verifyCashAttemptCore(ctx, approve)).rejects.toThrow(/just decided/);
    expect(leadUpdates()).toEqual([]);
    expect(hoisted.convertLeadToMember).not.toHaveBeenCalled();
  });

  it('reports a pending membership setup when conversion fails', async () => {
    hoisted.selectRows.mockResolvedValue(row('pending'));
    hoisted.convertLeadToMember.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await verifyCashAttemptCore(ctx, approve);

    expect(result).toMatchObject({ success: true, fulfillment: 'pending' });
  });
});

describe('verifyCashAttemptCore notice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.updates.length = 0;
    hoisted.decidedRows.mockResolvedValue([{ id: 'att-1' }]);
    hoisted.selectRows.mockResolvedValue(row('pending'));
  });

  it.each(['needs_info', 'reject'] as const)(
    'sends the %s notice once, after the decision transaction has ended',
    async decision => {
      const seenInTransaction: boolean[] = [];
      hoisted.notify.mockImplementation(async () => {
        seenInTransaction.push(hoisted.inTransaction);
        return { success: true };
      });

      const result = await verifyCashAttemptCore(ctx, { attemptId: 'att-1', decision, note: 'n' });

      expect(result).toMatchObject({ success: true });
      expect(hoisted.notify).toHaveBeenCalledTimes(1);
      expect(hoisted.notify.mock.calls[0][0]).toBe('agent-1');
      expect(seenInTransaction).toEqual([false]);
    }
  );

  it('keeps the stored decision when the notice fails', async () => {
    hoisted.notify.mockRejectedValue(new Error('recipient read failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await verifyCashAttemptCore(ctx, {
      attemptId: 'att-1',
      decision: 'needs_info',
      note: 'n',
    });

    consoleError.mockRestore();
    expect(result).toMatchObject({ success: true, status: 'needs_info' });
  });

  it('sends no notice when the decision transaction fails', async () => {
    hoisted.decidedRows.mockRejectedValue(new Error('write failed'));

    await expect(
      verifyCashAttemptCore(ctx, { attemptId: 'att-1', decision: 'needs_info', note: 'n' })
    ).rejects.toThrow('write failed');
    expect(hoisted.notify).not.toHaveBeenCalled();
  });
});
