import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  getCrmForecastSnapshotSchedulerStatus: vi.fn(),
  logCrmForecastSnapshotSchedulerResult: vi.fn(),
  runCrmForecastSnapshotSchedulerCore: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('../../_auth', () => ({
  authorizeCronRequest: hoisted.authorizeCronRequest,
}));

vi.mock('./_core', async importOriginal => {
  const actual = await importOriginal<typeof import('./_core')>();
  return {
    ...actual,
    getCrmForecastSnapshotSchedulerStatus: hoisted.getCrmForecastSnapshotSchedulerStatus,
    logCrmForecastSnapshotSchedulerResult: hoisted.logCrmForecastSnapshotSchedulerResult,
    runCrmForecastSnapshotSchedulerCore: hoisted.runCrmForecastSnapshotSchedulerCore,
  };
});

import { GET } from './route';

const result = {
  completedAt: '2026-05-14T05:15:01.000Z',
  failedWorkItems: 0,
  snapshotDate: '2026-05-13',
  snapshotsInserted: 1,
  sourceRunId: 'run-1',
  startedAt: '2026-05-14T05:15:00.000Z',
  versionConflicts: 0,
  workItemsConsidered: 1,
  workItemsDeferred: 0,
  workItemsSucceeded: 1,
};

describe('GET /api/cron/crm/forecast-snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.authorizeCronRequest.mockReturnValue(true);
    hoisted.getCrmForecastSnapshotSchedulerStatus.mockReturnValue(200);
    hoisted.runCrmForecastSnapshotSchedulerCore.mockResolvedValue(result);
  });

  it('returns early when rate limited', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));

    const req = new NextRequest('http://localhost:3000/api/cron/crm/forecast-snapshots');
    const res = await GET(req);

    expect(res.status).toBe(429);
    expect(await res.text()).toBe('limited');
  });

  it('returns 401 and performs no scheduler work when unauthorized', async () => {
    hoisted.authorizeCronRequest.mockReturnValue(false);

    const req = new NextRequest('http://localhost:3000/api/cron/crm/forecast-snapshots');
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(hoisted.runCrmForecastSnapshotSchedulerCore).not.toHaveBeenCalled();
  });

  it('returns the stable aggregate result when authorized', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/cron/crm/forecast-snapshots?date=2026-05-13',
      { headers: { authorization: 'Bearer secret' } }
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result, success: true });
    expect(hoisted.runCrmForecastSnapshotSchedulerCore).toHaveBeenCalledWith({
      now: expect.any(Date),
      requestedDate: '2026-05-13',
    });
    expect(hoisted.logCrmForecastSnapshotSchedulerResult).toHaveBeenCalledWith(result, 200);
  });

  it('returns 500 when every selected work item fails', async () => {
    hoisted.getCrmForecastSnapshotSchedulerStatus.mockReturnValue(500);

    const req = new NextRequest('http://localhost:3000/api/cron/crm/forecast-snapshots');
    const res = await GET(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ result, success: false });
    expect(hoisted.logCrmForecastSnapshotSchedulerResult).toHaveBeenCalledWith(result, 500);
  });

  it('returns fixed English machine-readable errors when the core cannot initialize', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    hoisted.runCrmForecastSnapshotSchedulerCore.mockRejectedValue(new Error('bad date'));

    const req = new NextRequest('http://localhost:3000/api/cron/crm/forecast-snapshots');
    const res = await GET(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(errorSpy).toHaveBeenCalledWith('[CRM Forecast Snapshot Scheduler] route failed', {
      error: 'bad date',
    });

    errorSpy.mockRestore();
  });
});
