import { vi } from 'vitest';

export function createQueuedLimit(selectResults: unknown[][]) {
  return vi.fn(async () => selectResults.shift() ?? []);
}

export function createQueuedWhere(selectResults: unknown[][]) {
  return vi.fn(() => ({
    orderBy: vi.fn(() => ({
      limit: createQueuedLimit(selectResults),
    })),
    limit: createQueuedLimit(selectResults),
  }));
}

export function createQueuedFrom(selectResults: unknown[][]) {
  return vi.fn(() => ({
    where: createQueuedWhere(selectResults),
  }));
}
