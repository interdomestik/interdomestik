import {
  CRM_REPORTING_MAX_WINDOW_DAYS,
  type CrmReportingBaseInput,
} from '@interdomestik/domain-crm/reporting';
import type {
  CrmForecastSnapshotRepository,
  CrmReportingRepository,
} from '@interdomestik/domain-crm/reporting/repository';

import {
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
} from '../_shared';

export const CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_DAYS = 7;
export const CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_LOOKBACK_DAYS = 366;
export const CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_WORK_ITEMS_PER_DATE = 250;
export const CRM_FORECAST_SNAPSHOT_BACKFILL_RATE_LIMIT = 3;
export const CRM_FORECAST_SNAPSHOT_BACKFILL_RATE_LIMIT_WINDOW_SECONDS = 60;
export const CRM_FORECAST_SNAPSHOT_BACKFILL_SYSTEM_ACTOR_ID =
  'system:crm-forecast-snapshot-backfill';
export const CRM_FORECAST_SNAPSHOT_BACKFILL_TARGET_DURATION_MS = 60_000;
export const CRM_FORECAST_SNAPSHOT_BACKFILL_SOURCE_RUN_PREFIX = 'crm-forecast-snapshot-backfill';
export const CRM_FORECAST_SNAPSHOT_BACKFILL_WORK_ITEM_SOFT_TIMEOUT_MS = 5_000;
export const CRM_FORECAST_SNAPSHOT_BACKFILL_NO_BRANCH_SENTINEL = '_no_branch';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOFT_TIMEOUT_MESSAGE = 'CRM forecast snapshot backfill timed out';

export type CrmForecastSnapshotBackfillDateStatus =
  | 'completed'
  | 'dry_run'
  | 'partial'
  | 'failed'
  | 'deferred';

export interface CrmForecastSnapshotBackfillDateResult {
  failedWorkItems: number;
  snapshotDate: string;
  snapshotsInserted: number;
  status: CrmForecastSnapshotBackfillDateStatus;
  versionConflicts: number;
  workItemsConsidered: number;
  workItemsDeferred: number;
  workItemsSucceeded: number;
}

export interface CrmForecastSnapshotBackfillResult {
  completedAt: string;
  dateResults: CrmForecastSnapshotBackfillDateResult[];
  datesConsidered: number;
  datesDeferred: number;
  datesFailed: number;
  datesSucceeded: number;
  dryRun: boolean;
  failedWorkItems: number;
  fromDate: string;
  snapshotsInserted: number;
  sourceRunId: string;
  startedAt: string;
  tenantId: string;
  toDate: string;
  versionConflicts: number;
  workItemsConsidered: number;
  workItemsDeferred: number;
  workItemsSucceeded: number;
}

export type CrmForecastSnapshotBackfillLogger = Pick<Console, 'error' | 'info' | 'warn'>;

export type CrmForecastSnapshotBackfillCoreErrorCode =
  | 'date_out_of_bounds'
  | 'invalid_range'
  | 'invalid_tenant'
  | 'range_too_large';

export class CrmForecastSnapshotBackfillCoreError extends Error {
  constructor(
    readonly code: CrmForecastSnapshotBackfillCoreErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'CrmForecastSnapshotBackfillCoreError';
  }
}

export type RunCrmForecastSnapshotBackfillCoreArgs = {
  dryRun?: boolean;
  fromDate: string;
  logger?: CrmForecastSnapshotBackfillLogger;
  maxWorkItemsPerDate?: number;
  now: Date;
  nowMs?: () => number;
  reportingRepository?: CrmReportingRepository;
  snapshotRepository?: CrmForecastSnapshotRepository;
  sourceRunId?: string;
  targetDurationMs?: number;
  tenantId: string;
  toDate: string;
  workItemRepository?: CrmForecastSnapshotWorkItemRepository;
  workItemSoftTimeoutMs?: number;
};

