import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintIngressCapability } from '@interdomestik/database/ingress-registrar';
import { runNotificationDeliverySchedule } from './notification-delivery-schedule';

const mocks = vi.hoisted(() => ({ tenants: vi.fn(), run: vi.fn() }));
vi.mock('@interdomestik/database', () => ({ listScheduledTenantWork: mocks.tenants }));
vi.mock('@interdomestik/domain-claims/staff-claims/scope', () => ({ canStaffReadClaim: vi.fn() }));
vi.mock('@interdomestik/domain-communications/notification-deliveries', () => ({
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
});
