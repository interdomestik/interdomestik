import {
  CRM_REPORTING_MAX_WINDOW_DAYS,
  type CrmReportingBaseInput,
} from '@interdomestik/domain-crm/reporting';
import type {
  CrmForecastSnapshotRepository,
  CrmReportingRepository,
} from '@interdomestik/domain-crm/reporting/repository';

import {
  CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN,
  crmForecastSnapshotWorkItemRepository,
  type CrmForecastSnapshotWorkItem,
  type CrmForecastSnapshotWorkItemRepository,
} from '@/adapters/crm/forecast-snapshot-work-items';
import {
  crmForecastSnapshotRepository,
  crmReportingRepository,
} from '@/adapters/crm/reporting-repository';

import {
  assertNoCrmForecastSnapshotPiiKeys,
  buildCrmForecastSnapshotsForWorkItem,
  isCrmForecastSnapshotSoftTimeoutError,
  throwIfCrmForecastSnapshotAborted,
  withCrmForecastSnapshotTimeout,
  type CrmForecastSnapshotTenantWeightedRows,
} from './_shared';

export const CRM_FORECAST_SNAPSHOT_IDEMPOTENCY_PREFIX = 'crm-forecast-snapshot';
export const CRM_FORECAST_SNAPSHOT_NO_BRANCH_SENTINEL = '_no_branch';
export const CRM_FORECAST_SNAPSHOT_TARGET_DURATION_MS = 60_000;
export const CRM_FORECAST_SNAPSHOT_WORK_ITEM_SOFT_TIMEOUT_MS = 5_000;

const SYSTEM_ACTOR_ID = 'system:crm-forecast-snapshot-scheduler';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SOFT_TIMEOUT_MESSAGE = 'CRM forecast snapshot timed out';

export type CrmForecastSnapshotSchedulerResult = {
  completedAt: string;
  failedWorkItems: number;
  snapshotDate: string;
  snapshotsInserted: number;
  sourceRunId: string;
  startedAt: string;
  versionConflicts: number;
  workItemsConsidered: number;
  workItemsDeferred: number;
  workItemsSucceeded: number;
};

export type CrmForecastSnapshotSchedulerLogger = Pick<Console, 'error' | 'info' | 'warn'>;

export type RunCrmForecastSnapshotSchedulerCoreArgs = {
  logger?: CrmForecastSnapshotSchedulerLogger;
  maxWorkItemsPerRun?: number;
  now: Date;
  nowMs?: () => number;
  reportingRepository?: CrmReportingRepository;
  requestedDate?: string | null;
  snapshotRepository?: CrmForecastSnapshotRepository;
  sourceRunId?: string;
  targetDurationMs?: number;
  workItemRepository?: CrmForecastSnapshotWorkItemRepository;
  workItemSoftTimeoutMs?: number;
};

