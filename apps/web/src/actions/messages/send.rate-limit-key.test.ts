import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  sendDomain: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@interdomestik/domain-communications/messages/send', () => ({
  sendMessageDbCore: mocks.sendDomain,
}));

import { sendMessageDbCore } from './send.core';

const base = {
  authority: null,
  requestHeaders: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
  claimId: 'claim-1',
  content: 'Hello',
};
const session = (id: string) =>
  ({ user: { id, role: 'member', tenantId: 'tenant_ks' } }) as unknown as NonNullable<
    Parameters<typeof sendMessageDbCore>[0]['session']
  >;

describe('message send rate-limit key', () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.sendDomain.mockReset().mockResolvedValue({ success: true });
  });

  it('keys the send budget to the sender, not to a shared client IP', async () => {
    await sendMessageDbCore({ ...base, session: session('user-a') });
    await sendMessageDbCore({ ...base, session: session('user-b') });

    expect(mocks.enforceRateLimit.mock.calls.map(([args]) => args)).toEqual([
      expect.objectContaining({
        name: 'action:message-send',
        limit: 10,
        windowSeconds: 60,
        keySuffix: 'user-a',
        keyMode: 'suffix',
        productionSensitive: true,
      }),
      expect.objectContaining({ keySuffix: 'user-b', keyMode: 'suffix' }),
    ]);
  });

  it('falls back to the IP key when there is no session', async () => {
    await sendMessageDbCore({ ...base, session: null });

    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ keySuffix: null, keyMode: 'suffix' })
    );
  });

  it('refuses a limited sender before any message write', async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ limited: true });

    await expect(sendMessageDbCore({ ...base, session: session('user-a') })).resolves.toEqual({
      success: false,
      error: 'Too many requests. Please try again later.',
    });
    expect(mocks.sendDomain).not.toHaveBeenCalled();
  });
});
