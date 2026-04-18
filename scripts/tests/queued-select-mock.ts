type MockFn = <T extends (...args: never[]) => unknown>(impl: T) => unknown;

export function createQueuedLimit(mockFn: MockFn, selectResults: unknown[][]) {
  return mockFn(async () => selectResults.shift() ?? []);
}

export function createQueuedWhere(mockFn: MockFn, selectResults: unknown[][]) {
  return mockFn(() => ({
    orderBy: mockFn(() => ({
      limit: createQueuedLimit(mockFn, selectResults),
    })),
    limit: createQueuedLimit(mockFn, selectResults),
  }));
}

export function createQueuedFrom(mockFn: MockFn, selectResults: unknown[][]) {
  return mockFn(() => ({
    where: createQueuedWhere(mockFn, selectResults),
  }));
}
