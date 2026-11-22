import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';

const m = vi.hoisted(() => ({
  headers: vi.fn(),
  authorize: vi.fn(),
  reserve: vi.fn(),
  owner: vi.fn(),
  create: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: m.headers }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/tenant/public-intake-admission', () => ({
  authorizeOpenPublicIntake: m.authorize,
}));
vi.mock('@/lib/commercial-action-idempotency', () => ({
  runCommercialActionWithIdempotency: m.reserve,
}));
vi.mock('@/lib/business-leads/resolve-business-lead-owner', () => ({
  resolveBusinessLeadOwner: m.owner,
}));
vi.mock('@interdomestik/domain-leads', () => ({ createLead: m.create }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimitForAction: m.rateLimit }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { submitBusinessMembershipLead } from './business-membership-lead';

function businessForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    firstName: 'Test',
    lastName: 'Lead',
    companyName: 'Test Ltd',
    email: 'one-door@example.invalid',
    phone: '123456789',
    teamSize: '1-10',
    consent: 'yes',
  }))
    form.set(key, value);
  return form;
}

describe('business classification before effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'pilot-mk');
    m.headers.mockResolvedValue(new Headers({ host: 'ks.staging.interdomestik.com' }));
    m.authorize.mockImplementation(async (id: string | null) =>
      id ? mintTestTenantAuthority(id) : null
    );
    m.reserve.mockImplementation(({ execute }) => execute());
    m.owner.mockResolvedValue({ agentId: 'system', branchId: 'branch' });
    m.create.mockResolvedValue({ leadId: 'lead' });
    m.rateLimit.mockResolvedValue({ limited: false });
  });

  it.each([
    ['ks.staging.interdomestik.com', 'tenant_ks'],
    ['mk.staging.interdomestik.com', 'tenant_mk'],
    ['staging.interdomestik.com', 'pilot-mk'],
  ])('writes the %s admission tenant even with ambient foreign hints', async (host, tenantId) => {
    m.headers.mockResolvedValue(
      new Headers({ host, 'x-tenant-id': 'tenant_al', cookie: 'tenantId=tenant_al' })
    );
    const form = businessForm();
    form.set('onboardingTenant', tenantId);
    form.set('default_booking_tenant_id', tenantId);
    await expect(submitBusinessMembershipLead(null, form)).resolves.toMatchObject({
      success: true,
    });
    expect(m.authorize).toHaveBeenCalledExactlyOnceWith(tenantId);
    expect(readTenantAuthority(m.create.mock.calls[0][0].authority).tenantId).toBe(tenantId);
    expect(m.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      m.reserve.mock.invocationCallOrder[0]
    );
  });

  it.each([
    [[], [], 'CLASSIFICATION_REQUIRED'],
    [[' tenant_mk'], [], 'CLASSIFICATION_UNAVAILABLE'],
    [['tenant_ks', 'tenant_ks'], [], 'CLASSIFICATION_UNAVAILABLE'],
    [[], ['tenant_ks', 'tenant_ks'], 'CLASSIFICATION_UNAVAILABLE'],
    [[], ['bad'], 'CLASSIFICATION_UNAVAILABLE'],
    [['tenant_ks'], ['pilot-mk'], 'CLASSIFICATION_CONFLICT'],
    [['tenant_mk'], ['tenant_mk'], 'CLASSIFICATION_CONFLICT'],
    [['tenant_mk'], [], 'CLASSIFICATION_CONFLICT'],
    [[], ['tenant_mk'], 'CLASSIFICATION_CONFLICT'],
  ] as const)('rejects choices %j and hints %j before writing', async (choices, hints, code) => {
    const form = businessForm();
    for (const choice of choices) form.append('onboardingTenant', choice);
    for (const hint of hints) form.append('default_booking_tenant_id', hint);
    await expect(submitBusinessMembershipLead(null, form)).resolves.toMatchObject({
      success: false,
      code,
    });
    expect(m.authorize).toHaveBeenCalledExactlyOnceWith('tenant_ks');
    expect(m.reserve).not.toHaveBeenCalled();
    expect(m.owner).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it('accepts a matching hint without a choice', async () => {
    const form = businessForm();
    form.set('default_booking_tenant_id', 'tenant_ks');
    await expect(submitBusinessMembershipLead(null, form)).resolves.toMatchObject({
      success: true,
    });
    expect(m.authorize).toHaveBeenCalledWith('tenant_ks');
  });

  it('reports field errors before a missing classification without effects', async () => {
    const form = businessForm();
    form.set('firstName', '');
    form.delete('consent');
    await expect(submitBusinessMembershipLead(null, form)).resolves.toMatchObject({
      success: false,
      code: 'INVALID_PAYLOAD',
      issues: { firstName: expect.any(String) },
    });
    expect(m.reserve).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it('refuses unknown form fields after admission', async () => {
    const form = businessForm();
    form.set('onboardingTenant', 'tenant_ks');
    form.set('tenantId', 'tenant_mk');
    await expect(submitBusinessMembershipLead(null, form)).resolves.toMatchObject({
      success: false,
      code: 'INVALID_PAYLOAD',
    });
    expect(m.reserve).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it('answers CLOSED before reading form data, reserving, limiting or writing', async () => {
    m.authorize.mockResolvedValueOnce(null);
    const form = businessForm();
    const keys = vi.spyOn(form, 'keys');
    await expect(submitBusinessMembershipLead(null, form)).resolves.toMatchObject({
      success: false,
      code: 'CLOSED',
    });
    expect(keys).not.toHaveBeenCalled();
    expect(m.reserve).not.toHaveBeenCalled();
    expect(m.rateLimit).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
});
