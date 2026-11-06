import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  selectRows: vi.fn(),
  decidedRows: vi.fn(),
  updates: [] as { table: unknown; values: Record<string, unknown> }[],
  convertLeadToMember: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({ notifyPaymentVerificationUpdate: hoisted.notify }));
vi.mock('@interdomestik/domain-leads/convert', () => ({
  convertLeadToMember: hoisted.convertLeadToMember,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: async (_authority: unknown, callback: (tx: unknown) => unknown) =>
    callback(createTx()),
}));

import { memberLeads } from '@interdomestik/database/schema/leads';
import type { ProtectedActionContext } from '@/lib/safe-action';
import { verifyCashAttemptCore } from './verify-attempt';

function createTx() {
  const selectChain = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    limit: () => hoisted.selectRows(),
  };
  return {
    select: () => selectChain,
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          hoisted.updates.push({ table, values });
          const done = Promise.resolve(undefined);
          return Object.assign(done, { returning: async () => hoisted.decidedRows() });
        },
      }),
    }),
    insert: () => ({ values: async () => undefined }),
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

function row(status: string, leadStatus = 'payment_pending') {
  return [
    {
      attempt: { id: 'att-1', leadId: 'lead-1', status, amount: 1000, currency: 'EUR' },
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

describe('verifyCashAttemptCore approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.updates.length = 0;
    hoisted.decidedRows.mockResolvedValue([{ id: 'att-1' }]);
  });

  it('marks the lead paid, leaving conversion to mark it converted with its member', async () => {
    hoisted.selectRows.mockResolvedValue(row('pending'));
    hoisted.convertLeadToMember.mockResolvedValue({
      userId: 'usr-1',
      subscriptionId: 'sub-1',
      memberNumber: 'M-1',
    });

    const result = await verifyCashAttemptCore(ctx, approve);

    expect(leadUpdates().map(update => update.values.status)).toEqual(['paid']);
    expect(hoisted.convertLeadToMember).toHaveBeenCalledWith(ctx.authority, { leadId: 'lead-1' });
    expect(result).toMatchObject({ success: true, memberNumber: 'M-1', userId: 'usr-1' });
  });

  it('retries the idempotent conversion when an approved attempt is approved again', async () => {
    hoisted.selectRows.mockResolvedValue(row('succeeded', 'paid'));
    hoisted.convertLeadToMember.mockResolvedValue({
      userId: 'usr-2',
      subscriptionId: 'sub-2',
      memberNumber: 'M-2',
    });

    const result = await verifyCashAttemptCore(ctx, approve);

    expect(leadUpdates()).toEqual([]);
    expect(hoisted.convertLeadToMember).toHaveBeenCalledWith(ctx.authority, { leadId: 'lead-1' });
    expect(result).toMatchObject({ success: true, userId: 'usr-2' });
  });

  it('reports an already converted lead as already approved', async () => {
    hoisted.selectRows.mockResolvedValue(row('succeeded', 'converted'));
    hoisted.convertLeadToMember.mockResolvedValue(null);

    const result = await verifyCashAttemptCore(ctx, approve);

    expect(result).toMatchObject({ success: true, message: 'Already approved' });
  });

  it('never converts on a rejection', async () => {
    hoisted.selectRows.mockResolvedValue(row('pending'));

    await verifyCashAttemptCore(ctx, { attemptId: 'att-1', decision: 'reject', note: 'no' });

    expect(leadUpdates()).toEqual([]);
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
