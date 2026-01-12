/**
 * Determines if a filter key defines the underlying pool of data.
 *
 * - Pool-defining filters (lifecycle, branch, assignee): Changing these requires fetching a NEW pool.
 *   Action: Must DELETE poolAnchor and RESET page.
 *
 * - In-pool filters (priority): Changing these filters the EXISTING pool.
 *   Action: KEEP poolAnchor and RESET page.
 */
export function isPoolDefiningParam(key: string): boolean {
  return ['lifecycle', 'branch', 'assignee', 'search'].includes(key);
}
