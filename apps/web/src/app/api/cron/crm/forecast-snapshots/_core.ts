import {
  CRM_REPORTING_MAX_WINDOW_DAYS,
  deriveCrmForecastSnapshot,
  deriveCrmWeightedPipeline,
  type CrmReportingBaseInput,
  type CrmWeightedPipelineRow,
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
} from '@/lib/domain-crm/forecast-snapshot-work-items';
import {
  crmForecastSnapshotRepository,
  crmReportingRepository,
} from '@/lib/domain-crm/reporting-repository';

export const CRM_FORECAST_SNAPSHOT_IDEMPOTENCY_PREFIX = 'crm-forecast-snapshot';
export const CRM_FORECAST_SNAPSHOT_NO_BRANCH_SENTINEL = '_no_branch';
export const CRM_FORECAST_SNAPSHOT_TARGET_DURATION_MS = 60_000;
export const CRM_FORECAST_SNAPSHOT_WORK_ITEM_SOFT_TIMEOUT_MS = 5_000;

const SYSTEM_ACTOR_ID = 'system:crm-forecast-snapshot-scheduler';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PII_RESPONSE_KEYS = new Set('description|email|fullName|notes|phone|subject'.split('|'));

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

type TenantWeightedRows = Map<string, Promise<readonly CrmWeightedPipelineRow[]>>;

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

  const tenantRows = new Map<string, Promise<readonly CrmWeightedPipelineRow[]>>();
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
      if (isSoftTimeoutError(error)) {
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
  const message = isSoftTimeoutError(error)
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
  const keys = new Set<string>();
  collectKeys(value, keys);
  for (const key of keys) {
    if (PII_RESPONSE_KEYS.has(key)) {
      throw new Error(`CRM forecast snapshot scheduler output contains PII key: ${key}`);
    }
  }
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
  tenantRows: TenantWeightedRows;
  workItem: CrmForecastSnapshotWorkItem;
}): Promise<number | 'version_conflict'> {
  throwIfAborted(args.signal);
  const rows = await getTenantRows(args);
  throwIfAborted(args.signal);
  const filtered = rows.filter(row => isWorkItemRow(row, args.workItem));
  const input = reportingInputFor(
    args.workItem.tenantId,
    args.snapshotDateStartInclusive,
    args.snapshotDateEndExclusive
  );
  const weighted = deriveCrmWeightedPipeline(filtered, {
    ...input,
    groupBy: ['branch', 'pipeline'],
  });
  const idempotencyKey = buildSnapshotIdempotencyKey(args.workItem, {
    snapshotDate: args.snapshotDate,
    sourceRunId: args.sourceRunId,
  });
  const snapshots = deriveCrmForecastSnapshot(weighted.groups, {
    createdAt: new Date().toISOString(),
    idempotencyKey,
    snapshotDate: args.snapshotDate,
    sourceRunId: args.sourceRunId,
  });

  if (snapshots.length === 0) return 0;
  throwIfAborted(args.signal);
  const inserted = await args.snapshotRepository.insertPipelineSnapshots({ snapshots });
  throwIfAborted(args.signal);
  if (!inserted.success) return inserted.reason;
  return inserted.snapshots.length;
}

function getTenantRows(args: {
  reportingRepository: CrmReportingRepository;
  snapshotDateStartInclusive: Date;
  snapshotDateEndExclusive: Date;
  tenantRows: TenantWeightedRows;
  workItem: CrmForecastSnapshotWorkItem;
}) {
  const cached = args.tenantRows.get(args.workItem.tenantId);
  if (cached) return cached;
  const loaded = args.reportingRepository.listWeightedPipelineRows(
    reportingInputFor(
      args.workItem.tenantId,
      args.snapshotDateStartInclusive,
      args.snapshotDateEndExclusive
    )
  );
  args.tenantRows.set(args.workItem.tenantId, loaded);
  return loaded;
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

function isWorkItemRow(
  row: CrmWeightedPipelineRow,
  workItem: CrmForecastSnapshotWorkItem
): boolean {
  return (
    row.tenantId === workItem.tenantId &&
    row.pipelineId === workItem.pipelineId &&
    (row.branchId ?? null) === (workItem.branchId ?? null) &&
    row.currencyCode === workItem.currencyCode
  );
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

class SoftTimeoutError extends Error {
  constructor() {
    super('CRM forecast snapshot timed out');
    this.name = 'SoftTimeoutError';
  }
}

function isSoftTimeoutError(error: unknown): error is SoftTimeoutError {
  return error instanceof SoftTimeoutError;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new SoftTimeoutError();
  }
}

function withTimeout<T>(
  startWork: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(new SoftTimeoutError());
    }, timeoutMs);
    const work = startWork(controller.signal);
    work
      .then(
        value => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        },
        error => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      )
      .catch(() => undefined);
  });
}

function collectKeys(value: unknown, keys: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(item => collectKeys(item, keys));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectKeys(nested, keys);
  }
}
