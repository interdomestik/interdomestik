import type { CrmWeightedPipelineRow } from '@interdomestik/domain-crm/reporting';

import type { CrmForecastSnapshotWorkItem } from '@/lib/domain-crm/forecast-snapshot-work-items';

const PII_RESPONSE_KEYS = new Set('description|email|fullName|notes|phone|subject'.split('|'));

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
