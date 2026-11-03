import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  assertNoCrmForecastSnapshotBackfillPiiKeys: vi.fn(),
  authorizeCronRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  getCrmForecastSnapshotBackfillStatus: vi.fn(),
  listScheduledTenantWork: vi.fn(),
  logCrmForecastSnapshotBackfillResult: vi.fn(),
  runCrmForecastSnapshotBackfillCore: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  listScheduledTenantWork: hoisted.listScheduledTenantWork,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('../../../_auth', () => ({
  authorizeCronRequest: hoisted.authorizeCronRequest,
}));

vi.mock('./_core', async importOriginal => {
  const actual = await importOriginal<typeof import('./_core')>();
  return {
    ...actual,
    assertNoCrmForecastSnapshotBackfillPiiKeys: hoisted.assertNoCrmForecastSnapshotBackfillPiiKeys,
    getCrmForecastSnapshotBackfillStatus: hoisted.getCrmForecastSnapshotBackfillStatus,
    logCrmForecastSnapshotBackfillResult: hoisted.logCrmForecastSnapshotBackfillResult,
    runCrmForecastSnapshotBackfillCore: hoisted.runCrmForecastSnapshotBackfillCore,
  };
});

import { POST } from './route';
import { CrmForecastSnapshotBackfillCoreError } from './_core';
import { createCrmForecastSnapshotBackfillResult } from '../_core.test-helpers';

const result = createCrmForecastSnapshotBackfillResult();

// Stands in for the capability the route's cron admission returns; the producer is mocked.
const INGRESS = Object.freeze({}) as IngressCapability<'cron'>;
const TENANT_1_AUTHORITY = mintTestTenantAuthority('tenant-1');
const TENANT_2_AUTHORITY = mintTestTenantAuthority('tenant-2');

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/crm/forecast-snapshots/backfill', {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      authorization: 'Bearer secret',
      'content-type': 'application/json',
    },
    method: 'POST',
  });
}

