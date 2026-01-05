'use server';

import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { CreateClaimValues } from '@/lib/validators/claims';
import { getActionContext } from './claims/context';
import { createClaimCore } from './claims/create';
import { cancelClaimCore, updateDraftClaimCore } from './claims/draft';
import { updateClaimStatusCore } from './claims/status';
import { submitClaimCore } from './claims/submit';

export async function createClaim(prevState: unknown, formData: FormData) {
  const { requestHeaders, session } = await getActionContext();

  const limit = await enforceRateLimitForAction({
    name: 'action:create-claim',
    limit: 5,
    windowSeconds: 600, // 10 minutes
    headers: requestHeaders,
  });
  if (limit.limited) return { error: 'Too many requests. Please try again later.' };

  return createClaimCore({ session, requestHeaders, formData });
}

export async function submitClaim(data: CreateClaimValues) {
  const { requestHeaders, session } = await getActionContext();

  const limit = await enforceRateLimitForAction({
    name: 'action:submit-claim',
    limit: 5,
    windowSeconds: 600,
    headers: requestHeaders,
  });
  if (limit.limited) return { success: false, error: 'Too many requests. Please try again later.' };

  return submitClaimCore({ session, requestHeaders, data });
}

export async function updateDraftClaim(claimId: string, data: CreateClaimValues) {
  const { requestHeaders, session } = await getActionContext();

  const limit = await enforceRateLimitForAction({
    name: 'action:update-draft',
    limit: 50, // Higher limit for autosave/edits
    windowSeconds: 600,
    headers: requestHeaders,
  });
  if (limit.limited) return { success: false, error: 'Too many requests' };

  return updateDraftClaimCore({ session, requestHeaders, claimId, data });
}

export async function cancelClaim(claimId: string) {
  const { requestHeaders, session } = await getActionContext();

  const limit = await enforceRateLimitForAction({
    name: 'action:cancel-claim',
    limit: 10,
    windowSeconds: 600,
    headers: requestHeaders,
  });
  if (limit.limited) return { success: false, error: 'Too many requests' };

  return cancelClaimCore({ session, requestHeaders, claimId });
}

export async function updateClaimStatus(claimId: string, newStatus: string) {
  const { requestHeaders, session } = await getActionContext();

  // High limit for staff working through a queue
  const limit = await enforceRateLimitForAction({
    name: 'action:update-status',
    limit: 100,
    windowSeconds: 600,
    headers: requestHeaders,
  });
  if (limit.limited) return { error: 'Too many requests' }; // Core returns { error? } shape

  return updateClaimStatusCore({ session, requestHeaders, claimId, newStatus });
}