export async function runCrmForecastSnapshotSchedulerCore(
  args: RunCrmForecastSnapshotSchedulerCoreArgs
): Promise<CrmForecastSnapshotSchedulerResult> {
  const startedAt = args.now.toISOString();
  const snapshotDate = resolveSnapshotDate(args.requestedDate, args.now);
  const sourceRunId =
    args.sourceRunId ?? `${CRM_FORECAST_SNAPSHOT_IDEMPOTENCY_PREFIX}:${snapshotDate}:${startedAt}`;
  const nowMs = args.nowMs ?? Date.now;
  const startedMs = nowMs();
  const targetDurationMs = args.targetDurationMs ?? CRM_FORECAST_SNAPSHOT_TARGET_DURATION_MS;
  const workItemSoftTimeoutMs =
    args.workItemSoftTimeoutMs ?? CRM_FORECAST_SNAPSHOT_WORK_ITEM_SOFT_TIMEOUT_MS;
  const snapshotDateEndExclusive = endExclusiveForSnapshotDate(snapshotDate);
  const snapshotDateStartInclusive = startInclusiveForSnapshotDate(snapshotDateEndExclusive);
  const workItemRepository = args.workItemRepository ?? crmForecastSnapshotWorkItemRepository;
  const reportingRepository = args.reportingRepository ?? crmReportingRepository;
  const snapshotRepository = args.snapshotRepository ?? crmForecastSnapshotRepository;
  const logger = args.logger ?? console;

  const listed = await workItemRepository.listWorkItems({
    limit: args.maxWorkItemsPerRun ?? CRM_FORECAST_SNAPSHOT_MAX_WORK_ITEMS_PER_RUN,
    snapshotDateEndExclusive,
    snapshotDateStartInclusive,
  });
  const result = createResult({ snapshotDate, sourceRunId, startedAt });
  result.workItemsConsidered = listed.workItems.length;
  result.workItemsDeferred = listed.workItemsDeferred;

  const tenantRows: CrmForecastSnapshotTenantWeightedRows = new Map();
  for (const [index, workItem] of listed.workItems.entries()) {
    if (nowMs() - startedMs >= targetDurationMs) {
      result.workItemsDeferred += listed.workItems.length - index;
      break;
    }

    try {
      const inserted = await withTimeout(
        signal =>
          processWorkItem({
            reportingRepository,
            signal,
            snapshotDate,
            snapshotDateEndExclusive,
            snapshotDateStartInclusive,
            snapshotRepository,
            sourceRunId,
            tenantRows,
            workItem,
          }),
        workItemSoftTimeoutMs
      );
      if (inserted === 'version_conflict') {
        result.versionConflicts += 1;
      } else {
        result.workItemsSucceeded += 1;
        result.snapshotsInserted += inserted;
      }
    } catch (error) {
      result.failedWorkItems += 1;
      logWorkItemFailure(logger, workItem, error);
      if (isCrmForecastSnapshotSoftTimeoutError(error)) {
        result.workItemsDeferred += listed.workItems.length - index - 1;
        break;
      }
    }
  }

  result.completedAt = new Date(nowMs()).toISOString();
  return result;
}

function logWorkItemFailure(
  logger: CrmForecastSnapshotSchedulerLogger,
  workItem: CrmForecastSnapshotWorkItem,
  error: unknown
): void {
  const payload = {
    branchId: workItem.branchId ?? CRM_FORECAST_SNAPSHOT_NO_BRANCH_SENTINEL,
    currencyCode: workItem.currencyCode,
    errorMessage: error instanceof Error ? error.message : String(error),
    pipelineId: workItem.pipelineId,
    tenantId: workItem.tenantId,
  };
  const message = isCrmForecastSnapshotSoftTimeoutError(error)
    ? '[CRM Forecast Snapshot Scheduler] work item timed out'
    : '[CRM Forecast Snapshot Scheduler] work item failed';
  logger.warn(message, payload);
}

export function getCrmForecastSnapshotSchedulerStatus(
  result: CrmForecastSnapshotSchedulerResult
): 200 | 500 {
  if (result.workItemsConsidered > 0 && result.failedWorkItems === result.workItemsConsidered) {
    return 500;
  }
  return 200;
}

export function logCrmForecastSnapshotSchedulerResult(
  result: CrmForecastSnapshotSchedulerResult,
  status: 200 | 500,
  logger: CrmForecastSnapshotSchedulerLogger = console
): void {
  const payload = {
    durationMs: Date.parse(result.completedAt) - Date.parse(result.startedAt),
    failedWorkItems: result.failedWorkItems,
    snapshotDate: result.snapshotDate,
    snapshotsInserted: result.snapshotsInserted,
    sourceRunId: result.sourceRunId,
    versionConflicts: result.versionConflicts,
    workItemsConsidered: result.workItemsConsidered,
    workItemsDeferred: result.workItemsDeferred,
    workItemsSucceeded: result.workItemsSucceeded,
  };

  if (status === 500) {
    logger.error('[CRM Forecast Snapshot Scheduler] run failed', payload);
  } else if (
    result.failedWorkItems > 0 ||
    result.versionConflicts > 0 ||
    result.workItemsDeferred > 0
  ) {
    logger.warn('[CRM Forecast Snapshot Scheduler] run completed with warnings', payload);
  } else {
    logger.info('[CRM Forecast Snapshot Scheduler] run completed', payload);
  }
}

export function assertNoCrmForecastSnapshotSchedulerPiiKeys(value: unknown): void {
  assertNoCrmForecastSnapshotPiiKeys(value, 'CRM forecast snapshot scheduler output');
}

