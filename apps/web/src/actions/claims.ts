'use server';

import type { CreateClaimValues } from '@/lib/validators/claims';
import { getActionContext } from './claims/context';
import { createClaimCore } from './claims/create';
import { cancelClaimCore, updateDraftClaimCore } from './claims/draft';
import { updateClaimStatusCore } from './claims/status';
import { submitClaimCore } from './claims/submit';

export async function createClaim(prevState: unknown, formData: FormData) {
  const { requestHeaders, session } = await getActionContext();
  return createClaimCore({ session, requestHeaders, formData });
}

export async function submitClaim(data: CreateClaimValues) {
  const { requestHeaders, session } = await getActionContext();
  return submitClaimCore({ session, requestHeaders, data });
}

export async function updateDraftClaim(claimId: string, data: CreateClaimValues) {
  const { requestHeaders, session } = await getActionContext();
  return updateDraftClaimCore({ session, requestHeaders, claimId, data });
}

export async function cancelClaim(claimId: string) {
  const { requestHeaders, session } = await getActionContext();
  return cancelClaimCore({ session, requestHeaders, claimId });
}

export async function updateClaimStatus(claimId: string, newStatus: string) {
  const { requestHeaders, session } = await getActionContext();
  return updateClaimStatusCore({ session, requestHeaders, claimId, newStatus });
}
