import { beforeEach, describe, expect, it, vi } from 'vitest';

// WP-02 owner decision B (2026-11-19): five domain guards keep a plain `Error('Unauthorized…')`
// until the next Tenant Guard admission converts them. Their consumers must still fail closed:
// the activity entries reject before any read, and the analytics actions never return data.
const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  withTenantContext: vi.fn(),
  getSuperAdminKPIs: vi.fn(),
  getClaimLoadForecast: vi.fn(),
  auditLog: { table: 'audit_log' },
}));

vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: hoisted.getSession } } }));
vi.mock('@sentry/nextjs', () => ({ setUser: vi.fn(), setTag: vi.fn(), captureException: vi.fn() }));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: hoisted.withTenantContext,
  auditLog: hoisted.auditLog,
}));
vi.mock('@interdomestik/domain-analytics', () => ({
  getSuperAdminKPIs: hoisted.getSuperAdminKPIs,
  getTenantAdminKPIs: vi.fn(),
  getBranchKPIs: vi.fn(),
  getClaimLoadForecast: hoisted.getClaimLoadForecast,
  getBranchStressIndex: vi.fn(),
  getAgentCapacitySignal: vi.fn(),
}));

import { getLeadActivities, getMemberActivities } from './activities';
import { getSuperAdminKPIsAction } from './analytics/v2';
import { getClaimLoadForecastAction } from './analytics/v3';

const PLATFORM_DENIED = 'Unauthorized: Super Admin access required';

function sessionFor(role: string) {
  return {
    session: { id: 'session-1' },
    user: { id: 'user-1', email: 'u@example.test', name: 'U', role, tenantId: 'tenant-ks' },
  };
}

describe('consumers of the plain Unauthorized guards kept by decision B', () => {
  beforeEach(() => {
    hoisted.getSession.mockReset();
    hoisted.withTenantContext.mockReset();
    hoisted.getSuperAdminKPIs.mockReset();
    hoisted.getClaimLoadForecast.mockReset();
  });

  it.each([
    ['getMemberActivities', () => getMemberActivities('member-1')],
    ['getLeadActivities', () => getLeadActivities('lead-1')],
  ])('%s without a session rejects with the guard text and reads nothing', async (_name, call) => {
    hoisted.getSession.mockResolvedValue(null);

    await expect(call()).rejects.toThrow(/^Unauthorized$/u);
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it.each([
    ['getSuperAdminKPIsAction', getSuperAdminKPIsAction, hoisted.getSuperAdminKPIs],
    ['getClaimLoadForecastAction', getClaimLoadForecastAction, hoisted.getClaimLoadForecast],
  ])(
    '%s: a domain platform-actor refusal fails closed without data',
    async (_name, action, domain) => {
      hoisted.getSession.mockResolvedValue(sessionFor('super_admin'));
      domain.mockRejectedValue(new Error(PLATFORM_DENIED));

      const result = await action();

      // The wrapper no longer reads message text (design §4): the untyped throw is an internal
      // failure, never a success and never data. The typed action guard covers the reachable path.
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect(domain).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['getSuperAdminKPIsAction', getSuperAdminKPIsAction, hoisted.getSuperAdminKPIs],
    ['getClaimLoadForecastAction', getClaimLoadForecastAction, hoisted.getClaimLoadForecast],
  ])(
    '%s: a non-super-admin is refused UNAUTHORIZED before the domain',
    async (_n, action, domain) => {
      hoisted.getSession.mockResolvedValue(sessionFor('tenant_admin'));
      hoisted.withTenantContext.mockResolvedValue(undefined);

      await expect(action()).resolves.toMatchObject({ success: false, code: 'UNAUTHORIZED' });
      expect(domain).not.toHaveBeenCalled();
    }
  );
});
