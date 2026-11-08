type MockFn = <T extends (...args: never[]) => unknown>(impl: T) => unknown;

export function createQueuedLimit(mockFn: MockFn, selectResults: unknown[][]) {
  return mockFn(async () => selectResults.shift() ?? []);
}

// `lockRows` answers a `select ... for update` (a row lock read), apart from the queued results.
export function createQueuedWhere(
  mockFn: MockFn,
  selectResults: unknown[][],
  lockRows: unknown[] = []
) {
  return mockFn(() => ({
    for: mockFn(() => Promise.resolve(lockRows)),
    orderBy: mockFn(() => ({
      limit: createQueuedLimit(mockFn, selectResults),
    })),
    limit: createQueuedLimit(mockFn, selectResults),
  }));
}

export function createQueuedFrom(
  mockFn: MockFn,
  selectResults: unknown[][],
  lockRows: unknown[] = []
) {
  return mockFn(() => ({
    where: createQueuedWhere(mockFn, selectResults, lockRows),
  }));
}
