import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueuedFrom } from '../../../scripts/tests/queued-select-mock';

const tableRefs = vi.hoisted(() => ({
  memberLeads: { table: 'memberLeads', id: 'memberLeads.id' },
  membershipCards: { table: 'membershipCards' },
  subscriptions: { table: 'subscriptions' },
  user: { table: 'user' },
  agentClients: { table: 'agentClients' },
}));

const mocks = vi.hoisted(() => ({
  eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
  and: vi.fn((...clauses) => ({ clauses, op: 'and' })),
  asc: vi.fn(value => ({ op: 'asc', value })),
  selectResults: [] as unknown[][],
  db: {
    query: {
      memberLeads: {
        findFirst: vi.fn(),
      },
      membershipPlans: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
    transaction: vi.fn(),
  },
  membershipPlans: {
    id: 'membership_plans.id',
    tenantId: 'membership_plans.tenant_id',
    tier: 'membership_plans.tier',
    paddlePriceId: 'membership_plans.paddle_price_id',
    interval: 'membership_plans.interval',
    isActive: 'membership_plans.is_active',
  },
  generateMemberNumber: vi.fn(),
  nanoid: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  asc: mocks.asc,
  db: mocks.db,
  eq: mocks.eq,
  membershipPlans: mocks.membershipPlans,
}));

vi.mock('@interdomestik/database/member-number', () => ({
  generateMemberNumber: mocks.generateMemberNumber,
}));

vi.mock('@interdomestik/database/schema', () => tableRefs);

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
  customAlphabet: vi.fn(() => () => 'REFCODE01'),
}));

import { convertLeadToMember } from './convert';

type InsertRecord = {
  table: unknown;
  values: Record<string, unknown>;
};
type ConflictRecord = {
  payload: Record<string, unknown>;
  table: unknown;
  values: Record<string, unknown>;
};

function createTransactionHarness() {
  const insertRecords: InsertRecord[] = [];
  const conflictRecords: ConflictRecord[] = [];
  const updateCalls: Array<{ table: unknown; values?: Record<string, unknown>; where?: unknown }> =
    [];

  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertRecords.push({ table, values });
        return {
          onConflictDoUpdate: vi.fn(async (payload: Record<string, unknown>) => {
            conflictRecords.push({ table, values, payload });
          }),
        };
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updateCalls.push({ table, values });
        return {
          where: vi.fn(async (where: unknown) => {
            const lastCall = updateCalls[updateCalls.length - 1];
            if (lastCall) {
              lastCall.where = where;
            }
          }),
        };
      }),
    })),
  };

  return { conflictRecords, insertRecords, tx, updateCalls };
}

