import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  provisioning: vi.fn(),
  handovers: vi.fn(),
  cache: vi.fn(),
  renewals: vi.fn(),
  offers: vi.fn(),
  captureException: vi.fn(),
  outbox: vi.fn(),
  deps: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  listScheduledTenantWork: async () => [
    { tenantId: 'tenant_ks', authority: mintTestTenantAuthority('tenant_ks') },
    { tenantId: 'tenant_mk', authority: mintTestTenantAuthority('tenant_mk') },
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
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(() => {
    throw new Error('Unexpected retention transaction');
  }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: h.captureException }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: () => Promise.resolve(null) }));
vi.mock('@interdomestik/domain-membership-billing/sponsors/mail-sender', () => ({
  runSponsorMailOutbox: h.outbox,
}));
vi.mock('./_mail', () => ({ sponsorMailDeps: h.deps }));

import { GET } from './route';
import { isHourlyPass, runSponsorCronCore } from './sponsor-cron.core';

const run = (iso: string) => runSponsorCronCore({ ingress: {} as never, now: new Date(iso) });

describe('sponsor cron core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.provisioning.mockResolvedValue({ processed: 2, failed: 0, outcomes: {} });
    h.handovers.mockResolvedValue({ processed: 1, failed: 0 });
    h.outbox.mockResolvedValue({ claimed: 3, outcomes: {} });
    h.deps.mockReturnValue({});
  });
  afterEach(() => vi.unstubAllEnvs());

  const authorizedRequest = () => {
    vi.stubEnv('CRON_SECRET', 'synthetic-sponsor-cron-secret');
    return new NextRequest('https://example.test/api/cron/sponsors', {
      headers: { authorization: 'Bearer synthetic-sponsor-cron-secret' },
    });
  };

  it.each(['finish_failed', 'queued', 'failed', 'lease_lost'])(
    'reports %s mail outcomes as HTTP failures and continues other tenants',
    async outcome => {
      h.outbox.mockResolvedValueOnce({ claimed: 2, outcomes: { [outcome]: 1, sent: 1 } });
      const response = await GET(authorizedRequest());

      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        success: false,
        tenants: [
          {
            tenantId: 'tenant_ks',
            mail: { claimed: 2, outcomes: { [outcome]: 1, sent: 1 } },
            failedSteps: ['mail'],
            failed: true,
          },
          { tenantId: 'tenant_mk', failed: false },
        ],
      });
      expect(h.outbox).toHaveBeenCalledTimes(2);
    }
  );

  it('returns an HTTP failure after a tenant step throws and still runs independent work', async () => {
    const error = new Error('provisioning unavailable');
    h.provisioning.mockRejectedValueOnce(error);
    const response = await GET(authorizedRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      success: false,
      tenants: [{ failedSteps: ['provisioning'], failed: true }, { failed: false }],
    });
    expect(h.outbox).toHaveBeenCalledTimes(2);
    expect(h.captureException).toHaveBeenCalledWith(error, {
      tags: { operation: 'sponsor.cron.provisioning' },
    });
  });

  it.each(['provisioning', 'handovers'] as const)(
    'reports an item failure returned by %s',
    async step => {
      h[step].mockResolvedValueOnce({ processed: 1, failed: 1, outcomes: {} });
      const response = await GET(authorizedRequest());

      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        success: false,
        tenants: [
          { [step]: { processed: 1, failed: 1 }, failedSteps: [step], failed: true },
          { failed: false },
        ],
      });
      expect(h.outbox).toHaveBeenCalledTimes(2);
    }
  );

  it('returns HTTP success when both tenants finish, including skipped mail', async () => {
    h.outbox.mockResolvedValue({ claimed: 2, outcomes: { sent: 1, skipped: 1 } });
    const response = await GET(authorizedRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      tenants: [
        { mail: { claimed: 2, outcomes: { sent: 1, skipped: 1 } }, failed: false },
        { failed: false },
      ],
    });
  });

  it('rejects an unauthorized request before running tenant work', async () => {
    const request = authorizedRequest();
    request.headers.delete('authorization');
    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(h.outbox).not.toHaveBeenCalled();
  });

  it('runs hourly work only in the first pass of an hour', () => {
    expect(isHourlyPass(new Date('2027-01-01T10:04:59Z'))).toBe(true);
    expect(isHourlyPass(new Date('2027-01-01T10:05:00Z'))).toBe(false);
  });

  it('records dormant retention without any database effects for each hourly tenant', async () => {
    const results = await run('2027-01-01T10:00:00Z');
    expect(results.map(result => result.tenantId)).toEqual(['tenant_ks', 'tenant_mk']);
    for (const result of results)
      expect(result).toMatchObject({
        retention: { state: 'skipped', reason: 'sponsor_retention_dormant' },
        mail: { claimed: 3 },
        failedSteps: [],
        failed: false,
      });
    for (const job of [h.cache, h.renewals, h.offers]) {
      expect(job).toHaveBeenCalledTimes(2);
    }
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });

  it('skips hourly work between hours but still sends mail', async () => {
    const results = await run('2027-01-01T10:30:00Z');
    expect(h.cache).not.toHaveBeenCalled();
    expect(results.map(result => result.retention)).toEqual([null, null]);
    expect(h.outbox).toHaveBeenCalledTimes(2);
  });

  it('reports closed sales as skipped provisioning while other work continues', async () => {
    h.provisioning.mockResolvedValueOnce({
      processed: 2,
      failed: 0,
      outcomes: { seated: 1, sales_closed: 1 },
    });
    const results = await run('2027-01-01T10:30:00Z');
    expect(results[0]).toMatchObject({
      provisioning: { processed: 2, failed: 0, disabled: false, salesClosed: 1 },
      failedSteps: [],
    });
    expect(results[0].handovers).toEqual({ processed: 1, failed: 0 });
  });

  it('reports a failing step and keeps running the other steps and tenants', async () => {
    const provisioningError = new Error('boom');
    h.provisioning.mockRejectedValueOnce(provisioningError);
    h.deps.mockImplementationOnce(() => {
      throw new Error('missing secret');
    });
    const results = await run('2027-01-01T10:00:00Z');
    expect(results[0]).toMatchObject({ failedSteps: ['provisioning', 'mail'], failed: true });
    expect(results[0].handovers).toEqual({ processed: 1, failed: 0 });
    expect(results[1]).toMatchObject({ failedSteps: [], failed: false });
    expect(h.captureException).toHaveBeenCalledWith(provisioningError, {
      tags: { operation: 'sponsor.cron.provisioning' },
    });
  });

  it('stops the producer sequence after a failure and delivers independently claimed mail', async () => {
    const producerError = new Error('producer unavailable');
    h.renewals.mockRejectedValueOnce(producerError);
    const [failed, next] = await run('2027-01-01T10:00:00Z');
    expect(h.outbox).toHaveBeenCalledTimes(2);
    expect(h.offers.mock.calls.map(([authority]) => authority)).toEqual([
      h.outbox.mock.calls[1][0],
    ]);
    expect(h.captureException).toHaveBeenCalledWith(producerError, {
      tags: { operation: 'sponsor.cron.producers' },
    });
    expect(failed).toMatchObject({ failedSteps: ['producers'], failed: true });
    expect(next).toMatchObject({ failed: false });
  });
});