export async function runCrmForecastSnapshotBackfillCore(
  args: RunCrmForecastSnapshotBackfillCoreArgs
): Promise<CrmForecastSnapshotBackfillResult> {
  const startedAt = args.now.toISOString();
  const dryRun = args.dryRun === true;
  const dates = validateBackfillDateRange(args.fromDate, args.toDate, args.now);
  const tenantId = args.tenantId.trim();
  if (!tenantId) {
    throw new CrmForecastSnapshotBackfillCoreError(
      'invalid_tenant',
      'CRM forecast snapshot backfill tenantId is required'
    );
  }

  const sourceRunId =
    args.sourceRunId ??
    `${CRM_FORECAST_SNAPSHOT_BACKFILL_SOURCE_RUN_PREFIX}:${tenantId}:${args.fromDate}:${args.toDate}:${startedAt}`;
  const nowMs = args.nowMs ?? Date.now;
  const startedMs = nowMs();
  const targetDurationMs =
    args.targetDurationMs ?? CRM_FORECAST_SNAPSHOT_BACKFILL_TARGET_DURATION_MS;
  const workItemSoftTimeoutMs =
    args.workItemSoftTimeoutMs ?? CRM_FORECAST_SNAPSHOT_BACKFILL_WORK_ITEM_SOFT_TIMEOUT_MS;
  const workItemLimit =
    args.maxWorkItemsPerDate ?? CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_WORK_ITEMS_PER_DATE;
  const workItemRepository = args.workItemRepository ?? crmForecastSnapshotWorkItemRepository;
  const reportingRepository = args.reportingRepository ?? crmReportingRepository;
  const snapshotRepository = args.snapshotRepository ?? crmForecastSnapshotRepository;
  const logger = args.logger ?? console;
  const result = createResult({
    dryRun,
    fromDate: args.fromDate,
    sourceRunId,
    startedAt,
    tenantId,
    toDate: args.toDate,
  });

  for (const snapshotDate of dates) {
    if (nowMs() - startedMs >= targetDurationMs) {
      appendDeferredDates(result, dates.slice(result.dateResults.length));
      break;
    }

    const dateResult = await processDate({
      dryRun,
      logger,
      nowMs,
      reportingRepository,
      snapshotDate,
      snapshotRepository,
      sourceRunId,
      startedMs,
      tenantId,
      targetDurationMs,
      workItemLimit,
      workItemRepository,
      workItemSoftTimeoutMs,
    });
    result.dateResults.push(dateResult);
  }

  result.completedAt = new Date(nowMs()).toISOString();
  rollUpDateResults(result);
  return result;
}

export function validateBackfillDateRange(fromDate: string, toDate: string, now: Date): string[] {
  const from = parseSnapshotDate(fromDate);
  const to = parseSnapshotDate(toDate);
  if (from.getTime() > to.getTime()) {
    throw new CrmForecastSnapshotBackfillCoreError(
      'invalid_range',
      'CRM forecast snapshot backfill date range is invalid'
    );
  }

  const previous = previousUtcDateAsDate(now);
  if (to.getTime() > previous.getTime()) {
    throw new CrmForecastSnapshotBackfillCoreError(
      'date_out_of_bounds',
      'CRM forecast snapshot backfill date must be before today'
    );
  }

  const earliest = new Date(
    previous.getTime() - CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_LOOKBACK_DAYS * MS_PER_DAY
  );
  if (from.getTime() < earliest.getTime()) {
    throw new CrmForecastSnapshotBackfillCoreError(
      'date_out_of_bounds',
      'CRM forecast snapshot backfill date is out of bounds'
    );
  }

  const count = Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
  if (count > CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_DAYS) {
    throw new CrmForecastSnapshotBackfillCoreError(
      'range_too_large',
      'CRM forecast snapshot backfill range is too large'
    );
  }

  return Array.from({ length: count }, (_, index) =>
    new Date(from.getTime() + index * MS_PER_DAY).toISOString().slice(0, 10)
  );
}

async function processDate(args: {
  dryRun: boolean;
  logger: CrmForecastSnapshotBackfillLogger;
  nowMs: () => number;
  reportingRepository: CrmReportingRepository;
  snapshotDate: string;
  snapshotRepository: CrmForecastSnapshotRepository;
  sourceRunId: string;
  startedMs: number;
  tenantId: string;
  targetDurationMs: number;
  workItemLimit: number;
  workItemRepository: CrmForecastSnapshotWorkItemRepository;
  workItemSoftTimeoutMs: number;
}): Promise<CrmForecastSnapshotBackfillDateResult> {
  const snapshotDateEndExclusive = endExclusiveForSnapshotDate(args.snapshotDate);
  const snapshotDateStartInclusive = startInclusiveForSnapshotDate(snapshotDateEndExclusive);
  const listed = await args.workItemRepository.listWorkItems({
    limit: args.workItemLimit,
    snapshotDateEndExclusive,
    snapshotDateStartInclusive,
    tenantId: args.tenantId,
  });
  const result = createDateResult(args.snapshotDate, args.dryRun ? 'dry_run' : 'completed');
  result.workItemsConsidered = listed.workItems.length;
  result.workItemsDeferred = listed.workItemsDeferred;

  const tenantRows: CrmForecastSnapshotTenantWeightedRows = new Map();
  for (const [index, workItem] of listed.workItems.entries()) {
    if (args.nowMs() - args.startedMs >= args.targetDurationMs) {
      result.workItemsDeferred += listed.workItems.length - index;
      break;
    }

    try {
      const inserted = await withTimeout(
        signal =>
          processWorkItem({
            dryRun: args.dryRun,
            nowMs: args.nowMs,
            reportingRepository: args.reportingRepository,
            signal,
            snapshotDate: args.snapshotDate,
            snapshotDateEndExclusive,
            snapshotDateStartInclusive,
            snapshotRepository: args.snapshotRepository,
            sourceRunId: args.sourceRunId,
            tenantRows,
            workItem,
          }),
        args.workItemSoftTimeoutMs
      );
      if (inserted === 'version_conflict') {
        result.versionConflicts += 1;
      } else {
        result.workItemsSucceeded += 1;
        if (!args.dryRun) result.snapshotsInserted += inserted;
      }
    } catch (error) {
      result.failedWorkItems += 1;
      logWorkItemFailure(args.logger, args.snapshotDate, workItem, error);
      if (isCrmForecastSnapshotSoftTimeoutError(error)) {
        result.workItemsDeferred += listed.workItems.length - index - 1;
        break;
      }
    }
  }

  result.status = dateStatus(result, args.dryRun);
  return result;
}

