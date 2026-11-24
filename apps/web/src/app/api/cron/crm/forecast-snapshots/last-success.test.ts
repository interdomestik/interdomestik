import { getForecastSnapshotLastSuccess } from '@/lib/cron/forecast-snapshot-last-success';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createDeps, ingress, now, scheduleTenants, workItem } from './_core.test-support';
import type { runCrmForecastSnapshotSchedulerCore } from './_core';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  run: vi.fn<typeof runCrmForecastSnapshotSchedulerCore>(),
}));

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => null }));
vi.mock('../../_auth', () => ({ authorizeCronRequest: () => ingress }));
vi.mock('./_core', async importOriginal => ({
  ...(await importOriginal<typeof import('./_core')>()),
  runCrmForecastSnapshotSchedulerCore: mocks.run,
}));

const request = () => new NextRequest('http://localhost/api/cron/crm/forecast-snapshots');
const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
const completedAt = '2026-05-14T05:15:01.000Z';

beforeEach(() => {
  vi.clearAllMocks();
  scheduleTenants('tenant-1');
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

async function runWith(deps: ReturnType<typeof createDeps>) {
  const { runCrmForecastSnapshotSchedulerCore } =
    await vi.importActual<typeof import('./_core')>('./_core');
  return runCrmForecastSnapshotSchedulerCore({
    ...deps,
    ingress,
    logger,
    now,
    nowMs: () => Date.parse(completedAt),
  });
}

it('reports the completion time of a fully successful forecast run', async () => {
  mocks.run.mockImplementation(() => runWith(createDeps()));
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(getForecastSnapshotLastSuccess(await response.json())).toBe(completedAt);
});

it('does not advance last success when one item fails and the route returns HTTP 200', async () => {
  const deps = createDeps({ workItems: [workItem, { ...workItem, branchId: 'branch-2' }] });
  deps.snapshotRepository.insertPipelineSnapshots.mockRejectedValueOnce(
    new Error('synthetic work-item failure')
  );
  mocks.run.mockImplementation(() => runWith(deps));

  const response = await GET(request());
  const body: unknown = await response.json();
  expect(response.status).toBe(200);
  expect(body).toMatchObject({
    success: true,
    result: { completedAt, failedWorkItems: 1, workItemsConsidered: 2, workItemsSucceeded: 1 },
  });
  expect(logger.warn).toHaveBeenCalledWith(
    '[CRM Forecast Snapshot Scheduler] work item failed',
    expect.objectContaining({ errorMessage: 'synthetic work-item failure' })
  );
  expect(getForecastSnapshotLastSuccess(body)).toBeNull();
});

it('does not advance last success when a version conflict is the only warning', async () => {
  mocks.run.mockImplementation(() => runWith(createDeps({ insertResult: 'version_conflict' })));

  const response = await GET(request());
  const body: unknown = await response.json();
  expect(response.status).toBe(200);
  expect(body).toMatchObject({
    result: {
      failedWorkItems: 0,
      versionConflicts: 1,
      workItemsDeferred: 0,
      workItemsSucceeded: 0,
    },
  });
  expect(getForecastSnapshotLastSuccess(body)).toBeNull();
});

it('does not advance last success on a successful response with deferred work', async () => {
  mocks.run.mockImplementation(() => runWith(createDeps({ workItemsDeferred: 1 })));

  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(getForecastSnapshotLastSuccess(await response.json())).toBeNull();
});

it.each([
  { completedAt: undefined },
  { completedAt: '2026-05-14T05:14:59.000Z' },
  { workItemsSucceeded: 0 },
])('does not advance last success with incomplete response evidence %j', async overrides => {
  const result = { ...(await runWith(createDeps())), ...overrides };
  expect(getForecastSnapshotLastSuccess({ success: true, result })).toBeNull();
});
