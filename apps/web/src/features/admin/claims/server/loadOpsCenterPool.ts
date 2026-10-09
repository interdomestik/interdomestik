// Phase 2.8: Ops pool orchestration across the access-tenant and derived home-tenant transactions.
// Every transaction is released before the next opens (no nesting; safe on a max-1 pool).
import { withTenantContext } from '@interdomestik/database';

import type { RawClaimRow } from '../mappers';
import type { OpsCenterFilters } from '../types';
import type { ClaimsVisibilityContext } from './claimVisibility';
import { enrichHomeTenantRefs, matchHomeRefFilter } from './readOpsCenterHomeRefs';
import {
  rankTransferredMatches,
  readOpsCenterPoolRows,
  readTransferredCandidatePage,
  resolvePoolRefFilter,
  TRANSFERRED_SCAN_PAGE_SIZE,
  type OpsCenterPoolRow,
  type OpsPoolRefFilter,
  type TransferredCandidate,
} from './readOpsCenterPool';

interface ScanState {
  cursor: string | null;
  matchIds: string[];
  exhausted: boolean;
}

type AccessStep =
  | { kind: 'pool'; rows: OpsCenterPoolRow[] }
  | { kind: 'page'; matchIds: string[]; candidates: TransferredCandidate[]; cursor: string };

function accessContext(context: ClaimsVisibilityContext) {
  return { tenantId: context.tenantId, role: context.role };
}

/**
 * One access-tenant transaction: bound the accumulated transferred matches, then either read
 * the next transferred-candidate page or, once the scan is complete, read the pool.
 */
function runAccessStep(
  context: ClaimsVisibilityContext,
  filters: OpsCenterFilters,
  refFilter: OpsPoolRefFilter,
  state: ScanState
): Promise<AccessStep> {
  return withTenantContext(accessContext(context), async (tx): Promise<AccessStep> => {
    const matchIds = await rankTransferredMatches(tx, context, filters, state.matchIds);
    const candidates = state.exhausted
      ? []
      : await readTransferredCandidatePage(tx, context, filters, refFilter, state.cursor);
    const last = candidates.at(-1);
    if (!last) {
      return { kind: 'pool', rows: await readOpsCenterPoolRows(tx, context, filters, matchIds) };
    }
    return { kind: 'page', matchIds, candidates, cursor: last.id };
  });
}

/**
 * Loads the bounded ops pool (OPS_POOL_LIMIT + 1 rows). Branch and member-number filters are
 * applied to transferred claims through their home tenant before the pool cap. Errors propagate.
 */
export async function loadOpsCenterPool(
  context: ClaimsVisibilityContext,
  filters: OpsCenterFilters
): Promise<RawClaimRow[]> {
  const refFilter = resolvePoolRefFilter(filters);
  if (!refFilter) {
    const rows = await withTenantContext(accessContext(context), tx =>
      readOpsCenterPoolRows(tx, context, filters)
    );
    return enrichHomeTenantRefs(context, rows);
  }

  let step: AccessStep = await runAccessStep(context, filters, refFilter, {
    cursor: null,
    matchIds: [],
    exhausted: false,
  });
  while (step.kind === 'page') {
    const pending = await matchHomeRefFilter(context, refFilter, step.candidates);
    step = await runAccessStep(context, filters, refFilter, {
      cursor: step.cursor,
      matchIds: [...step.matchIds, ...pending],
      exhausted: step.candidates.length < TRANSFERRED_SCAN_PAGE_SIZE,
    });
  }
  return enrichHomeTenantRefs(context, step.rows);
}
