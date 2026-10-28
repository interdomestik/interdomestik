'use server';

import { assignClaimCore } from './admin-claims/assign';
import { getActionContext } from './admin-claims/context';
import { updateClaimStatusCore } from './admin-claims/update-status';

export async function updateClaimStatus(formData: FormData) {
  const { session, requestHeaders } = await getActionContext();
  return updateClaimStatusCore({ formData, session, requestHeaders });
}

export async function assignClaim(claimId: string, staffId: string | null) {
  const { session, requestHeaders } = await getActionContext();
  return assignClaimCore({ claimId, staffId, session, requestHeaders });
}
