import { claimStageHistory, claims, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import type { ActionResult, ClaimStatus } from './types';

import { claimStatusSchema } from '../validators/claims';

/** Update claim status and optionally add a history note */
export async function updateClaimStatusCore(
  params: {
    claimId: string;
    newStatus: string;
    note?: string;
    isPublicChange?: boolean;
    session: ClaimsSession | null;
    requestHeaders?: Headers; // Optional headers
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult> {
  const { claimId, newStatus, note, isPublicChange = true, session } = params;

  if (!session?.user || session.user.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate status
  const parsed = claimStatusSchema.safeParse({ status: newStatus });
  if (!parsed.success) {
    return { success: false, error: 'Invalid status' };
  }
  const status = parsed.data.status as ClaimStatus;

  const tenantId = ensureTenantId(session);

  try {
    const [currentClaim] = await db
      .select({ status: claims.status })
      .from(claims)
      .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)))
      .limit(1);

    if (!currentClaim) {
      return { success: false, error: 'Claim not found' };
    }

    if (currentClaim.status === status && !note) {
      return { success: true }; // No change needed
    }

    const oldStatus = currentClaim.status;

    await db.transaction(async tx => {
      // 1. Update claim status
      if (currentClaim.status !== status) {
        await tx
          .update(claims)
          .set({ status: status, updatedAt: new Date() })
          .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));
      }

      // 2. Add history entry
      await tx.insert(claimStageHistory).values({
        id: crypto.randomUUID(),
        tenantId,
        claimId,
        fromStatus: currentClaim.status,
        toStatus: status,
        changedById: session.user.id,
        changedByRole: 'staff',
        note: note || null,
        isPublic: isPublicChange,
        createdAt: new Date(),
      });
    });

    // 🔒 SECURITY Audit Log
    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        tenantId,
        action: 'claim.status_changed', // Same action as admin for consistency
        entityType: 'claim',
        entityId: claimId,
        metadata: {
          oldStatus,
          newStatus: status,
          note: note || undefined,
          isPublic: isPublicChange,
        },
        headers: params.requestHeaders,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to update claim status:', error);
    return { success: false, error: 'Failed to update claim status' };
  }
}
