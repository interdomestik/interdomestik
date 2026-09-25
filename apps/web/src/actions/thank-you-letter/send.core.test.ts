import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendThankYouLetterCore } from './send.core';

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock('@/lib/email', async () => ({
  ...(await vi.importActual<typeof import('@/lib/email')>('@/lib/email')),
  sendEmail: mocks.sendEmail,
}));

vi.mock('@/lib/tenant/tenant-hosts', () => ({
  coerceTenantId: (tenantId: string) =>
    ['tenant_ks', 'tenant_mk', 'tenant_al'].includes(tenantId) ? tenantId : null,
  resolveTenantAppOrigin: (tenantId: string) => `https://${tenantId}.example.test`,
}));

const params = {
  email: 'member@example.test',
  memberName: 'Member',
  memberNumber: 'MEM-1',
  planName: 'Annual membership',
  planPrice: 'EUR 20.00',
  planInterval: 'година',
  memberSince: new Date('2026-09-25T10:00:00.000Z'),
  expiresAt: new Date('2027-09-25T10:00:00.000Z'),
  providerReference: 'sub_provider_1',
  tenantId: 'tenant_mk',
  locale: 'mk' as const,
};

describe('sendThankYouLetterCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmail.mockResolvedValue({ success: true, id: 'email-1' });
  });

  it('sends localized confirmation without the inaccurate PDF attachment', async () => {
    await expect(sendThankYouLetterCore(params)).resolves.toEqual({ success: true });

    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.sendEmail.mock.calls[0]).toHaveLength(2);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      params.email,
      expect.objectContaining({
        subject: 'Членството е потврдено',
        html: expect.stringContaining('https://tenant_mk.example.test/mk/member/membership'),
      })
    );
  });

  it('fails closed for an unsupported tenant', async () => {
    await expect(
      sendThankYouLetterCore({ ...params, tenantId: 'tenant_foreign' })
    ).resolves.toEqual({ success: false, error: 'Unsupported confirmation tenant' });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('returns provider delivery failure instead of logging a false success', async () => {
    mocks.sendEmail.mockResolvedValue({ success: false, error: 'Email provider not configured' });

    await expect(sendThankYouLetterCore(params)).resolves.toEqual({
      success: false,
      error: 'Email provider not configured',
    });
  });
});
