import { createTransactionHarness, mocks, tableRefs } from './convert.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueuedFrom } from '../../../scripts/tests/queued-select-mock';
import {
  MemberEmailConflictError,
  convertLeadToMember,
  isMemberEmailConflictError,
} from './convert';

// ACQ-2b1: one account per mailbox, whatever the letter case, and no account is ever attached.
const authority = mintTestTenantAuthority('tenant-1');
const lead = {
  id: 'lead-1',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  agentId: 'agent-1',
  firstName: 'Arben',
  lastName: 'Krasniqi',
  email: ' Arben.K@Example.COM ',
  status: 'paid',
  convertedUserId: null,
};

function uniqueViolation(constraint: string): Error {
  const pg = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint_name: constraint,
  });
  // Drizzle wraps the driver error and keeps it as the cause.
  return Object.assign(new Error('Failed query: insert into "user"'), { cause: pg });
}

// The user insert fails inside the conversion transaction, as the unique index makes it.
function failUserInsertWith(harness: ReturnType<typeof createTransactionHarness>, error: Error) {
  const insert = harness.tx.insert.getMockImplementation()!;
  harness.tx.insert.mockImplementation((table: unknown) => {
    if (table === tableRefs.user) throw error;
    return insert(table);
  });
}

describe('convertLeadToMember email identity', () => {
  let harness: ReturnType<typeof createTransactionHarness>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectResults.length = 0;
    mocks.selectResults.push([], [], [{ id: 'tenant-standard-plan', tier: 'standard' }]);
    mocks.lockedLead.splice(0, mocks.lockedLead.length, { status: 'paid', convertedUserId: null });
    mocks.db.select.mockImplementation(() => ({
      from: createQueuedFrom(vi.fn, mocks.selectResults, mocks.lockedLead),
    }));
    mocks.db.query.memberLeads.findFirst.mockResolvedValue(lead);
    mocks.issueTenantMemberNumber.mockResolvedValue({ memberNumber: 'M-1' });
    mocks.nanoid.mockReturnValue('seed');
    harness = createTransactionHarness();
    mocks.withTenantContext.mockImplementation(async (_context, callback) =>
      callback({ ...harness.tx, select: mocks.db.select, query: mocks.db.query })
    );
  });

  it('writes the member unverified, with the email trimmed and lowercased', async () => {
    await expect(convertLeadToMember(authority, { leadId: 'lead-1' })).resolves.toMatchObject({
      userId: 'usr_seed',
      email: 'arben.k@example.com',
    });
    const member = harness.insertRecords.find(record => record.table === tableRefs.user);
    expect(member?.values.email).toBe('arben.k@example.com');
    // The member's own first email-code sign-in verifies the mailbox (ACQ-2b2).
    expect(member?.values.emailVerified).toBe(false);
  });

  it.each(['user_email_unique', 'user_email_lower_unique'])(
    'reports a %s violation as a member email conflict, with no cause text',
    async constraint => {
      failUserInsertWith(harness, uniqueViolation(constraint));
      const failure = await convertLeadToMember(authority, { leadId: 'lead-1' }).catch(e => e);
      expect(failure).toBeInstanceOf(MemberEmailConflictError);
      expect(isMemberEmailConflictError(failure)).toBe(true);
      expect(failure.cause).toBeUndefined();
      expect(mocks.issueTenantMemberNumber).not.toHaveBeenCalled();
    }
  );

  it('keeps any other unique violation a plain failure', async () => {
    const error = uniqueViolation('membership_cards_card_number_unique');
    failUserInsertWith(harness, error);
    await expect(convertLeadToMember(authority, { leadId: 'lead-1' })).rejects.toBe(error);
  });

  it('returns no result when a concurrent approval converted the lead first', async () => {
    mocks.lockedLead.splice(0, 1, { status: 'converted', convertedUserId: 'usr_first' });
    await expect(convertLeadToMember(authority, { leadId: 'lead-1' })).resolves.toBeNull();
    expect(harness.insertRecords).toEqual([]);
    expect(mocks.issueTenantMemberNumber).not.toHaveBeenCalled();
  });
});
