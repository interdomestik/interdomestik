'use server';

import { auth } from '@/lib/auth';
import { claimStageHistory, claims, db } from '@interdomestik/database';
import { statusEnum } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export type ClaimStatus = (typeof statusEnum.enumValues)[number];

export type ActionResult<T = void> = {
  success: boolean;
  error?: string;
  data?: T;
};

/**
 * Assign a claim to a staff member (usually self)
 */
export async function assignClaim(claimId: string, staffId: string): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user || session.user.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const now = new Date();
    await db
      .update(claims)
      .set({
        staffId: staffId,
        assignedAt: now,
        assignedById: session.user.id,
        updatedAt: now,
      })
      .where(eq(claims.id, claimId));

    revalidatePath(`/staff/claims/${claimId}`);
    revalidatePath('/staff/claims');
    return { success: true };
  } catch (error) {
    console.error('Failed to assign claim:', error);
    return { success: false, error: 'Failed to assign claim' };
  }
}

/**
 * Update claim status and optionally add a history note
 */
export async function updateClaimStatus(
  claimId: string,
  newStatus: ClaimStatus,
  note?: string,
  isPublicChange: boolean = true
): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });

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
