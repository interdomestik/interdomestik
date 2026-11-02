import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const whereSelect = vi.fn();
  const deleteWhere = vi.fn();
  const tx = {
    select: vi.fn(),
    delete: vi.fn(),
  };
  return {
    deleteWhere,
    limit,
    sendNotification: vi.fn(),
    setVapidDetails: vi.fn(),
    tx,
    whereSelect,
    withTenantContext: vi.fn(),
  };
});

vi.mock('web-push', () => ({
  default: {
    sendNotification: mocks.sendNotification,
    setVapidDetails: mocks.setVapidDetails,
  },
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/schema', () => ({
  pushSubscriptions: {
    auth: 'ps.auth',
    endpoint: 'ps.endpoint',
    p256dh: 'ps.p256dh',
    tenantId: 'ps.tenant_id',
    userId: 'ps.user_id',
  },
  userNotificationPreferences: {
    pushClaimUpdates: 'unp.push_claim_updates',
    pushMessages: 'unp.push_messages',
    tenantId: 'unp.tenant_id',
    userId: 'unp.user_id',
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn(() => ({ scoped: true })),
}));

vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn() }));

import { sendPushToUser } from './push';

const authority = mintTestTenantAuthority('tenant-1');
const payload = { title: 'Title', body: 'Body', url: '/member/claims/claim-1' };

describe('sendPushToUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';

    // First tenant transaction reads preferences, the second reads subscriptions, later ones delete.
    let selectCall = 0;
    mocks.tx.select.mockImplementation(() => {
      selectCall += 1;
      const result =
        selectCall === 1
          ? { limit: vi.fn().mockResolvedValue([{ pushClaimUpdates: true, pushMessages: true }]) }
          : Promise.resolve([{ endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' }]);
      return { from: () => ({ where: () => result }) };
    });
    mocks.tx.delete.mockReturnValue({ where: mocks.deleteWhere });
    mocks.deleteWhere.mockResolvedValue(undefined);
    mocks.withTenantContext.mockImplementation(
      async (_authority: unknown, action: (tx: unknown) => unknown) => action(mocks.tx)
    );
    mocks.sendNotification.mockResolvedValue({});
  });

  it('runs every read under the supplied authority and hands it to the audit logger', async () => {
    const logAuditEvent = vi.fn();

    const result = await sendPushToUser('user-1', 'claim_updates', payload, {
      authority,
      logAuditEvent,
    });

    expect(result).toEqual({ success: true, okCount: 1, failCount: 0 });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(2);
    for (const call of mocks.withTenantContext.mock.calls) expect(call[0]).toBe(authority);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent.mock.calls[0]?.[0].authority).toBe(authority);
  });

  it('removes an expired subscription under the same authority', async () => {
    mocks.sendNotification.mockRejectedValue({ statusCode: 410 });

    const result = await sendPushToUser('user-1', 'messages', payload, { authority });

    expect(result).toEqual({ success: false, okCount: 0, failCount: 1 });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(3);
    for (const call of mocks.withTenantContext.mock.calls) expect(call[0]).toBe(authority);
    expect(mocks.tx.delete).toHaveBeenCalledTimes(1);
  });

  it('skips without touching tenant data when no authority is supplied', async () => {
    const result = await sendPushToUser('user-1', 'messages', payload, {
      authority: undefined as never,
    });

    expect(result).toEqual({ success: false, skipped: true, reason: 'missing_tenant' });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('skips when VAPID keys are not configured', async () => {
    delete process.env.VAPID_PRIVATE_KEY;

    const result = await sendPushToUser('user-1', 'messages', payload, { authority });

    expect(result).toMatchObject({ skipped: true, reason: 'missing_vapid' });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });
});
