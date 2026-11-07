import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@interdomestik/domain-communications/email/member-activation', () => ({
  sendMemberActivationEmail: hoisted.send,
}));

import { sendMemberActivationInvite } from './member-activation-invite';

describe('sendMemberActivationInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.send.mockResolvedValue({ success: true, id: 'msg-1' });
  });

  it.each([
    ['tenant_ks', 'sq'],
    ['tenant_mk', 'mk'],
  ])('sends %s members to their own tenant sign-in page in %s', async (tenantId, locale) => {
    await expect(sendMemberActivationInvite({ email: 'm@example.com', tenantId })).resolves.toEqual(
      {
        sent: true,
      }
    );
    const [to, url, sentLocale] = hoisted.send.mock.calls[0]!;
    expect(to).toBe('m@example.com');
    expect(sentLocale).toBe(locale);
    expect(new URL(url).pathname).toBe(`/${locale}/login`);
    expect(new URL(url).search).toBe('');
  });

  it('refuses an unknown tenant instead of using another host', async () => {
    await expect(
      sendMemberActivationInvite({ email: 'm@example.com', tenantId: 'tenant_xx' })
    ).resolves.toEqual({ sent: false, reason: 'unknown_tenant' });
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it.each([
    ['a failed delivery', () => hoisted.send.mockResolvedValue({ success: false, error: 'x' })],
    ['a thrown delivery error', () => hoisted.send.mockRejectedValue(new Error('smtp down'))],
  ])('reports %s without throwing', async (_label, arrange) => {
    arrange();
    await expect(
      sendMemberActivationInvite({ email: 'm@example.com', tenantId: 'tenant_ks' })
    ).resolves.toEqual({ sent: false, reason: 'delivery_failed' });
  });
});
