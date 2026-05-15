import {
  deriveCrmForecastSnapshot,
  deriveCrmWeightedPipeline,
  type CrmForecastSnapshotRow,
  type CrmReportingBaseInput,
  type CrmWeightedPipelineRow,
} from '@interdomestik/domain-crm/reporting';
import type { CrmReportingRepository } from '@interdomestik/domain-crm/reporting/repository';

import type { CrmForecastSnapshotWorkItem } from '@/lib/domain-crm/forecast-snapshot-work-items';

const PII_RESPONSE_KEYS = new Set('description|email|fullName|notes|phone|subject'.split('|'));

export type CrmForecastSnapshotTenantWeightedRows = Map<
  string,
  Promise<readonly CrmWeightedPipelineRow[]>
>;

export class CrmForecastSnapshotSoftTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SoftTimeoutError';
  }
}

export function isCrmForecastSnapshotSoftTimeoutError(
  error: unknown
): error is CrmForecastSnapshotSoftTimeoutError {
  return error instanceof CrmForecastSnapshotSoftTimeoutError;
}

export function throwIfCrmForecastSnapshotAborted(signal: AbortSignal, message: string): void {
  if (signal.aborted) {
    throw new CrmForecastSnapshotSoftTimeoutError(message);
  }
}

export function withCrmForecastSnapshotTimeout<T>(
  startWork: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(new CrmForecastSnapshotSoftTimeoutError(message));
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

export function assertNoCrmForecastSnapshotPiiKeys(value: unknown, label: string): void {
  const keys = new Set<string>();
  collectKeys(value, keys);
  for (const key of keys) {
    if (PII_RESPONSE_KEYS.has(key)) {
      throw new Error(`${label} contains PII key: ${key}`);
    }
  }
}

export function isCrmForecastSnapshotWorkItemRow(
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

export function loadCrmForecastSnapshotTenantRows(args: {
  reportingInputFor: (tenantId: string, from: Date, to: Date) => CrmReportingBaseInput;
  reportingRepository: CrmReportingRepository;
  snapshotDateEndExclusive: Date;
  snapshotDateStartInclusive: Date;
  tenantRows: CrmForecastSnapshotTenantWeightedRows;
  workItem: CrmForecastSnapshotWorkItem;
}): Promise<readonly CrmWeightedPipelineRow[]> {
  const cached = args.tenantRows.get(args.workItem.tenantId);
  if (cached) return cached;
  const loaded = args.reportingRepository.listWeightedPipelineRows(
    args.reportingInputFor(
      args.workItem.tenantId,
      args.snapshotDateStartInclusive,
      args.snapshotDateEndExclusive
    )
  );
  args.tenantRows.set(args.workItem.tenantId, loaded);
  return loaded;
}

export function deriveCrmForecastSnapshotsForWorkItem(args: {
  createdAt: string;
  idempotencyKey: string;
  input: CrmReportingBaseInput;
  rows: readonly CrmWeightedPipelineRow[];
  snapshotDate: string;
  sourceRunId: string;
  workItem: CrmForecastSnapshotWorkItem;
}): CrmForecastSnapshotRow[] {
  const weighted = deriveCrmWeightedPipeline(
    args.rows.filter(row => isCrmForecastSnapshotWorkItemRow(row, args.workItem)),
    {
      ...args.input,
      groupBy: ['branch', 'pipeline'],
    }
  );
  return deriveCrmForecastSnapshot(weighted.groups, {
    createdAt: args.createdAt,
    idempotencyKey: args.idempotencyKey,
    snapshotDate: args.snapshotDate,
    sourceRunId: args.sourceRunId,
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
