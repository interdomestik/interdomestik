import { claims, db, eq } from '@interdomestik/database';

import type { ActionResult } from './types';
import type { ClaimsSession } from '../claims/types';

/** Assign a claim to the current staff member */
export async function assignClaimCore(params: {
  claimId: string;
  session: ClaimsSession | null;
}): Promise<ActionResult> {
  const { claimId, session } = params;

  if (!session?.user || session.user.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const [existingClaim] = await db
      .select({ id: claims.id })
      .from(claims)
      .where(eq(claims.id, claimId))
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
      .where(eq(claims.id, claimId));

    return { success: true };
  } catch (error) {
    console.error('Failed to assign claim:', error);
    return { success: false, error: 'Failed to assign claim' };
  }
}
