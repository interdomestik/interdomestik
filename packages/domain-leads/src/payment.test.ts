import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  findLead: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  nanoid: vi.fn(),
  ne: vi.fn((left: unknown, right: unknown) => ({ op: 'ne', left, right })),
  returning: vi.fn(),
  set: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      memberLeads: {
        findFirst: mocks.findLead,
      },
    },
    transaction: mocks.transaction,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  leadPaymentAttempts: 'lead_payment_attempts',
  memberLeads: {
    id: 'member_leads.id',
    tenantId: 'member_leads.tenant_id',
    agentId: 'member_leads.agent_id',
    branchId: 'member_leads.branch_id',
    status: 'member_leads.status',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  eq: mocks.eq,
  ne: mocks.ne,
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

import { startPayment } from './payment';

function installTransactionHarness(updatedRows: Array<{ id: string }> = [{ id: 'lead-1' }]) {
  const tx = {
    insert: mocks.insert,
    update: mocks.update,
  };
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue(updatedRows);
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (callback: (txArg: typeof tx) => Promise<unknown>) =>
    callback(tx)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findLead.mockResolvedValue({
    id: 'lead-1',
    status: 'new',
  });
  mocks.nanoid.mockReturnValue('attempt-1');
  installTransactionHarness();
});

describe('startPayment', () => {
  it('carries optional agent and branch scope through payment validation and status update', async () => {
    await expect(
      startPayment(
        {
          agentId: 'agent-1',
          branchId: 'branch-1',
          tenantId: 'tenant-1',
        },
        {
          amountCents: 15000,
          leadId: 'lead-1',
          method: 'cash',
          priceId: 'default_membership',
        }
      )
    ).resolves.toEqual({
      attemptId: 'pay_attempt_attempt-1',
      method: 'cash',
      status: 'pending',
    });

    const scopedWhere = {
      op: 'and',
      args: [
        { op: 'eq', left: 'member_leads.id', right: 'lead-1' },
        { op: 'eq', left: 'member_leads.tenant_id', right: 'tenant-1' },
        { op: 'eq', left: 'member_leads.agent_id', right: 'agent-1' },
        { op: 'eq', left: 'member_leads.branch_id', right: 'branch-1' },
      ],
    };
    expect(mocks.findLead).toHaveBeenCalledWith({ where: scopedWhere });
    expect(mocks.where).toHaveBeenCalledWith({
      op: 'and',
      args: [scopedWhere, { op: 'ne', left: 'member_leads.status', right: 'converted' }],
    });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        tenantId: 'tenant-1',
      })
    );
  });

  it('does not insert a payment attempt when the scoped status update no longer matches', async () => {
    installTransactionHarness([]);

    await expect(
      startPayment(
        {
          agentId: 'agent-1',
          branchId: 'branch-1',
          tenantId: 'tenant-1',
        },
        {
          amountCents: 15000,
          leadId: 'lead-1',
          method: 'cash',
          priceId: 'default_membership',
        }
      )
    ).rejects.toThrow(/lead not found/i);

    expect(mocks.insertValues).not.toHaveBeenCalled();
  });
});
