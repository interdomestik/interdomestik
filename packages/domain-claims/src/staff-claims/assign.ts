import { and, claims, db, eq, user as userTable } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { isNull } from 'drizzle-orm';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import { assignClaimSchema } from '../validators/claims';
import { buildScopedStaffClaimWhere, buildStaffClaimReadScope } from './scope';
import type { ActionResult } from './types';

type StaffUser = ClaimsSession['user'] & { branchId?: string | null };
type StaffClaimRecord = { id: string; staffId: string | null; branchId: string | null };

function resolveNextStaffId(params: { requestedStaffId?: string | null; userId: string }) {
  return params.requestedStaffId === undefined ? params.userId : params.requestedStaffId;
}

function buildAssignmentGuard(previousStaffId: string | null) {
  return previousStaffId ? eq(claims.staffId, previousStaffId) : isNull(claims.staffId);
}

async function getScopedClaim(args: {
  branchId: string | null;
  claimId: string;
  tenantId: string;
  userId: string;
}): Promise<StaffClaimRecord | undefined> {
  const [existingClaim] = await db
    .select({ id: claims.id, staffId: claims.staffId, branchId: claims.branchId })
    .from(claims)
    .where(buildScopedStaffClaimWhere(args))
    .limit(1);

  return existingClaim;
}

function buildAssigneeScope(args: { branchId: string | null; staffId: string; tenantId: string }) {
  const baseScope = and(eq(userTable.id, args.staffId), eq(userTable.role, 'staff'));

  if (args.branchId == null) {
    return withTenant(args.tenantId, userTable.tenantId, baseScope);
  }

  return withTenant(
    args.tenantId,
    userTable.tenantId,
    and(baseScope, eq(userTable.branchId, args.branchId))
  );
}

async function findScopedAssignee(args: {
  branchId: string | null;
  staffId: string;
  tenantId: string;
}) {
  return db.query.user.findFirst({
    where: buildAssigneeScope(args),
    columns: {
      id: true,
    },
  });
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

  try {
    const existingClaim = await getScopedClaim({
      branchId,
      claimId,
      tenantId,
      userId: user.id,
    });

    if (existingClaim === undefined) {
      return { success: false, error: 'Claim not found or access denied' };
    }

    if (existingClaim.staffId === nextStaffId) {
      return { success: true };
    }

    if (nextStaffId !== null && nextStaffId !== user.id) {
      const assignee = await findScopedAssignee({
        branchId,
        staffId: nextStaffId,
        tenantId,
      });

      if (assignee == null) {
        return { success: false, error: 'Staff member not found or out of scope' };
      }
    }

    const previousStaffId = existingClaim.staffId;
    const now = new Date();
    const scopedWhere = withTenant(
      tenantId,
      claims.tenantId,
      buildStaffClaimReadScope({ branchId, claimId, userId: user.id })
    );
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
