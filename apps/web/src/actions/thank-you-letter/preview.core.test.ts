import { describe, expect, it, vi } from 'vitest';
import { previewThankYouLetterCore } from './preview.core';

vi.mock('@/lib/tenant/tenant-hosts', () => ({
  coerceTenantId: (tenantId: string) => (tenantId === 'tenant_ks' ? tenantId : null),
  resolveTenantAppOrigin: (tenantId: string) => `https://${tenantId}.example.test`,
}));

const params = {
  memberName: 'Member One',
  memberNumber: 'MEM-1',
  planName: 'Annual membership',
  planPrice: 'EUR 20.00',
  planInterval: 'year',
  memberSince: new Date('2026-09-25T10:00:00.000Z'),
  expiresAt: new Date('2027-09-25T10:00:00.000Z'),
  providerReference: 'sub_provider_1',
  tenantId: 'tenant_ks',
  locale: 'en' as const,
};

describe('previewThankYouLetterCore', () => {
  it('derives the dashboard link from the validated tenant', async () => {
    const preview = await previewThankYouLetterCore(params);

    expect(preview.html).toContain('https://tenant_ks.example.test/en/member/membership');
    expect(preview.text).toContain('https://tenant_ks.example.test/en/member/membership');
  });

  it('fails closed instead of rendering a caller-supplied origin', async () => {
    await expect(
      previewThankYouLetterCore({ ...params, tenantId: 'javascript:alert(1)' })
    ).rejects.toThrow('Unsupported confirmation tenant');
  });
});
