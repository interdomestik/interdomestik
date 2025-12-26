'use server';

import { assignClaimCore } from './staff-claims/assign';
import { getActionContext } from './staff-claims/context';
import type { ActionResult, ClaimStatus } from './staff-claims/types';
import { updateClaimStatusCore } from './staff-claims/update-status';

export type { ActionResult, ClaimStatus } from './staff-claims/types';

/**
 * Assign a claim to a staff member (usually self)
 */
export async function assignClaim(claimId: string): Promise<ActionResult> {
  const { session } = await getActionContext();
  return assignClaimCore({ claimId, session });
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
  const { session } = await getActionContext();
  return updateClaimStatusCore({ claimId, newStatus, note, isPublicChange, session });
}
