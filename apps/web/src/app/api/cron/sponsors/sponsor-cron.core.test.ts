import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  provisioning: vi.fn(),
  handovers: vi.fn(),
  cache: vi.fn(),
  renewals: vi.fn(),
  offers: vi.fn(),
  retention: vi.fn(),
  outbox: vi.fn(),
  deps: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  listScheduledTenantWork: async () => [
    { tenantId: 'tenant_ks', authority: 'auth-ks' },
    { tenantId: 'tenant_mk', authority: 'auth-mk' },
  ],
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/sponsor-jobs', () => ({
  runSponsorProvisioning: h.provisioning,
  sponsorCredentialCheck: () => async () => false,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/handover-worker', () => ({
  runSponsorHandovers: h.handovers,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/paddle-handover-client', () => ({
  createHandoverPaddleClient: () => ({}),
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/cache-job', () => ({
  runSponsorCacheJob: h.cache,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/mail-producers', () => ({
  queueRenewalNotices: h.renewals,
  queueEndOffers: h.offers,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/retention', () => ({
  runSponsorRetention: h.retention,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/mail-sender', () => ({
  runSponsorMailOutbox: h.outbox,
}));
vi.mock('./_mail', () => ({ sponsorMailDeps: h.deps }));

import { isHourlyPass, runSponsorCronCore } from './sponsor-cron.core';

const run = (iso: string) => runSponsorCronCore({ ingress: {} as never, now: new Date(iso) });

describe('sponsor cron core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.provisioning.mockResolvedValue({ processed: 2, failed: 0 });
    h.handovers.mockResolvedValue({ processed: 1, failed: 0 });
    h.outbox.mockResolvedValue({ claimed: 3, outcomes: {} });
    h.deps.mockReturnValue({});
  });

  it('runs hourly work only in the first pass of an hour', () => {
    expect(isHourlyPass(new Date('2027-01-01T10:04:59Z'))).toBe(true);
    expect(isHourlyPass(new Date('2027-01-01T10:05:00Z'))).toBe(false);
  });

  it('runs every step for every tenant in order on an hourly pass', async () => {
    const results = await run('2027-01-01T10:00:00Z');
    expect(results.map(result => result.tenantId)).toEqual(['tenant_ks', 'tenant_mk']);
    expect(results[0]).toMatchObject({ mail: { claimed: 3 }, failedSteps: [], failed: false });
    for (const job of [h.cache, h.renewals, h.offers, h.retention]) {
      expect(job).toHaveBeenCalledTimes(2);
    }
  });

  it('skips hourly work between hours but still sends mail', async () => {
    await run('2027-01-01T10:30:00Z');
    expect(h.cache).not.toHaveBeenCalled();
    expect(h.retention).not.toHaveBeenCalled();
    expect(h.outbox).toHaveBeenCalledTimes(2);
  });

  it('reports a failing step and keeps running the other steps and tenants', async () => {
    h.provisioning.mockRejectedValueOnce(new Error('boom'));
    h.deps.mockImplementationOnce(() => {
      throw new Error('missing secret');
    });
    const results = await run('2027-01-01T10:00:00Z');
    expect(results[0]).toMatchObject({ failedSteps: ['provisioning', 'mail'], failed: true });
    expect(results[0].handovers).toEqual({ processed: 1, failed: 0 });
    expect(results[1]).toMatchObject({ failedSteps: [], failed: false });
  });
});
