import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintIngressCapability } from '@interdomestik/database/ingress-registrar';
import { runNotificationDeliverySchedule } from './notification-delivery-schedule';

const mocks = vi.hoisted(() => ({ tenants: vi.fn(), run: vi.fn() }));
vi.mock('@interdomestik/database', () => ({ listScheduledTenantWork: mocks.tenants }));
vi.mock('@interdomestik/domain-claims/staff-claims/scope', () => ({
  buildStaffClaimReadScope: vi.fn(),
}));
vi.mock('@interdomestik/domain-claims/claims/notification-delivery-runner', () => ({
  runNotificationDeliveries: mocks.run,
}));
const summary = {
  sent: 1,
  skipped: 0,
  queued: 0,
  failed: 0,
  lease_lost: 0,
  lease_short: 0,
  budget_short: 0,
};
const work = [
  { tenantId: 'a', authority: {} },
  { tenantId: 'b', authority: {} },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('notification delivery schedule', () => {
  it('rotates the tenant that gets first access to the shared budget', async () => {
    const ingress = mintIngressCapability('inngest');
    mocks.tenants.mockResolvedValue(work);
    mocks.run.mockResolvedValue(summary);
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    await runNotificationDeliverySchedule(ingress);
    now.mockReturnValue(300_000);
    await runNotificationDeliverySchedule(ingress);
    expect(mocks.tenants).toHaveBeenCalledWith(ingress);
    expect(mocks.run.mock.calls.map(call => call[0])).toEqual([
      work[0].authority,
      work[1].authority,
      work[1].authority,
      work[0].authority,
    ]);
  });

  it('records a failed tenant and processes later tenants', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.tenants.mockResolvedValue(work);
    mocks.run.mockRejectedValueOnce(new Error('sensitive cause')).mockResolvedValueOnce(summary);
    const result = await runNotificationDeliverySchedule(mintIngressCapability('inngest'));
    expect(result).toMatchObject({ tenantFailures: 1, tenants: 1, sent: 1 });
    expect(error).toHaveBeenCalledWith(expect.any(String), {
      tenantId: 'a',
      error: expect.any(Error),
    });
  });

  it('does not start another tenant after the shared budget is spent even if the wall clock moves backward', async () => {
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(300_000);
    const elapsed = vi.spyOn(performance, 'now').mockReturnValue(0);
    mocks.tenants.mockResolvedValue(work);
    mocks.run.mockImplementation(() => {
      wallClock.mockReturnValue(0);
      elapsed.mockReturnValue(150_001);
      return Promise.resolve(summary);
    });

    const result = await runNotificationDeliverySchedule(mintIngressCapability('inngest'));

    expect(mocks.run).toHaveBeenCalledExactlyOnceWith(work[1].authority, expect.anything(), {
      budgetMs: 240_000,
      providerTimeoutMs: 60_000,
    });
    expect(result.tenants).toBe(1);
  });
});
