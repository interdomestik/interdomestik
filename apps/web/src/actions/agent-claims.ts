'use server';

import { assignClaimCore } from './agent-claims/assign';
import { getActionContext } from './agent-claims/context';
import { updateClaimStatusCore } from './agent-claims/update-status';

export async function updateClaimStatus(claimId: string, newStatus: string) {
  const { session, requestHeaders } = await getActionContext();
  return updateClaimStatusCore({ claimId, newStatus, session, requestHeaders });
}

export async function assignClaim(claimId: string, agentId: string | null) {
  const { session, requestHeaders } = await getActionContext();
  return assignClaimCore({ claimId, agentId, session, requestHeaders });
}
