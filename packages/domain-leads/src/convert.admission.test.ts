import { SalesClosedError } from '@interdomestik/database/pilot-switch';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueuedFrom } from '../../../scripts/tests/queued-select-mock';
import { createTransactionHarness, mocks, tableRefs } from './convert.test-support';
import { convertLeadToMember } from './convert';

const authority = mintTestTenantAuthority('tenant-1');
const lead = {
  id: 'lead-1',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  agentId: null,
  firstName: 'Example',
  lastName: 'Member',
  email: 'member@example.test',
  status: 'paid',
  convertedUserId: null,
};
const cashAttempt = {
  leadId: lead.id,
  method: 'cash',
  status: 'succeeded',
  verifiedBy: 'verifier-1',
};
const verifiedCashArgs = {
  leadId: lead.id,
  admission: { kind: 'verified_cash', attemptId: 'attempt-1' },
} as const;

describe('lead conversion admission', () => {
  let harness: ReturnType<typeof createTransactionHarness>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertNewSalesOpen.mockRejectedValue(new SalesClosedError());
    mocks.selectResults.splice(
      0,
      mocks.selectResults.length,
      [],
      [],
      [{ id: 'tenant-standard-plan', tier: 'standard' }]
    );
    mocks.lockedLead.splice(0, mocks.lockedLead.length, {
      status: 'paid',
      convertedUserId: null,
    });
    mocks.db.select.mockImplementation(() => ({
      from: createQueuedFrom(vi.fn, mocks.selectResults, mocks.lockedLead),
    }));
    mocks.db.query.memberLeads.findFirst.mockResolvedValue(lead);
    mocks.db.query.leadPaymentAttempts.findFirst.mockResolvedValue(cashAttempt);
    mocks.issueTenantMemberNumber.mockResolvedValue({ memberNumber: 'M-1' });
    mocks.nanoid.mockReturnValue('seed');
    harness = createTransactionHarness();
    mocks.withTenantContext.mockImplementation(async (_context, callback) =>
      callback({ ...harness.tx, select: mocks.db.select, query: mocks.db.query })
    );
  });

  it('stops a new conversion at the locked lead before writing', async () => {
    await expect(
      convertLeadToMember(authority, { leadId: lead.id, admission: { kind: 'check' } })
    ).rejects.toMatchObject({ code: 'CLOSED' });
    expect(mocks.assertNewSalesOpen).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ insert: harness.tx.insert }),
      'tenant-1'
    );
    expect(harness.insertRecords).toEqual([]);
    expect(harness.updateCalls).toEqual([]);
    expect(mocks.issueTenantMemberNumber).not.toHaveBeenCalled();
  });

  it('fulfils verified cash after a stop, scoped to the authority tenant and attempt', async () => {
    await expect(convertLeadToMember(authority, verifiedCashArgs)).resolves.toMatchObject({
      userId: 'usr_seed',
      subscriptionId: 'sub_seed',
    });
    expect(mocks.db.query.leadPaymentAttempts.findFirst).toHaveBeenCalledExactlyOnceWith({
      columns: { leadId: true, method: true, status: true, verifiedBy: true },
      where: {
        op: 'and',
        clauses: [
          { op: 'eq', left: tableRefs.leadPaymentAttempts.tenantId, right: 'tenant-1' },
          { op: 'eq', left: tableRefs.leadPaymentAttempts.id, right: 'attempt-1' },
        ],
      },
    });
    expect(mocks.assertNewSalesOpen).not.toHaveBeenCalled();
    expect(harness.insertRecords.map(row => row.table)).toEqual([
      tableRefs.user,
      tableRefs.subscriptions,
      tableRefs.membershipCards,
    ]);
    expect(harness.updateCalls.at(-1)?.values).toMatchObject({
      status: 'converted',
      convertedUserId: 'usr_seed',
    });
  });

  it.each([
    ['another lead', { ...cashAttempt, leadId: 'different-lead' }],
    ['pending status', { ...cashAttempt, status: 'pending' }],
    ['card payment', { ...cashAttempt, method: 'card' }],
    ['missing verifier', { ...cashAttempt, verifiedBy: null }],
    ['missing attempt', undefined],
  ])('refuses cash evidence with %s before any write', async (_reason, attempt) => {
    mocks.db.query.leadPaymentAttempts.findFirst.mockResolvedValueOnce(attempt);

    await expect(convertLeadToMember(authority, verifiedCashArgs)).rejects.toThrow(
      'Lead payment is not verified'
    );
    expect(harness.insertRecords).toEqual([]);
    expect(harness.updateCalls).toEqual([]);
    expect(mocks.issueTenantMemberNumber).not.toHaveBeenCalled();
  });

  it('refuses cash conversion when the locked lead has not been paid', async () => {
    mocks.lockedLead.splice(0, 1, { status: 'payment_pending', convertedUserId: null });

    await expect(convertLeadToMember(authority, verifiedCashArgs)).rejects.toThrow(
      'Lead payment is not verified'
    );
    expect(mocks.db.query.leadPaymentAttempts.findFirst).not.toHaveBeenCalled();
    expect(harness.insertRecords).toEqual([]);
    expect(harness.updateCalls).toEqual([]);
  });
});
