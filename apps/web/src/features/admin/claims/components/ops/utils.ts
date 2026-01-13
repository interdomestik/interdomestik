/**
 * Determines if a filter key defines the underlying pool of data.
 *
 * - Pool-defining filters (lifecycle, branch, assignee, search): Changing these requires fetching a NEW pool.
 *   Action: Must DELETE poolAnchor and RESET page.
 *
 * - In-pool filters (priority): Changing these filters the EXISTING pool.
 *   Action: KEEP poolAnchor and RESET page.
 */
export function isPoolDefiningParam(key: string): boolean {
  return ['lifecycle', 'branch', 'assignee', 'search'].includes(key);
}

/**
 * Centralized URL builder for Ops Queue.
 * Enforces anchor preservation rules strictly.
 */
export function buildQueueUrl(
  basePath: string,
  currentParams: URLSearchParams,
  updates: Record<string, string | null | undefined>
): string {
  const newParams = new URLSearchParams(currentParams.toString());

  // Track if we are hitting a pool-defining change
  let isPoolReset = false;

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      newParams.delete(key);
      // Deleting a pool-defining param is also a pool reset (e.g. clearing search)
      if (isPoolDefiningParam(key)) isPoolReset = true;
    } else {
      newParams.set(key, value);
      if (isPoolDefiningParam(key)) isPoolReset = true;
    }
  });

  // Rule 1: Always reset page on any filter change (unless explicitly handling pagination)
  // (Caller should handle 'page' update if they want pagination, this default protects filters)
  if (!updates['page']) {
    newParams.delete('page');
  }

  // Rule 2: If pool-defining param changed, clear anchor
  if (isPoolReset) {
    newParams.delete('poolAnchor');
  }
  // Rule 3 (Implicit): If only priority changed, poolAnchor is PRESERVED.

  return `${basePath}?${newParams.toString()}`;
}
