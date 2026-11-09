import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  reads: [] as unknown[][],
  audits: [] as Array<Record<string, unknown>>,
  sendMemberActivationInvite: vi.fn(),
}));

vi.mock('@/lib/member-activation-invite', () => ({
  sendMemberActivationInvite: hoisted.sendMemberActivationInvite,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: async (_authority: unknown, callback: (tx: unknown) => unknown) =>
    callback(createTx()),
}));

import type { ProtectedActionContext } from '@/lib/safe-action';
import { canResendActivationInvite } from '../queries/read-access';
import { resendActivationInviteCore } from './resend-activation-invite';

// Each read ends in `for` (the attempt lock) or `limit`; both answer the next queued rows.
function createTx() {
  const next = async () => hoisted.reads.shift() ?? [];
  const chain: Record<string, unknown> = { for: next, limit: next };
  for (const step of ['from', 'innerJoin', 'where']) chain[step] = () => chain;
  return {
    select: () => chain,
    insert: () => ({
      values: async (row: Record<string, unknown>) => void hoisted.audits.push(row),
    }),
  };
}

function ctxFor(role: string, branchId: string | null = null) {
  return {
    tenantId: 'tenant-1',
    userRole: role,
    session: { user: { id: 'actor-1', role, branchId } },
    authority: mintTestTenantAuthority('tenant-1'),
    scope: { branchId, actorAgentId: null, attributedAgentId: null },
  } as unknown as ProtectedActionContext;
}

const unverified = {
  branchId: 'branch-1',
  memberId: 'member-1',
  email: 'member@example.test',
  emailVerified: false,
};
const input = { attemptId: 'att-1' };

function queue(...reads: unknown[][]) {
  hoisted.reads.splice(0, hoisted.reads.length, ...reads);
}

describe('resendActivationInviteCore (ACQ-2b2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.audits.length = 0;
    hoisted.sendMemberActivationInvite.mockResolvedValue({ sent: true });
  });

  it('resends to the committed member email and audits without the email', async () => {
    queue([{ id: 'att-1' }], [unverified], []);

    await expect(resendActivationInviteCore(ctxFor('tenant_admin'), input)).resolves.toEqual({
      success: true,
      invite: 'sent',
    });
    expect(hoisted.sendMemberActivationInvite).toHaveBeenCalledWith({
      email: 'member@example.test',
      tenantId: 'tenant-1',
    });
    expect(hoisted.audits).toEqual([
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'actor-1',
        action: 'MEMBER_ACTIVATION_INVITE_RESENT',
        entityType: 'payment_attempt',
        entityId: 'att-1',
      }),
    ]);
    expect(JSON.stringify(hoisted.audits)).not.toContain('example.test');
  });

  it('lets a branch manager resend only inside their branch', async () => {
    queue([{ id: 'att-1' }], [unverified], []);
    await expect(
      resendActivationInviteCore(ctxFor('branch_manager', 'branch-1'), input)
    ).resolves.toMatchObject({ success: true });

    queue([{ id: 'att-1' }], [unverified], []);
    await expect(
      resendActivationInviteCore(ctxFor('branch_manager', 'branch-2'), input)
    ).resolves.toEqual({ success: false, error: 'not_found' });
    expect(hoisted.sendMemberActivationInvite).toHaveBeenCalledTimes(1);
    expect(hoisted.audits).toHaveLength(1);
  });

  it.each([
    ['super_admin', true],
    ['admin', true],
    ['tenant_admin', true],
    ['branch_manager', true],
    ['staff', false],
    ['agent', false],
    ['member', false],
  ])('admits %s to resend: %s', (role, admitted) => {
    expect(canResendActivationInvite(role)).toBe(admitted);
  });

  it('refuses staff before any read', async () => {
    queue([{ id: 'att-1' }], [unverified], []);
    await expect(resendActivationInviteCore(ctxFor('staff', 'branch-1'), input)).resolves.toEqual({
      success: false,
      error: 'not_found',
    });
    expect(hoisted.reads).toHaveLength(3);
    expect(hoisted.sendMemberActivationInvite).not.toHaveBeenCalled();
  });

  it('answers not found for an unknown or unconverted attempt', async () => {
    queue([]);
    await expect(resendActivationInviteCore(ctxFor('admin'), input)).resolves.toEqual({
      success: false,
      error: 'not_found',
    });
    queue([{ id: 'att-1' }], []);
    await expect(resendActivationInviteCore(ctxFor('admin'), input)).resolves.toEqual({
      success: false,
      error: 'not_found',
    });
    expect(hoisted.sendMemberActivationInvite).not.toHaveBeenCalled();
  });

  it('never re-invites a member who already proved their mailbox', async () => {
    queue([{ id: 'att-1' }], [{ ...unverified, emailVerified: true }]);
    await expect(resendActivationInviteCore(ctxFor('admin'), input)).resolves.toEqual({
      success: false,
      error: 'already_active',
    });
    expect(hoisted.audits).toHaveLength(0);
  });

  it('rate-limits a resend inside the cooldown window', async () => {
    queue([{ id: 'att-1' }], [unverified], [{ id: 'audit-recent' }]);
    await expect(resendActivationInviteCore(ctxFor('admin'), input)).resolves.toEqual({
      success: false,
      error: 'cooldown',
    });
    expect(hoisted.audits).toHaveLength(0);
    expect(hoisted.sendMemberActivationInvite).not.toHaveBeenCalled();
  });

  it('reports a delivery failure and logs no email', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    hoisted.sendMemberActivationInvite.mockResolvedValue({
      sent: false,
      reason: 'delivery_failed',
    });
    queue([{ id: 'att-1' }], [unverified], []);

    await expect(resendActivationInviteCore(ctxFor('admin'), input)).resolves.toEqual({
      success: false,
      error: 'delivery_failed',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('example.test');
    log.mockRestore();
  });
  it('skips synthetic invites before resend audit or provider request', async () => {
    queue([{ id: 'att-1' }], [{ ...unverified, email: 'member@example.invalid' }]);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await resendActivationInviteCore(ctxFor('admin'), input)).toEqual({
        success: true,
        invite: 'skipped',
      });
      expect(hoisted.audits).toHaveLength(0);
      expect(hoisted.sendMemberActivationInvite).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
