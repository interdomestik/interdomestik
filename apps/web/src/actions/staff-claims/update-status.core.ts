import { updateClaimStatusCore as updateClaimStatusCoreDomain } from '@interdomestik/domain-claims/staff-claims/update-status';

import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import type { ActionResult, ClaimStatus } from './types';

export async function updateClaimStatusCore(params: {
  claimId: string;
  newStatus: ClaimStatus;
  note?: string;
  isPublicChange?: boolean;
  session: NonNullable<Session> | null;
}): Promise<ActionResult> {
  const result = await updateClaimStatusCoreDomain(params);

  if (result.success) {
    revalidatePath(`/staff/claims/${params.claimId}`);
    revalidatePath('/staff/claims');
  }

  return result;
}
