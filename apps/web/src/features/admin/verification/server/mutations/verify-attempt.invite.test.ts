import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  convertLeadToMember: vi.fn(),
  sendMemberActivationInvite: vi.fn(),
}));

vi.mock('@/lib/member-activation-invite', () => ({
  sendMemberActivationInvite: hoisted.sendMemberActivationInvite,
}));
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

// ACQ-2b2: the member is invited after the conversion committed; a failed invite never undoes it.
describe('verifyCashAttemptCore activation invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.convertLeadToMember.mockResolvedValue({
      userId: 'member-1',
      memberNumber: 'M-1',
      email: 'member@example.test',
    });
  });

  it('invites the committed email and reports it sent', async () => {
    hoisted.sendMemberActivationInvite.mockResolvedValue({ sent: true });

    await expect(verifyCashAttemptCore(ctx, approve)).resolves.toMatchObject({
      success: true,
      status: 'succeeded',
      userId: 'member-1',
      invite: 'sent',
    });
    expect(hoisted.sendMemberActivationInvite).toHaveBeenCalledWith({
      email: 'member@example.test',
      tenantId: 'tenant-1',
    });
  });

  it('keeps the membership and logs no email when the invite fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    hoisted.sendMemberActivationInvite.mockResolvedValue({
      sent: false,
      reason: 'delivery_failed',
    });

    await expect(verifyCashAttemptCore(ctx, approve)).resolves.toMatchObject({
      success: true,
      status: 'succeeded',
      invite: 'pending',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('example.test');
    log.mockRestore();
  });
  it('settles suppression without logging a delivery failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    hoisted.sendMemberActivationInvite.mockResolvedValue({
      sent: false,
      reason: 'email_suppressed',
    });
    try {
      const result = await verifyCashAttemptCore(ctx, approve);
      expect(result).toMatchObject({ success: true, invite: 'skipped' });
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
