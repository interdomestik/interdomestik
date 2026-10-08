import type { AdminClaimsV2Response, LifecycleStats } from '../../types';

export const STATS: LifecycleStats = {
  intake: 2,
  verification: 1,
  processing: 0,
  negotiation: 0,
  legal: 0,
  completed: 0,
};
export const ZERO_STATS: LifecycleStats = {
  intake: 0,
  verification: 0,
  processing: 0,
  negotiation: 0,
  legal: 0,
  completed: 0,
};

export function okResponse(
  rows: Array<{ id: string }>,
  stats: LifecycleStats,
  totalPages = 1,
  totalCount = rows.length
): AdminClaimsV2Response {
  return {
    kind: 'ok',
    rows: rows as never,
    stats,
    pagination: { page: 1, perPage: 20, totalCount, totalPages },
  };
}
