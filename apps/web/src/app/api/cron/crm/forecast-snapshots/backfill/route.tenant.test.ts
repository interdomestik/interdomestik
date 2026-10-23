import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  assertNoCrmForecastSnapshotBackfillPiiKeys: vi.fn(),
  authorizeCronRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  getCrmForecastSnapshotBackfillStatus: vi.fn(),
  logCrmForecastSnapshotBackfillResult: vi.fn(),
  runCrmForecastSnapshotBackfillCore: vi.fn(),
  createTenantReaders: vi.fn(),
  withTenantContext: vi.fn(),
  createSnapshotRepository: vi.fn(),
  insertSnapshots: vi.fn(),
}));

vi.mock('@/app/[locale]/admin/crm/_reporting-tenant', () => ({
  createAdminCrmReportingTenantRepositories: hoisted.createTenantReaders,
}));
vi.mock('@interdomestik/database/tenant', () => ({
  withTenantContext: hoisted.withTenantContext,
}));
vi.mock('@/adapters/crm/reporting-repository', () => ({
  createCrmForecastSnapshotRepository: hoisted.createSnapshotRepository,
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
import { createCrmForecastSnapshotBackfillResult } from '../_core.test-helpers';

const result = createCrmForecastSnapshotBackfillResult();

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

describe('POST backfill tenant dependency binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.createTenantReaders.mockImplementation((tenantId: string) => ({
      forecastSnapshotWorkItemRepository: { tenantId, listWorkItems: vi.fn() },
      reportingRepository: { tenantId, listWeightedPipelineRows: vi.fn() },
      forecastSnapshotRepository: { listLatestPipelineSnapshots: vi.fn().mockResolvedValue([]) },
    }));
    hoisted.withTenantContext.mockImplementation(
      (context: { tenantId: string }, action: (tx: object) => Promise<unknown>) =>
        action({ kind: 'test-transaction', tenantId: context.tenantId })
    );
    hoisted.createSnapshotRepository.mockReturnValue({
      insertPipelineSnapshots: hoisted.insertSnapshots,
    });
    hoisted.insertSnapshots.mockResolvedValue({ inserted: 1 });
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.authorizeCronRequest.mockReturnValue(true);
    hoisted.getCrmForecastSnapshotBackfillStatus.mockReturnValue(200);
    hoisted.runCrmForecastSnapshotBackfillCore.mockResolvedValue(result);
  });

  it('keeps each validated request bound to its own readers and write transaction', async () => {
    for (const tenantId of ['tenant-1', 'tenant-2']) {
      const response = await POST(
        request({ fromDate: '2026-05-14', tenantId, toDate: '2026-05-14' })
      );
      expect(response.status).toBe(200);
      const args = hoisted.runCrmForecastSnapshotBackfillCore.mock.calls.at(-1)![0];
      const readers = hoisted.createTenantReaders.mock.results.at(-1)!.value;
      expect(hoisted.createTenantReaders).toHaveBeenLastCalledWith(tenantId);
      expect(args.workItemRepository).toBe(readers.forecastSnapshotWorkItemRepository);
      expect(args.reportingRepository).toBe(readers.reportingRepository);
      const read = { tenantId, snapshotDate: '2026-05-14' };
      await args.snapshotRepository.listLatestPipelineSnapshots(read);
      expect(readers.forecastSnapshotRepository.listLatestPipelineSnapshots).toHaveBeenCalledWith(
        read
      );
      const write = { snapshots: [] };
      await args.snapshotRepository.insertPipelineSnapshots(write);
      expect(hoisted.withTenantContext).toHaveBeenLastCalledWith(
        { tenantId },
        expect.any(Function)
      );
      expect(hoisted.createSnapshotRepository).toHaveBeenLastCalledWith({
        kind: 'test-transaction',
        tenantId,
      });
      expect(hoisted.insertSnapshots).toHaveBeenLastCalledWith(write);
    }
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(2);
  });

  it('propagates a failed write through its transaction and preserves the next independent write', async () => {
    await POST(request({ fromDate: '2026-05-14', tenantId: 'tenant-1', toDate: '2026-05-14' }));
    const args = hoisted.runCrmForecastSnapshotBackfillCore.mock.calls.at(-1)![0];
    const failure = new Error('owned snapshot SQL failure');
    hoisted.insertSnapshots.mockRejectedValueOnce(failure);
    await expect(args.snapshotRepository.insertPipelineSnapshots({ snapshots: [] })).rejects.toBe(
      failure
    );
    await expect(
      args.snapshotRepository.insertPipelineSnapshots({ snapshots: [] })
    ).resolves.toEqual({ inserted: 1 });
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(2);
  });
});
