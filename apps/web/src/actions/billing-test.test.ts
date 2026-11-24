import { SalesClosedError } from '@interdomestik/database/pilot-switch';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockActivateSubscription } from './billing-test';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  authorize: vi.fn(),
  transaction: vi.fn(),
  checkSales: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  upsert: vi.fn(),
  resolvePlan: vi.fn(),
  membership: vi.fn(),
  revalidate: vi.fn(),
  record: vi.fn(),
}));
vi.mock('@/lib/runtime-environment', () => ({ isBillingTestActivationEnabled: mocks.enabled }));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.transaction,
}));
vi.mock('@interdomestik/database/pilot-switch', async original => ({
  ...(await original<typeof import('@interdomestik/database/pilot-switch')>()),
  assertNewSalesOpen: mocks.checkSales,
}));
vi.mock('@interdomestik/domain-membership-billing/annual-membership', () => ({
  resolveCanonicalMembershipPlanState: mocks.resolvePlan,
  createActiveAnnualMembershipFulfillment: mocks.membership,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.record }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

const authority = mintTestTenantAuthority('session-tenant');
const tx = { insert: mocks.insert };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.authorize.mockResolvedValue({ authority, session: { user: { id: 'session-user' } } });
  mocks.transaction.mockImplementation(async (_authority, work) => work(tx));
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.upsert });
  mocks.resolvePlan.mockResolvedValue({ planId: 'standard', planKey: 'plan-row' });
  mocks.membership.mockReturnValue({ status: 'active' });
});

describe('billing test admission', () => {
  it('keeps the runtime gate ahead of authorization and the tenant switch', async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(mockActivateSubscription('plan', 'price')).rejects.toThrow(
      'Billing test mode not enabled'
    );
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('requires an authorized session before reading the tenant switch', async () => {
    mocks.authorize.mockResolvedValue(null);
    await expect(mockActivateSubscription('plan', 'price')).rejects.toThrow('Unauthorized');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('returns CLOSED before the upsert or revalidation when the switch is closed', async () => {
    mocks.checkSales.mockRejectedValue(new SalesClosedError());
    await expect(mockActivateSubscription('plan', 'price')).resolves.toEqual({
      success: false,
      code: 'CLOSED',
      error: 'CLOSED',
    });
    expect(mocks.transaction).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(mocks.checkSales).toHaveBeenCalledExactlyOnceWith(tx, 'session-tenant');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it('records a switch read failure and refuses the activation', async () => {
    const failure = new Error('Switch query failed');
    mocks.checkSales.mockRejectedValue(failure);
    await expect(mockActivateSubscription('plan', 'price')).resolves.toMatchObject({
      success: false,
      code: 'CLOSED',
    });
    expect(mocks.record).toHaveBeenCalledWith(failure, expect.any(Object));
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it('upserts cover for the session member when sales are open', async () => {
    await expect(mockActivateSubscription('plan', 'price')).resolves.toEqual({ success: true });
    expect(mocks.checkSales).toHaveBeenCalledBefore(mocks.insert);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'session-tenant',
        userId: 'session-user',
        status: 'active',
      })
    );
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });
});
