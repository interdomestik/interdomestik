import { and, claims, db, eq } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ClaimsSession } from '../claims/types';
import type { ActionResult } from './types';

/** Assign a claim to the current staff member */
export async function assignClaimCore(params: {
  claimId: string;
  session: ClaimsSession | null;
}): Promise<ActionResult> {
  const { claimId, session } = params;

  if (!session?.user || session.user.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  const tenantId = ensureTenantId(session);

  try {
    const [existingClaim] = await db
      .select({ id: claims.id })
      .from(claims)
      .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
      .limit(1);

    if (!existingClaim) {
      return { success: false, error: 'Claim not found' };
    }

    const now = new Date();
    await db
      .update(claims)
      .set({
        staffId: session.user.id,
        assignedAt: now,
        assignedById: session.user.id,
        updatedAt: now,
      })
      .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));

    return { success: true };
  } catch (error) {
    console.error('Failed to assign claim:', error);
    return { success: false, error: 'Failed to assign claim' };
  }
}
