'use server';

import { headers } from 'next/headers';

import { assignClaimCore } from './admin-claims/assign';
import { getActionContext } from './admin-claims/context';
import { updateClaimStatusCore } from './admin-claims/update-status';

export async function updateClaimStatus(formData: FormData) {
  const { session, requestHeaders } = await getActionContext();
  return updateClaimStatusCore({ formData, session, requestHeaders });
}

export async function assignClaim(claimId: string, staffId: string | null, operationId?: string) {
  const requestHeaders = await headers();
  return assignClaimCore({ claimId, staffId, requestHeaders, operationId });
}
