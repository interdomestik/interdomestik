import { and, claims, db, eq } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import { resolveClaimLifecycleCommandProjection } from './claims/lifecycle-read-model';
import {
  ClaimTransitionConflictError,
  transitionClaimStatusInTransaction,
} from './claims/transition';
import type { ActionResult, ClaimsSession } from './claims/types';
import { claimStatusSchema } from './validators/claims';

type StaffUser = ClaimsSession['user'] & { branchId?: string | null };

export async function updateClaimStatus(params: {
  claimId: string;
  newStatus: string;
  note?: string;
  session: ClaimsSession | null;
}): Promise<ActionResult> {
  const { claimId, newStatus, note, session } = params;
  if (session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized', data: undefined };
  }

  const parsed = claimStatusSchema.safeParse({ status: newStatus });
  if (!parsed.success) {
    return { success: false, error: 'Invalid status', data: undefined };
  }

  const user = session.user as StaffUser;
  const tenantId = ensureTenantId(session);
  const branchId = user.branchId ?? null;
  const scope =
    branchId != null
      ? and(eq(claims.id, claimId), eq(claims.branchId, branchId))
      : and(eq(claims.id, claimId), eq(claims.staffId, user.id));
  const scopedWhere = withTenant(tenantId, claims.tenantId, scope);
  try {
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    return await db.transaction(async tx => {
      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
      const [existingClaim] = await tx
        .select({
          caseLifecycleState: claims.caseLifecycleState,
          id: claims.id,
          recoveryLifecycleState: claims.recoveryLifecycleState,
          status: claims.status,
        })
        .from(claims)
        .where(scopedWhere)
        .limit(1);

      if (!existingClaim) {
        return { success: false, error: 'Claim not found or access denied', data: undefined };
      }

      const currentState = resolveClaimLifecycleCommandProjection(existingClaim);
      if (currentState.success && currentState.status === parsed.data.status && !note) {
        return { success: true, error: undefined };
      }

      const transitionResult = await transitionClaimStatusInTransaction(
        tx as unknown as Parameters<typeof transitionClaimStatusInTransaction>[0],
        {
          actor: { id: user.id, role: 'staff' },
          claimId,
          isPublic: true,
          note: note ?? null,
          requiredWhereCondition: scope,
          tenantId,
          toStatus: parsed.data.status as ClaimStatus,
        }
      );

      if (!transitionResult.success) {
        const error =
          transitionResult.error === 'claim_not_found'
            ? 'Claim not found or access denied'
            : 'Failed to update claim status';
        return { success: false, error, data: undefined };
      }

      return { success: true, error: undefined };
    });
  } catch (error) {
    if (error instanceof ClaimTransitionConflictError) {
      return { success: false, error: 'Claim not found or access denied', data: undefined };
    }
    throw error;
  }
}
