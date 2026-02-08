import { and, claimStageHistory, claims, db, eq, isNull } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

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
  return db.transaction(async tx => {
    const [existingClaim] = await tx
      .select({
        id: claims.id,
        status: claims.status,
      })
      .from(claims)
      .where(scopedWhere)
      .limit(1);

    if (!existingClaim) {
      return { success: false, error: 'Claim not found or access denied', data: undefined };
    }

    if (existingClaim.status === parsed.data.status && !note) {
      return { success: true, error: undefined };
    }

    const now = new Date();
    const previousStatus = existingClaim.status;
    const nextStatus = parsed.data.status as NonNullable<typeof existingClaim.status>;
    const updateData: {
      status: NonNullable<typeof existingClaim.status>;
      updatedAt: Date;
      statusUpdatedAt?: Date;
    } = {
      status: nextStatus,
      updatedAt: now,
    };
    if (existingClaim.status !== nextStatus) {
      updateData.statusUpdatedAt = now;
    }

    const statusGuard =
      previousStatus == null ? isNull(claims.status) : eq(claims.status, previousStatus);

    const updatedClaims = await tx
      .update(claims)
      .set(updateData)
      .where(and(scopedWhere, statusGuard))
      .returning({ id: claims.id });

    if (updatedClaims.length === 0) {
      return { success: false, error: 'Claim not found or access denied', data: undefined };
    }

    await tx.insert(claimStageHistory).values({
      id: crypto.randomUUID(),
      tenantId,
      claimId,
      fromStatus: previousStatus,
      toStatus: nextStatus,
      changedById: user.id,
      changedByRole: 'staff',
      note: note ?? null,
      isPublic: true,
      createdAt: now,
    });

    return { success: true, error: undefined };
  });
}
