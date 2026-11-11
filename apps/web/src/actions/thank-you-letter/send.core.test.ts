import { stubDeploymentOrigin } from '@/lib/deployment-origin.test-support';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  prepareThankYouLetterCore,
  sendPreparedThankYouLetterCore,
  sendThankYouLetterCore,
} from './send.core';

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock('@/lib/email', async () => ({
  ...(await vi.importActual<typeof import('@/lib/email')>('@/lib/email')),
  sendEmail: mocks.sendEmail,
}));

vi.mock('@/lib/tenant/tenant-hosts', () => ({
  coerceTenantId: (tenantId: string) =>
    ['tenant_ks', 'tenant_mk', 'tenant_al'].includes(tenantId) ? tenantId : null,
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
  idempotencyKey: 'membership-confirmation:v1:tenant_mk:sub_provider_1',
};

afterEach(() => vi.unstubAllEnvs());

describe('sendThankYouLetterCore', () => {
  beforeEach(() => {
    stubDeploymentOrigin();
    vi.clearAllMocks();
    mocks.sendEmail.mockResolvedValue({ success: true, id: 'email-1' });
  });

  it('sends localized confirmation without the inaccurate PDF attachment', async () => {
    await expect(sendThankYouLetterCore(params)).resolves.toEqual({ success: true, id: 'email-1' });

    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.sendEmail.mock.calls[0]).toHaveLength(3);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      params.email,
      expect.objectContaining({
        subject: 'Членството е потврдено',
        html: expect.stringContaining('https://staging.interdomestik.com/mk/member/membership'),
      }),
      { idempotencyKey: 'membership-confirmation:v1:tenant_mk:sub_provider_1' }
    );
  });

  it('prepares the German confirmation the Paddle webhook delivers', () => {
    const prepared = prepareThankYouLetterCore({
      email: params.email,
      memberName: params.memberName,
      memberNumber: params.memberNumber,
      planName: params.planName,
      planPrice: params.planPrice,
      memberSince: params.memberSince,
      expiresAt: params.expiresAt,
      providerReference: params.providerReference,
      planInterval: 'Jahr',
      tenantId: 'tenant_ks',
      locale: 'de',
    });

    expect(prepared.subject).toBe('Mitgliedschaft bestätigt');
    expect(prepared.html).toContain('<html lang="de">');
    expect(prepared.text).toContain('https://staging.interdomestik.com/de/member/membership');
  });

  it('fails closed for an unsupported tenant', async () => {
    await expect(
      sendThankYouLetterCore({ ...params, tenantId: 'tenant_foreign' })
    ).resolves.toEqual({ success: false, error: 'Unsupported confirmation tenant' });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('fails closed for an unsupported runtime locale', async () => {
    await expect(sendThankYouLetterCore({ ...params, locale: 'hr' as never })).resolves.toEqual({
      success: false,
      error: 'Unsupported confirmation locale',
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('fails closed when the delivery key does not match the tenant and provider reference', async () => {
    await expect(
      sendThankYouLetterCore({ ...params, idempotencyKey: 'membership-confirmation:v1:other:key' })
    ).resolves.toEqual({
      success: false,
      error: 'Invalid confirmation idempotency key',
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('returns provider delivery failure instead of logging a false success', async () => {
    mocks.sendEmail.mockResolvedValue({ success: false, error: 'Email provider not configured' });

    await expect(sendThankYouLetterCore(params)).resolves.toEqual({
      success: false,
      error: 'Email provider not configured',
    });
  });

  it('passes the complete persisted source to the shared delivery renderer', async () => {
    const request = {
      to: 'stored@example.test',
      subject: 'Stored subject',
      html: '<p>Stored body</p>',
      text: 'Stored body',
      source: { version: 1, kind: 'thank-you', params: { dashboardUrl: '/mk/member' } },
    };

    await expect(
      sendPreparedThankYouLetterCore({
        request,
        providerReference: params.providerReference,
        tenantId: params.tenantId,
        idempotencyKey: params.idempotencyKey,
      })
    ).resolves.toEqual({ success: true, id: 'email-1' });
    expect(mocks.sendEmail).toHaveBeenCalledWith(request.to, request, {
      idempotencyKey: params.idempotencyKey,
    });
  });
});
