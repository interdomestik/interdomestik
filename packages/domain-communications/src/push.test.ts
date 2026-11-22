import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { sendPushOutcome, sendPushToUser } from './push';

const authority = mintTestTenantAuthority('tenant-1');
const payload = { title: 'Title', body: 'Body', url: '/member/claims/claim-1' };

describe('sendPushOutcome', () => {
  const subscription = {
    endpoint: 'https://push.example/subscription',
    p256dh: 'key',
    auth: 'auth',
  };
  const options = { timeoutMs: 50 };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendNotification.mockReset();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private');
    vi.stubEnv('VAPID_SUBJECT', 'mailto:sender@example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('sends one subscription with per-request VAPID details', async () => {
    mocks.sendNotification.mockResolvedValue({});
    await expect(sendPushOutcome(subscription, payload, options)).resolves.toEqual({
      ok: true,
      transport: 'web-push',
    });
    expect(mocks.sendNotification).toHaveBeenCalledExactlyOnceWith(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: 'mailto:sender@example.com',
          publicKey: 'public',
          privateKey: 'private',
        },
        timeout: options.timeoutMs,
      }
    );
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it.each([404, 410])('maps HTTP %s to a terminal subscription failure', async statusCode => {
    mocks.sendNotification.mockRejectedValue({ statusCode, body: subscription.endpoint });
    await expect(sendPushOutcome(subscription, payload, options)).resolves.toEqual({
      ok: false,
      retryable: false,
      ambiguous: false,
      code: 'subscription_gone',
      detail: `web-push ${statusCode}`,
    });
    expect(mocks.tx.delete).not.toHaveBeenCalled();
  });

  it('returns an ambiguous and retryable outcome at the timeout', async () => {
    vi.useFakeTimers();
    mocks.sendNotification.mockReturnValue(new Promise(() => {}));
    const result = sendPushOutcome(subscription, payload, options);
    await vi.advanceTimersByTimeAsync(options.timeoutMs);
    await expect(result).resolves.toMatchObject({
      ok: false,
      retryable: true,
      ambiguous: true,
      code: 'timeout',
    });
  });
});

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
