import { createTransactionHarness, mocks, tableRefs } from './convert.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueuedFrom } from '../../../scripts/tests/queued-select-mock';
import { convertLeadToMember } from './convert';

describe('convertLeadToMember', () => {
  const authority = mintTestTenantAuthority('tenant-1');

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    mocks.db.query.memberLeads.findFirst.mockReset();
    mocks.db.query.membershipPlans.findFirst.mockReset();
    mocks.withTenantContext.mockReset();
    mocks.withTenantContext.mockImplementation(async (_context, callback) => callback(mocks.db));
    mocks.db.select.mockReset();
    mocks.issueTenantMemberNumber.mockReset();
    mocks.nanoid.mockReset();
    mocks.eq.mockClear();
    mocks.and.mockClear();
    mocks.asc.mockClear();
    mocks.selectResults.length = 0;
    mocks.db.select.mockImplementation(() => ({
      from: createQueuedFrom(vi.fn, mocks.selectResults, mocks.lockedLead),
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

    const result = await convertLeadToMember(authority, { leadId: 'lead-1' });

    expect(result).toBeNull();
    // Only the tenant-scoped lead lookup ran; no conversion transaction was opened.
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
  });

  it('defaults lead conversion to the standard annual plan without creating read-scope binding', async () => {
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
    mocks.issueTenantMemberNumber.mockResolvedValue({ memberNumber: 'M-1001' });
    mocks.nanoid
      .mockReturnValueOnce('user-seed')
      .mockReturnValueOnce('subscription-seed')
      .mockReturnValueOnce('card-seed')
      .mockReturnValueOnce('card-num')
      .mockReturnValueOnce('card-qr');

    const { conflictRecords, insertRecords, tx, updateCalls } = createTransactionHarness();
    mocks.withTenantContext.mockImplementation(async (_context, callback) =>
      callback({ ...tx, select: mocks.db.select, query: mocks.db.query })
    );

    const result = await convertLeadToMember(authority, { leadId: 'lead-1' });

    expect(result).toEqual({
      userId: 'usr_user-seed',
      memberNumber: 'M-1001',
      subscriptionId: 'sub_subscription-seed',
    });
    // The global number is issued for the committed member, after the tenant transaction.
    expect(mocks.issueTenantMemberNumber).toHaveBeenCalledWith(authority, {
      userId: 'usr_user-seed',
      joinedAt: expect.any(Date),
    });
    expect(mocks.withTenantContext.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.issueTenantMemberNumber.mock.invocationCallOrder[0]
    );

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
    expect(agentClientInsert).toBeUndefined();
    expect(conflictRecords).toEqual([]);

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
    mocks.issueTenantMemberNumber.mockResolvedValue({ memberNumber: 'M-1002' });
    mocks.nanoid
      .mockReturnValueOnce('user-seed')
      .mockReturnValueOnce('subscription-seed')
      .mockReturnValueOnce('card-seed')
      .mockReturnValueOnce('card-num')
      .mockReturnValueOnce('card-qr');

    const { insertRecords, tx } = createTransactionHarness();
    mocks.withTenantContext.mockImplementation(async (_context, callback) =>
      callback({ ...tx, select: mocks.db.select, query: mocks.db.query })
    );

    await convertLeadToMember(authority, { leadId: 'lead-1', planId: 'family' });

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
  it('keeps a committed conversion when member-number issuance fails', async () => {
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
    mocks.issueTenantMemberNumber.mockRejectedValue(new Error('counter unavailable'));
    mocks.nanoid
      .mockReturnValueOnce('user-seed')
      .mockReturnValueOnce('subscription-seed')
      .mockReturnValueOnce('card-seed')
      .mockReturnValueOnce('card-num')
      .mockReturnValueOnce('card-qr');
    const { tx } = createTransactionHarness();
    mocks.withTenantContext.mockImplementation(async (_context, callback) =>
      callback({ ...tx, select: mocks.db.select, query: mocks.db.query })
    );

    await expect(convertLeadToMember(authority, { leadId: 'lead-1' })).resolves.toEqual({
      userId: 'usr_user-seed',
      memberNumber: null,
      subscriptionId: 'sub_subscription-seed',
    });
  });

  it('fails closed without any write when the lead row belongs to another tenant than the authority', async () => {
    mocks.db.query.memberLeads.findFirst.mockResolvedValue({
      id: 'lead-1',
      tenantId: 'tenant-other',
      branchId: 'branch-1',
      agentId: 'agent-1',
      firstName: 'Arben',
      lastName: 'Krasniqi',
      email: 'arben@example.com',
      status: 'new',
      convertedUserId: null,
    });
    const { insertRecords, tx, updateCalls } = createTransactionHarness();
    mocks.withTenantContext.mockImplementation(async (_context, callback) =>
      callback({ ...tx, select: mocks.db.select, query: mocks.db.query })
    );

    await expect(convertLeadToMember(authority, { leadId: 'lead-1' })).rejects.toThrow(
      'Lead not found'
    );

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(insertRecords).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
    expect(mocks.issueTenantMemberNumber).not.toHaveBeenCalled();
  });
});
