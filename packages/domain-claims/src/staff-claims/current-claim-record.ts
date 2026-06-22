import { claims, db } from '@interdomestik/database';
import type { SQL } from 'drizzle-orm';

import { resolveClaimLifecycleCommandProjection } from '../claims/lifecycle-read-model';
import type { ClaimStatus } from './types';

export type CurrentClaimRecord = {
  category: string;
  staffId: string | null;
  status: ClaimStatus;
  title: string;
  userId: string;
};

export type StaffCurrentClaimResult =
  | { status: 'found'; currentClaim: CurrentClaimRecord }
  | { status: 'not_found' }
  | { status: 'invalid_current_status' };

export async function loadStaffCurrentClaimRecord(
  staffScopeWhere: SQL
): Promise<StaffCurrentClaimResult> {
  // db-access-guard: tenant-scoped -- reason: caller supplies scoped staff claim predicate.
  const [currentClaimRow] = await db
    .select({
      caseLifecycleState: claims.caseLifecycleState,
      category: claims.category,
      recoveryLifecycleState: claims.recoveryLifecycleState,
      title: claims.title,
      userId: claims.userId,
      staffId: claims.staffId,
    })
    .from(claims)
    .where(staffScopeWhere)
    .limit(1);

  if (!currentClaimRow) return { status: 'not_found' };

  const currentState = resolveClaimLifecycleCommandProjection(currentClaimRow);
  if (!currentState.success) return { status: 'invalid_current_status' };

  return {
    status: 'found',
    currentClaim: { ...currentClaimRow, status: currentState.status },
  };
}