describe('POST /api/cron/crm/forecast-snapshots/backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.authorizeCronRequest.mockReturnValue(INGRESS);
    hoisted.listScheduledTenantWork.mockResolvedValue([
      { authority: TENANT_1_AUTHORITY, tenantId: 'tenant-1' },
      { authority: TENANT_2_AUTHORITY, tenantId: 'tenant-2' },
    ]);
    hoisted.getCrmForecastSnapshotBackfillStatus.mockReturnValue(200);
    hoisted.runCrmForecastSnapshotBackfillCore.mockResolvedValue(result);
  });

  it('returns a stable rate_limited error for 429 rate-limit responses', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(
      new Response('limited', { headers: { 'Retry-After': '7' }, status: 429 })
    );

    const res = await POST(
      request({ fromDate: '2026-05-14', tenantId: 'tenant-1', toDate: '2026-05-14' })
    );

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
    expect(await res.json()).toEqual({
      code: 'rate_limited',
      error: 'Too Many Requests',
      success: false,
    });
    expect(hoisted.authorizeCronRequest).not.toHaveBeenCalled();
    expect(hoisted.runCrmForecastSnapshotBackfillCore).not.toHaveBeenCalled();
  });

  it('returns 401 and performs no backfill work when unauthorized', async () => {
    hoisted.authorizeCronRequest.mockReturnValue(null);

    const res = await POST(
      request({ fromDate: '2026-05-14', tenantId: 'tenant-1', toDate: '2026-05-14' })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      code: 'unauthorized',
      error: 'Unauthorized',
      success: false,
    });
    expect(hoisted.listScheduledTenantWork).not.toHaveBeenCalled();
    expect(hoisted.runCrmForecastSnapshotBackfillCore).not.toHaveBeenCalled();
  });

  it('returns invalid_json before invoking the core', async () => {
    const res = await POST(request('{'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: 'invalid_json',
      error: 'Invalid JSON',
      success: false,
    });
    expect(hoisted.runCrmForecastSnapshotBackfillCore).not.toHaveBeenCalled();
  });

  it('rejects unknown fields and branchless tenant IDs with machine-readable validation codes', async () => {
    const unknown = await POST(
      request({
        fromDate: '2026-05-14',
        tenantId: 'tenant-1',
        toDate: '2026-05-14',
        typo: true,
      })
    );
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({
      code: 'invalid_range',
      error: 'Invalid request',
      success: false,
    });

    const invalidTenant = await POST(
      request({ fromDate: '2026-05-14', tenantId: '   ', toDate: '2026-05-14' })
    );
    expect(invalidTenant.status).toBe(400);
    expect(await invalidTenant.json()).toEqual({
      code: 'invalid_tenant',
      error: 'Invalid request',
      success: false,
    });
    expect(hoisted.runCrmForecastSnapshotBackfillCore).not.toHaveBeenCalled();
  });

  it('returns the aggregate result when authorized and valid', async () => {
    const res = await POST(
      request({
        dryRun: true,
        fromDate: '2026-05-14',
        maxWorkItemsPerDate: 10,
        tenantId: 'tenant-1',
        toDate: '2026-05-14',
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result, success: true });
    expect(hoisted.listScheduledTenantWork).toHaveBeenCalledWith(INGRESS);
    expect(hoisted.runCrmForecastSnapshotBackfillCore).toHaveBeenCalledWith({
      authority: expect.anything(),
      dryRun: true,
      fromDate: '2026-05-14',
      maxWorkItemsPerDate: 10,
      now: expect.any(Date),
      toDate: '2026-05-14',
    });
    expect(hoisted.runCrmForecastSnapshotBackfillCore.mock.calls[0][0].authority).toBe(
      TENANT_1_AUTHORITY
    );
    expect(hoisted.assertNoCrmForecastSnapshotBackfillPiiKeys).toHaveBeenCalledWith(result);
    expect(hoisted.logCrmForecastSnapshotBackfillResult).toHaveBeenCalledWith(result, 200);
  });

  it('rejects a tenant the cron admission did not enumerate instead of minting authority for it', async () => {
    const res = await POST(
      request({ fromDate: '2026-05-14', tenantId: 'tenant-unlisted', toDate: '2026-05-14' })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: 'invalid_tenant',
      error: 'Invalid tenant',
      success: false,
    });
    expect(hoisted.runCrmForecastSnapshotBackfillCore).not.toHaveBeenCalled();
  });

  it('hands the core the authority of the named tenant only', async () => {
    await POST(request({ fromDate: '2026-05-14', tenantId: 'tenant-2', toDate: '2026-05-14' }));

    expect(hoisted.runCrmForecastSnapshotBackfillCore).toHaveBeenCalledTimes(1);
    expect(hoisted.runCrmForecastSnapshotBackfillCore.mock.calls[0][0].authority).toBe(
      TENANT_2_AUTHORITY
    );
  });

  it('returns 500 with the structured result when every selected date fails', async () => {
    hoisted.getCrmForecastSnapshotBackfillStatus.mockReturnValue(500);

    const res = await POST(
      request({ fromDate: '2026-05-14', tenantId: 'tenant-1', toDate: '2026-05-14' })
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ result, success: false });
    expect(hoisted.logCrmForecastSnapshotBackfillResult).toHaveBeenCalledWith(result, 500);
  });

  it('maps core range errors to stable 400 codes', async () => {
    hoisted.runCrmForecastSnapshotBackfillCore.mockRejectedValueOnce(
      new CrmForecastSnapshotBackfillCoreError(
        'range_too_large',
        'CRM forecast snapshot backfill range is too large'
      )
    );
    const tooLarge = await POST(
      request({ fromDate: '2026-05-08', tenantId: 'tenant-1', toDate: '2026-05-14' })
    );
    expect(tooLarge.status).toBe(400);
    expect(await tooLarge.json()).toEqual({
      code: 'range_too_large',
      error: 'Date range is too large',
      success: false,
    });

    hoisted.runCrmForecastSnapshotBackfillCore.mockRejectedValueOnce(
      new CrmForecastSnapshotBackfillCoreError(
        'date_out_of_bounds',
        'CRM forecast snapshot backfill date must be before today'
      )
    );
    const outOfBounds = await POST(
      request({ fromDate: '2026-05-15', tenantId: 'tenant-1', toDate: '2026-05-15' })
    );
    expect(outOfBounds.status).toBe(400);
    expect(await outOfBounds.json()).toEqual({
      code: 'date_out_of_bounds',
      error: 'Date is out of bounds',
      success: false,
    });
  });

  it('logs and returns a fixed internal error for unexpected failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    hoisted.runCrmForecastSnapshotBackfillCore.mockRejectedValue(new Error('db unavailable'));

    const res = await POST(
      request({ fromDate: '2026-05-14', tenantId: 'tenant-1', toDate: '2026-05-14' })
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      code: 'internal_error',
      error: 'Internal Server Error',
      success: false,
    });
    expect(errorSpy).toHaveBeenCalledWith('[CRM Forecast Snapshot Backfill] route failed', {
      error: 'db unavailable',
    });

    errorSpy.mockRestore();
  });
});
