import { claims, db, eq } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { SQLWrapper } from 'drizzle-orm';

import {
  transitionClaimStatusInTransaction,
  type TransitionClaimStatusResult,
} from '../claims/transition';
import type { ClaimTransitionActor } from '../claims/transition-guard';

export type TransitionAdminClaimStatusParams = {
  actor: ClaimTransitionActor;
  claimId: string;
  fromStatus: ClaimStatus;
  tenantId: string;
  toStatus: ClaimStatus;
};

function requiredTransitionCondition(params: TransitionAdminClaimStatusParams): SQLWrapper {
  return eq(claims.status, params.fromStatus);
}

export async function transitionAdminClaimStatus(
  params: TransitionAdminClaimStatusParams
): Promise<TransitionClaimStatusResult> {
  // db-access-guard: tenant-scoped -- reason: transition helper applies tenant-scoped CAS.
  return db.transaction(tx =>
    transitionClaimStatusInTransaction(tx, {
      actor: params.actor,
      claimId: params.claimId,
      requiredWhereCondition: requiredTransitionCondition(params),
      tenantId: params.tenantId,
      toStatus: params.toStatus,
    })
  );
}
