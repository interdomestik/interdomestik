import { claimStageHistory, claims, db, eq } from '@interdomestik/database';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import type { ActionResult, ClaimStatus } from './types';

/** Update claim status and optionally add a history note */
export async function updateClaimStatusCore(params: {
  claimId: string;
  newStatus: ClaimStatus;
  note?: string;
  isPublicChange?: boolean;
  session: NonNullable<Session> | null;
}): Promise<ActionResult> {
  const { claimId, newStatus, note, isPublicChange = true, session } = params;

  if (!session?.user || session.user.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const [currentClaim] = await db
      .select({ status: claims.status })
      .from(claims)
      .where(eq(claims.id, claimId))
      .limit(1);

    if (!currentClaim) {
      return { success: false, error: 'Claim not found' };
    }

    if (currentClaim.status === newStatus && !note) {
      return { success: true }; // No change needed
    }

    await db.transaction(async tx => {
      // 1. Update claim status
      if (currentClaim.status !== newStatus) {
        await tx
          .update(claims)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(claims.id, claimId));
      }

      // 2. Add history entry
      await tx.insert(claimStageHistory).values({
        id: crypto.randomUUID(),
        claimId,
        fromStatus: currentClaim.status,
        toStatus: newStatus,
        changedById: session.user.id,
        changedByRole: 'staff',
        note: note || null,
        isPublic: isPublicChange,
        createdAt: new Date(),
      });
    });

    revalidatePath(`/staff/claims/${claimId}`);
    revalidatePath('/staff/claims');
    return { success: true };
  } catch (error) {
    console.error('Failed to update claim status:', error);
    return { success: false, error: 'Failed to update claim status' };
  }
}
