import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ requestReset: vi.fn() }));
vi.mock('@/app/api/webhooks/paddle/paddle-onboarding', () => ({
  requestPasswordResetOnboarding: hoisted.requestReset,
}));

import { sendMemberActivationInvite } from './member-activation-invite';

describe('sendMemberActivationInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requestReset.mockResolvedValue(undefined);
  });

  it.each(['tenant_ks', 'tenant_mk'])(
    'requests a password-set link for %s members on their own tenant',
    async tenantId => {
      await expect(
        sendMemberActivationInvite({ email: 'm@example.com', tenantId })
      ).resolves.toEqual({ sent: true });
      expect(hoisted.requestReset).toHaveBeenCalledWith({ email: 'm@example.com', tenantId });
    }
  );

  it('refuses an unknown tenant instead of using another host', async () => {
    await expect(
      sendMemberActivationInvite({ email: 'm@example.com', tenantId: 'tenant_xx' })
    ).resolves.toEqual({ sent: false, reason: 'unknown_tenant' });
    expect(hoisted.requestReset).not.toHaveBeenCalled();
  });

  it('reports a failed reset request without throwing', async () => {
    hoisted.requestReset.mockRejectedValue(new Error('auth unavailable'));
    await expect(
      sendMemberActivationInvite({ email: 'm@example.com', tenantId: 'tenant_ks' })
    ).resolves.toEqual({ sent: false, reason: 'delivery_failed' });
  });
});
