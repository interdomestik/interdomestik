import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateResidenceCountryCore } from './update.core';

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  updateResidenceCountryDomain: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock('@interdomestik/domain-users', () => ({
  updateNotificationPreferencesCore: vi.fn(),
  updateResidenceCountryCore: mocks.updateResidenceCountryDomain,
}));

describe('updateResidenceCountryCore action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(false);
    mocks.updateResidenceCountryDomain.mockResolvedValue({
      decision: { changeState: 'pending_terms_reacceptance', toResidenceCountry: 'AT' },
      eventId: 'event-1',
      success: true,
    });
  });

  it('preserves accessTenantId when adapting the session for the domain mutation', async () => {
    await updateResidenceCountryCore({
      residenceCountry: 'AT',
      requestHeaders: new Headers(),
      session: {
        user: {
          accessTenantId: 'tenant_access',
          id: 'member-1',
          role: 'member',
          tenantId: 'tenant_legacy',
        },
      } as never,
    });

    expect(mocks.updateResidenceCountryDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          user: expect.objectContaining({
            accessTenantId: 'tenant_access',
            tenantId: 'tenant_legacy',
          }),
        }),
      }),
      expect.any(Object)
    );
  });
});