describe('convertLeadToMember', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    mocks.db.query.memberLeads.findFirst.mockReset();
    mocks.db.query.membershipPlans.findFirst.mockReset();
    mocks.db.transaction.mockReset();
    mocks.db.select.mockReset();
    mocks.generateMemberNumber.mockReset();
    mocks.nanoid.mockReset();
    mocks.eq.mockClear();
    mocks.and.mockClear();
    mocks.asc.mockClear();
    mocks.selectResults.length = 0;
    mocks.db.select.mockImplementation(() => ({
      from: createQueuedFrom(vi.fn, mocks.selectResults),
    }));
  });

  it('returns null and does not convert when convertedUserId already exists', async () => {
    mocks.db.query.memberLeads.findFirst.mockResolvedValue({
      id: 'lead-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      agentId: 'agent-1',
      firstName: 'Arben',
      lastName: 'Krasniqi',
      email: 'arben@example.com',
      status: 'new',
      convertedUserId: 'usr_existing',
    });
    mocks.selectResults.push([], [], [{ id: 'tenant-standard-plan', tier: 'standard' }]);

    mocks.db.transaction.mockImplementation(async () => {
      throw new Error('transaction should not run');
    });

    const result = await convertLeadToMember({ tenantId: 'tenant-1' }, { leadId: 'lead-1' });

    expect(result).toBeNull();
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it('defaults lead conversion to the standard annual plan and creates agent binding', async () => {
    const now = new Date('2026-04-16T09:00:00.000Z');
    const expectedPeriodEnd = new Date('2027-04-16T09:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.db.query.memberLeads.findFirst.mockResolvedValue({
      id: 'lead-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      agentId: 'agent-1',
      firstName: 'Arben',
      lastName: 'Krasniqi',
      email: 'arben@example.com',
      status: 'new',
      convertedUserId: null,
    });
    mocks.selectResults.push([], [], [{ id: 'tenant-standard-plan', tier: 'standard' }]);
    mocks.generateMemberNumber.mockResolvedValue({ memberNumber: 'M-1001' });
    mocks.nanoid
      .mockReturnValueOnce('user-seed')
      .mockReturnValueOnce('subscription-seed')
      .mockReturnValueOnce('agent-client-seed')
      .mockReturnValueOnce('card-seed')
      .mockReturnValueOnce('card-num')
      .mockReturnValueOnce('card-qr');

    const { conflictRecords, insertRecords, tx, updateCalls } = createTransactionHarness();
    mocks.db.transaction.mockImplementation(async callback => callback(tx));

    const result = await convertLeadToMember({ tenantId: 'tenant-1' }, { leadId: 'lead-1' });

    expect(result).toEqual({
      userId: 'usr_user-seed',
      memberNumber: 'M-1001',
      subscriptionId: 'sub_subscription-seed',
    });

    const subscriptionInsert = insertRecords.find(
      record => record.table === tableRefs.subscriptions
    )?.values;
    const userInsert = insertRecords.find(record => record.table === tableRefs.user)?.values;
    expect(userInsert).toMatchObject({
      agentId: 'agent-1',
      createdBy: 'agent',
      assistedByAgentId: 'agent-1',
    });
    expect(subscriptionInsert).toMatchObject({
      id: 'sub_subscription-seed',
      tenantId: 'tenant-1',
      userId: 'usr_user-seed',
      status: 'active',
      planId: 'standard',
      planKey: 'tenant-standard-plan',
      agentId: 'agent-1',
      branchId: 'branch-1',
      currentPeriodStart: now,
      currentPeriodEnd: expectedPeriodEnd,
      createdAt: now,
      updatedAt: now,
    });

    const agentClientInsert = insertRecords.find(
      record => record.table === tableRefs.agentClients
    )?.values;
    expect(agentClientInsert).toMatchObject({
      id: 'agent-client-seed',
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      memberId: 'usr_user-seed',
      status: 'active',
      joinedAt: now,
      createdAt: now,
    });
    expect(conflictRecords).toEqual([
      expect.objectContaining({
        table: tableRefs.agentClients,
        payload: expect.objectContaining({
          set: expect.objectContaining({
            status: 'active',
            joinedAt: now,
          }),
          target: expect.any(Array),
        }),
      }),
    ]);

    expect(updateCalls).toEqual([
      expect.objectContaining({
        table: tableRefs.agentClients,
        values: {
          status: 'inactive',
        },
      }),
      expect.objectContaining({
        table: tableRefs.memberLeads,
        values: {
          status: 'converted',
          convertedUserId: 'usr_user-seed',
          updatedAt: now,
        },
      }),
    ]);
  });

  it('does not create an agent binding when the lead has no agent', async () => {
    const now = new Date('2026-04-16T10:00:00.000Z');
    const expectedPeriodEnd = new Date('2027-04-16T10:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.db.query.memberLeads.findFirst.mockResolvedValue({
      id: 'lead-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      agentId: null,
      firstName: 'Arben',
      lastName: 'Krasniqi',
      email: 'arben@example.com',
      status: 'new',
      convertedUserId: null,
    });
    mocks.selectResults.push([], [], [{ id: 'tenant-family-plan', tier: 'family' }]);
    mocks.generateMemberNumber.mockResolvedValue({ memberNumber: 'M-1002' });
    mocks.nanoid
      .mockReturnValueOnce('user-seed')
      .mockReturnValueOnce('subscription-seed')
      .mockReturnValueOnce('card-seed')
      .mockReturnValueOnce('card-num')
      .mockReturnValueOnce('card-qr');

    const { insertRecords, tx } = createTransactionHarness();
    mocks.db.transaction.mockImplementation(async callback => callback(tx));

    await convertLeadToMember({ tenantId: 'tenant-1' }, { leadId: 'lead-1', planId: 'family' });

    const agentClientInsert = insertRecords.find(record => record.table === tableRefs.agentClients);
    expect(agentClientInsert).toBeUndefined();

    const subscriptionInsert = insertRecords.find(
      record => record.table === tableRefs.subscriptions
    )?.values;
    expect(subscriptionInsert).toMatchObject({
      planId: 'family',
      planKey: 'tenant-family-plan',
      branchId: 'branch-1',
      currentPeriodStart: now,
      currentPeriodEnd: expectedPeriodEnd,
      updatedAt: now,
    });
  });
});
