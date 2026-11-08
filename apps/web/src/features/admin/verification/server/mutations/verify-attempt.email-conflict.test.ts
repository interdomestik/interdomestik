import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { MemberEmailConflictError } from '@interdomestik/domain-leads/member-email-conflict';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ convertLeadToMember: vi.fn() }));

vi.mock('@/lib/notifications', () => ({ notifyPaymentVerificationUpdate: vi.fn() }));
vi.mock('@interdomestik/domain-leads/convert', () => ({
  convertLeadToMember: hoisted.convertLeadToMember,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: async (_authority: unknown, callback: (tx: unknown) => unknown) =>
    callback(createTx()),
}));

import type { ProtectedActionContext } from '@/lib/safe-action';
import { verifyCashAttemptCore } from './verify-attempt';

const pendingAttempt = {
  attempt: { id: 'att-1', leadId: 'lead-1', status: 'pending', amount: 1000, currency: 'EUR' },
  lead: { id: 'lead-1', agentId: 'agent-1', branchId: 'branch-1', status: 'payment_pending' },
  agentEmail: 'agent@example.test',
};

function createTx() {
  const chain: Record<string, unknown> = { limit: async () => [pendingAttempt] };
  for (const step of ['from', 'innerJoin', 'where']) chain[step] = () => chain;
  return {
    select: () => chain,
    update: () => ({
      set: () => ({
        where: () => Object.assign(Promise.resolve(), { returning: async () => [{ id: 'att-1' }] }),
      }),
    }),
    insert: () => ({ values: async () => undefined }),
  };
}

const ctx = {
  tenantId: 'tenant-1',
  userRole: 'tenant_admin',
  session: { user: { id: 'staff-1', role: 'tenant_admin', branchId: null } },
  authority: mintTestTenantAuthority('tenant-1'),
  scope: { branchId: null, actorAgentId: null, attributedAgentId: null },
} as unknown as ProtectedActionContext;
const approve = { attemptId: 'att-1', decision: 'approve' as const };

// ACQ-2b1: the payment stays verified and the lead 'paid'; the existing account is never attached.
describe('verifyCashAttemptCore member email conflict', () => {
  let logged: unknown[][];

  beforeEach(() => {
    vi.clearAllMocks();
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => void logged.push(args));
  });

  it('reports the conflict for reconciliation and logs no email or error text', async () => {
    hoisted.convertLeadToMember.mockRejectedValue(new MemberEmailConflictError());

    await expect(verifyCashAttemptCore(ctx, approve)).resolves.toMatchObject({
      success: true,
      fulfillment: 'pending',
      reason: 'member_email_conflict',
    });
    expect(logged).toEqual([
      ['Lead conversion failed', { leadId: 'lead-1', reason: 'member_email_conflict' }],
    ]);
  });

  it('logs only the error name for any other failure', async () => {
    hoisted.convertLeadToMember.mockRejectedValue(
      new Error('Failed query: insert into "user" params: someone@example.com')
    );

    const result = await verifyCashAttemptCore(ctx, approve);
    expect(result).toMatchObject({ fulfillment: 'pending' });
    expect(result).not.toHaveProperty('reason');
    expect(JSON.stringify(logged)).not.toContain('example.com');
  });
});
