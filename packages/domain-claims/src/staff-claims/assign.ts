import { and, claims, db, eq, user as userTable } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { isNull, or } from 'drizzle-orm';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import { assignClaimSchema } from '../validators/claims';
import type { ActionResult } from './types';

function resolveNextStaffId(params: { requestedStaffId?: string | null; userId: string }) {
  return params.requestedStaffId === undefined ? params.userId : params.requestedStaffId;
}

function buildAssignmentGuard(previousStaffId: string | null) {
  return previousStaffId ? eq(claims.staffId, previousStaffId) : isNull(claims.staffId);
}

/** Assign a claim to an in-scope staff member, defaulting to self-assignment */
export async function assignClaimCore(
  params: {
    claimId: string;
    staffId?: string | null;
    session: ClaimsSession | null;
    requestHeaders?: Headers;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult> {
  const { claimId, session, requestHeaders } = params;
  type StaffUser = ClaimsSession['user'] & { branchId?: string | null };

  if (session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  const tenantId = ensureTenantId(session);
  const user = session.user as StaffUser;
  const branchId = user.branchId ?? null;
  const nextStaffId = resolveNextStaffId({
    requestedStaffId: params.staffId,
    userId: user.id,
  });
  const parsedAssignment = assignClaimSchema.safeParse({ staffId: nextStaffId });
  if (!parsedAssignment.success) {
    return { success: false, error: 'Invalid staff assignment', data: undefined };
  }
  const readScope =
    branchId != null
      ? and(eq(claims.id, claimId), eq(claims.branchId, branchId))
      : and(eq(claims.id, claimId), or(eq(claims.staffId, user.id), isNull(claims.staffId)));
  const scopedWhere = withTenant(tenantId, claims.tenantId, readScope);

  try {
    const [existingClaim] = await db
      .select({ id: claims.id, staffId: claims.staffId, branchId: claims.branchId })
      .from(claims)
      .where(scopedWhere)
      .limit(1);

    if (!existingClaim) {
      return { success: false, error: 'Claim not found or access denied' };
    }

    if (existingClaim.staffId === nextStaffId) {
      return { success: true };
    }

    if (nextStaffId) {
      const assignee = await db.query.user.findFirst({
        where:
          branchId != null
            ? withTenant(
                tenantId,
                userTable.tenantId,
                and(
                  eq(userTable.id, nextStaffId),
                  eq(userTable.role, 'staff'),
                  eq(userTable.branchId, branchId)
                )
              )
            : withTenant(
                tenantId,
                userTable.tenantId,
                and(eq(userTable.id, nextStaffId), eq(userTable.role, 'staff'))
              ),
        columns: {
          id: true,
        },
      });

      if (!assignee) {
        return { success: false, error: 'Staff member not found or out of scope' };
      }
    }

    const previousStaffId = existingClaim.staffId;
    const now = new Date();
    const updatedClaims = await db
      .update(claims)
      .set({
        staffId: nextStaffId,
        assignedAt: nextStaffId ? now : null,
        assignedById: nextStaffId ? user.id : null,
        updatedAt: now,
      })
      .where(and(scopedWhere, buildAssignmentGuard(previousStaffId ?? null)))
      .returning({ id: claims.id });

    if (updatedClaims.length === 0) {
      return { success: false, error: 'Claim not found or access denied' };
    }

    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        tenantId,
        action: nextStaffId ? 'claim.assigned' : 'claim.unassigned',
        entityType: 'claim',
        entityId: claimId,
        metadata: {
          previousStaffId,
          newStaffId: nextStaffId,
        },
        headers: requestHeaders,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to assign claim:', error);
    return { success: false, error: 'Failed to assign claim' };
  }
}
