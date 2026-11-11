import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
const m = vi.hoisted(() => ({
  active: vi.fn(),
  authorize: vi.fn(),
  reserve: vi.fn(),
  owner: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@interdomestik/database', () => ({
  readActiveTenantId: m.active,
  authorizePublicSiteTenant: m.authorize,
}));
vi.mock('@/lib/commercial-action-idempotency', () => ({
  runCommercialActionWithIdempotency: m.reserve,
}));
vi.mock('@/lib/business-leads/resolve-business-lead-owner', () => ({
  resolveBusinessLeadOwner: m.owner,
}));
vi.mock('@interdomestik/domain-leads', () => ({ createLead: m.create }));
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: () => Promise.resolve({ limited: false }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
import {
  submitBusinessMembershipLead,
  submitBusinessMembershipLeadCore,
} from './business-membership-lead';
const data = {
  firstName: 'Test',
  lastName: 'Lead',
  companyName: 'Test Ltd',
  email: 'one-door@example.invalid',
  phone: '123456789',
  teamSize: '1-10',
  consent: true,
};
const ambient = new Headers({
  host: 'ks.localhost',
  'x-tenant-id': 'tenant_ks',
  cookie: 'tenantId=tenant_ks',
  referer: 'https://mk.localhost/de?default_booking_tenant_id=tenant_mk',
});
describe('business classification before effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.active.mockImplementation((id: string) => Promise.resolve(id));
    m.authorize.mockImplementation((id: string) => Promise.resolve(mintTestTenantAuthority(id)));
    m.reserve.mockImplementation(({ execute }) => execute());
    m.owner.mockResolvedValue({ agentId: 'system', branchId: 'branch' });
    m.create.mockResolvedValue({ leadId: 'lead' });
  });
  it.each(['tenant_ks', 'tenant_mk', 'pilot-mk'])(
    'persists explicit and hinted %s ownership',
    async id => {
      const result = await submitBusinessMembershipLeadCore({
        requestHeaders: ambient,
        data: { ...data, classification: { choice: id, bookingHints: [id] } },
      });
      expect(result.success).toBe(true);
      expect(m.authorize).toHaveBeenCalledExactlyOnceWith(id);
      expect(readTenantAuthority(m.create.mock.calls[0][0].authority).tenantId).toBe(id);
      expect(m.active.mock.invocationCallOrder[0]).toBeLessThan(
        m.reserve.mock.invocationCallOrder[0]
      );
    }
  );
  it.each([
    undefined,
    {},
    { choice: 'tenant_al' },
    { choice: ' tenant_mk' },
    { choice: ['tenant_mk'] },
    { bookingHints: ['pilot-mk', 'pilot-mk'] },
    { bookingHints: ['bad'] },
    { choice: 'tenant_mk', bookingHints: ['pilot-mk'] },
  ])('rejects %j with no reservation or lead', async classification => {
    const result = await submitBusinessMembershipLeadCore({
      requestHeaders: ambient,
      data: { ...data, classification },
    });
    expect(result.success ? '' : result.code).toMatch(/^CLASSIFICATION_/);
    expect(m.authorize).not.toHaveBeenCalled();
    expect(m.reserve).not.toHaveBeenCalled();
    expect(m.owner).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it('keeps the classification code when the property is omitted from valid fields', async () => {
    const result = await submitBusinessMembershipLeadCore({
      requestHeaders: ambient,
      data: data as Parameters<typeof submitBusinessMembershipLeadCore>[0]['data'],
    });
    expect(result).toMatchObject({ success: false, code: 'CLASSIFICATION_REQUIRED' });
    expect(m.reserve).not.toHaveBeenCalled();
  });
  it('rechecks activity before reservation and handles a tenant deactivated after option loading', async () => {
    m.authorize.mockResolvedValueOnce(null);
    expect(
      (
        await submitBusinessMembershipLeadCore({
          requestHeaders: ambient,
          data: { ...data, classification: { choice: 'pilot-mk' } },
        })
      ).success
    ).toBe(false);
    expect(m.reserve).not.toHaveBeenCalled();
    m.active.mockResolvedValueOnce(null);
    expect(
      (
        await submitBusinessMembershipLeadCore({
          requestHeaders: ambient,
          data: { ...data, classification: { choice: 'tenant_mk' } },
        })
      ).success
    ).toBe(false);
    expect(m.create).not.toHaveBeenCalled();
  });
  it('preserves repeated booking hints and duplicate form choices for rejection', async () => {
    const form = new FormData();
    form.append('onboardingTenant', 'tenant_mk');
    form.append('onboardingTenant', 'tenant_mk');
    form.append('default_booking_tenant_id', 'tenant_mk');
    form.append('default_booking_tenant_id', 'tenant_mk');
    expect((await submitBusinessMembershipLead(null, form)).success).toBe(false);
    expect(m.reserve).not.toHaveBeenCalled();
  });
  it('accepts a hint without choice and rejects missing choice despite ambient KS selectors', async () => {
    expect(
      (
        await submitBusinessMembershipLeadCore({
          requestHeaders: ambient,
          data: { ...data, classification: { bookingHints: ['pilot-mk'] } },
        })
      ).success
    ).toBe(true);
    expect(m.authorize).toHaveBeenCalledWith('pilot-mk');
  });
  it('reports field errors before a missing classification without effects', async () => {
    const result = await submitBusinessMembershipLeadCore({
      requestHeaders: ambient,
      data: { ...data, firstName: '', consent: false, classification: {} },
    });
    expect(result).toMatchObject({ success: false, code: 'INVALID_PAYLOAD' });
    expect(result.success ? {} : result.issues).toHaveProperty('firstName');
    expect(m.authorize).not.toHaveBeenCalled();
    expect(m.reserve).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
});