function createResult(params: { snapshotDate: string; sourceRunId: string; startedAt: string }) {
  return {
    completedAt: params.startedAt,
    failedWorkItems: 0,
    snapshotDate: params.snapshotDate,
    snapshotsInserted: 0,
    sourceRunId: params.sourceRunId,
    startedAt: params.startedAt,
    versionConflicts: 0,
    workItemsConsidered: 0,
    workItemsDeferred: 0,
    workItemsSucceeded: 0,
  };
}

function resolveSnapshotDate(requestedDate: string | null | undefined, now: Date): string {
  const previousDate = previousUtcDate(now);
  if (!requestedDate) return previousDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    throw new Error('Invalid CRM forecast snapshot date');
  }
  if (requestedDate !== previousDate) {
    throw new Error('CRM forecast snapshot manual date must be the previous UTC date');
  }
  return requestedDate;
}

function previousUtcDate(now: Date): string {
  const previous = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
  );
  return previous.toISOString().slice(0, 10);
}

function endExclusiveForSnapshotDate(snapshotDate: string): Date {
  const start = new Date(`${snapshotDate}T00:00:00.000Z`);
  return new Date(start.getTime() + MS_PER_DAY);
}

function startInclusiveForSnapshotDate(snapshotDateEndExclusive: Date): Date {
  return new Date(snapshotDateEndExclusive.getTime() - CRM_REPORTING_MAX_WINDOW_DAYS * MS_PER_DAY);
}

async function processWorkItem(args: {
  reportingRepository: CrmReportingRepository;
  signal: AbortSignal;
  snapshotDate: string;
  snapshotDateEndExclusive: Date;
  snapshotDateStartInclusive: Date;
  snapshotRepository: CrmForecastSnapshotRepository;
  sourceRunId: string;
  tenantRows: CrmForecastSnapshotTenantWeightedRows;
  workItem: CrmForecastSnapshotWorkItem;
}): Promise<number | 'version_conflict'> {
  const snapshots = await buildCrmForecastSnapshotsForWorkItem({
    abortMessage: SOFT_TIMEOUT_MESSAGE,
    createdAt: new Date().toISOString(),
    idempotencyKey: buildSnapshotIdempotencyKey(args.workItem, {
      snapshotDate: args.snapshotDate,
      sourceRunId: args.sourceRunId,
    }),
    reportingInputFor,
    reportingRepository: args.reportingRepository,
    signal: args.signal,
    snapshotDate: args.snapshotDate,
    snapshotDateEndExclusive: args.snapshotDateEndExclusive,
    snapshotDateStartInclusive: args.snapshotDateStartInclusive,
    sourceRunId: args.sourceRunId,
    tenantRows: args.tenantRows,
    workItem: args.workItem,
  });

  if (snapshots.length === 0) return 0;
  throwIfCrmForecastSnapshotAborted(args.signal, SOFT_TIMEOUT_MESSAGE);
  const inserted = await args.snapshotRepository.insertPipelineSnapshots({ snapshots });
  throwIfCrmForecastSnapshotAborted(args.signal, SOFT_TIMEOUT_MESSAGE);
  if (!inserted.success) return inserted.reason;
  return inserted.snapshots.length;
}

function reportingInputFor(tenantId: string, from: Date, to: Date): CrmReportingBaseInput {
  return {
    actor: {
      actorId: SYSTEM_ACTOR_ID,
      role: 'admin',
      scope: { permissions: ['crm:forecast-snapshot:scheduler'] },
      tenantId,
    },
    window: { from: from.toISOString(), to: to.toISOString() },
  };
}

export function buildSnapshotIdempotencyKey(
  workItem: CrmForecastSnapshotWorkItem,
  params: { snapshotDate: string; sourceRunId: string }
): string {
  return [
    CRM_FORECAST_SNAPSHOT_IDEMPOTENCY_PREFIX,
    workItem.tenantId,
    workItem.pipelineId,
    workItem.branchId ?? CRM_FORECAST_SNAPSHOT_NO_BRANCH_SENTINEL,
    workItem.currencyCode,
    params.snapshotDate,
    params.sourceRunId,
  ].join(':');
}

function withTimeout<T>(
  startWork: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return withCrmForecastSnapshotTimeout(startWork, timeoutMs, SOFT_TIMEOUT_MESSAGE);
}