async function processWorkItem(args: {
  dryRun: boolean;
  nowMs: () => number;
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
    createdAt: new Date(args.nowMs()).toISOString(),
    idempotencyKey: buildBackfillSnapshotIdempotencyKey(args.workItem, {
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

  if (snapshots.length === 0 || args.dryRun) return snapshots.length;
  throwIfCrmForecastSnapshotAborted(args.signal, SOFT_TIMEOUT_MESSAGE);
  const inserted = await args.snapshotRepository.insertPipelineSnapshots({ snapshots });
  throwIfCrmForecastSnapshotAborted(args.signal, SOFT_TIMEOUT_MESSAGE);
  if (!inserted.success) return inserted.reason;
  return inserted.snapshots.length;
}

function reportingInputFor(tenantId: string, from: Date, to: Date): CrmReportingBaseInput {
  return {
    actor: {
      actorId: CRM_FORECAST_SNAPSHOT_BACKFILL_SYSTEM_ACTOR_ID,
      role: 'admin',
      scope: { permissions: ['crm:forecast-snapshot:backfill'] },
      tenantId,
    },
    window: { from: from.toISOString(), to: to.toISOString() },
  };
}

function dateStatus(
  result: CrmForecastSnapshotBackfillDateResult,
  dryRun: boolean
): CrmForecastSnapshotBackfillDateStatus {
  if (result.workItemsConsidered > 0 && result.failedWorkItems === result.workItemsConsidered) {
    return 'failed';
  }
  if (result.failedWorkItems > 0 || result.workItemsDeferred > 0) return 'partial';
  if (dryRun) return 'dry_run';
  return 'completed';
}

function rollUpDateResults(result: CrmForecastSnapshotBackfillResult): void {
  result.datesConsidered = result.dateResults.length;
  result.datesDeferred = result.dateResults.filter(row => row.status === 'deferred').length;
  result.datesFailed = result.dateResults.filter(row => row.status === 'failed').length;
  result.datesSucceeded = result.dateResults.filter(
    row => row.status === 'completed' || row.status === 'dry_run' || row.status === 'partial'
  ).length;
  result.failedWorkItems = result.dateResults.reduce((sum, row) => sum + row.failedWorkItems, 0);
  result.snapshotsInserted = result.dateResults.reduce(
    (sum, row) => sum + row.snapshotsInserted,
    0
  );
  result.versionConflicts = result.dateResults.reduce((sum, row) => sum + row.versionConflicts, 0);
  result.workItemsConsidered = result.dateResults.reduce(
    (sum, row) => sum + row.workItemsConsidered,
    0
  );
  result.workItemsDeferred = result.dateResults.reduce(
    (sum, row) => sum + row.workItemsDeferred,
    0
  );
  result.workItemsSucceeded = result.dateResults.reduce(
    (sum, row) => sum + row.workItemsSucceeded,
    0
  );
}

function appendDeferredDates(result: CrmForecastSnapshotBackfillResult, dates: string[]): void {
  for (const snapshotDate of dates) {
    result.dateResults.push(createDateResult(snapshotDate, 'deferred'));
  }
}

function createResult(params: {
  dryRun: boolean;
  fromDate: string;
  sourceRunId: string;
  startedAt: string;
  tenantId: string;
  toDate: string;
}): CrmForecastSnapshotBackfillResult {
  return {
    completedAt: params.startedAt,
    dateResults: [],
    datesConsidered: 0,
    datesDeferred: 0,
    datesFailed: 0,
    datesSucceeded: 0,
    dryRun: params.dryRun,
    failedWorkItems: 0,
    fromDate: params.fromDate,
    snapshotsInserted: 0,
    sourceRunId: params.sourceRunId,
    startedAt: params.startedAt,
    tenantId: params.tenantId,
    toDate: params.toDate,
    versionConflicts: 0,
    workItemsConsidered: 0,
    workItemsDeferred: 0,
    workItemsSucceeded: 0,
  };
}

function createDateResult(
  snapshotDate: string,
  status: CrmForecastSnapshotBackfillDateStatus
): CrmForecastSnapshotBackfillDateResult {
  return {
    failedWorkItems: 0,
    snapshotDate,
    snapshotsInserted: 0,
    status,
    versionConflicts: 0,
    workItemsConsidered: 0,
    workItemsDeferred: 0,
    workItemsSucceeded: 0,
  };
}

function logWorkItemFailure(
  logger: CrmForecastSnapshotBackfillLogger,
  snapshotDate: string,
  workItem: CrmForecastSnapshotWorkItem,
  error: unknown
): void {
  const payload = {
    branchId: workItem.branchId ?? CRM_FORECAST_SNAPSHOT_BACKFILL_NO_BRANCH_SENTINEL,
    currencyCode: workItem.currencyCode,
    errorMessage: error instanceof Error ? error.message : String(error),
    pipelineId: workItem.pipelineId,
    snapshotDate,
    tenantId: workItem.tenantId,
  };
  const message = isCrmForecastSnapshotSoftTimeoutError(error)
    ? '[CRM Forecast Snapshot Backfill] work item timed out'
    : '[CRM Forecast Snapshot Backfill] work item failed';
  logger.warn(message, payload);
}

export function getCrmForecastSnapshotBackfillStatus(
  result: CrmForecastSnapshotBackfillResult
): 200 | 500 {
  if (result.datesConsidered > 0 && result.datesFailed === result.datesConsidered) return 500;
  return 200;
}

export function logCrmForecastSnapshotBackfillResult(
  result: CrmForecastSnapshotBackfillResult,
  status: 200 | 500,
  logger: CrmForecastSnapshotBackfillLogger = console
): void {
  const payload = {
    datesConsidered: result.datesConsidered,
    datesDeferred: result.datesDeferred,
    datesFailed: result.datesFailed,
    durationMs: Date.parse(result.completedAt) - Date.parse(result.startedAt),
    dryRun: result.dryRun,
    failedWorkItems: result.failedWorkItems,
    fromDate: result.fromDate,
    snapshotsInserted: result.snapshotsInserted,
    sourceRunId: result.sourceRunId,
    tenantId: result.tenantId,
    toDate: result.toDate,
    versionConflicts: result.versionConflicts,
    workItemsConsidered: result.workItemsConsidered,
    workItemsDeferred: result.workItemsDeferred,
    workItemsSucceeded: result.workItemsSucceeded,
  };

  if (status === 500) {
    logger.error('[CRM Forecast Snapshot Backfill] run failed', payload);
  } else if (
    result.failedWorkItems > 0 ||
    result.versionConflicts > 0 ||
    result.workItemsDeferred > 0 ||
    result.datesDeferred > 0
  ) {
    logger.warn('[CRM Forecast Snapshot Backfill] run completed with warnings', payload);
  } else {
    logger.info('[CRM Forecast Snapshot Backfill] run completed', payload);
  }
}

export function assertNoCrmForecastSnapshotBackfillPiiKeys(value: unknown): void {
  assertNoCrmForecastSnapshotPiiKeys(value, 'CRM forecast snapshot backfill output');
}

export function buildBackfillSnapshotIdempotencyKey(
  workItem: CrmForecastSnapshotWorkItem,
  params: { snapshotDate: string; sourceRunId: string }
): string {
  return [
    CRM_FORECAST_SNAPSHOT_BACKFILL_SOURCE_RUN_PREFIX,
    workItem.tenantId,
    workItem.pipelineId,
    workItem.branchId ?? CRM_FORECAST_SNAPSHOT_BACKFILL_NO_BRANCH_SENTINEL,
    workItem.currencyCode,
    params.snapshotDate,
    params.sourceRunId,
  ].join(':');
}

function parseSnapshotDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new CrmForecastSnapshotBackfillCoreError(
      'invalid_range',
      'Invalid CRM forecast snapshot backfill date'
    );
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new CrmForecastSnapshotBackfillCoreError(
      'invalid_range',
      'Invalid CRM forecast snapshot backfill date'
    );
  }
  return date;
}

function previousUtcDateAsDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

function endExclusiveForSnapshotDate(snapshotDate: string): Date {
  const start = new Date(`${snapshotDate}T00:00:00.000Z`);
  return new Date(start.getTime() + MS_PER_DAY);
}

function startInclusiveForSnapshotDate(snapshotDateEndExclusive: Date): Date {
  return new Date(snapshotDateEndExclusive.getTime() - CRM_REPORTING_MAX_WINDOW_DAYS * MS_PER_DAY);
}

function withTimeout<T>(
  startWork: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return withCrmForecastSnapshotTimeout(startWork, timeoutMs, SOFT_TIMEOUT_MESSAGE);
}
