'use server';

import { getActionContext } from './agent-claims/context';
import { updateClaimStatusCore } from './agent-claims/update-status';

export async function updateClaimStatus(claimId: string, newStatus: string) {
  const { session, authority, requestHeaders } = await getActionContext();
  return updateClaimStatusCore({ claimId, newStatus, session, authority, requestHeaders });
}
