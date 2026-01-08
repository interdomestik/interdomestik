'use server';

import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { CreateClaimValues } from '@/lib/validators/claims';
import { createClaimCore } from './claims/create';
import { cancelClaimCore, updateDraftClaimCore } from './claims/draft';
import { updateClaimStatusCore } from './claims/status';
import { submitClaimCore } from './claims/submit';

// Note: We need runAuthenticatedAction to handle FormData if we pass it directly.
// But createClaim signature starts with prevState.
// runAuthenticatedAction's handler signature is different.
// So we wrap the internal logic.

export async function createClaim(prevState: unknown, formData: FormData) {
  // We can't easily change the signature of createClaim if it's used as useFormState.
  // We will wrap the existing body.

  return runAuthenticatedAction(async ({ session, requestHeaders }) => {
    const limit = await enforceRateLimitForAction({
      name: 'action:create-claim',
      limit: 5,
      windowSeconds: 600, // 10 minutes
      headers: requestHeaders,
    });

    if (limit.limited) {
      // Safe Action wrapper expects us to return data or throws.
      // But createClaim returns { success: false, error: string }
      return { success: false, error: 'Too many requests. Please try again later.' };
    }

    return createClaimCore({ session, requestHeaders, formData });
  });
}

import { runAuthenticatedAction } from '@/lib/safe-action';

// ...

export async function submitClaim(data: CreateClaimValues) {
  return runAuthenticatedAction(async ({ session, requestHeaders }) => {
    const limit = await enforceRateLimitForAction({
      name: 'action:submit-claim',
      limit: 5,
      windowSeconds: 600,
      headers: requestHeaders,
    });

    if (limit.limited) {
      // We can throw or return specific error structure.
      // runAuthenticatedAction handles generic errors, but for specific logic returns we can return shape directly.
      return { success: false, error: 'Too many requests. Please try again later.' };
    }

    // submitClaimCore handles validation internally
    return submitClaimCore({ session, requestHeaders, data });
  });
}

export async function updateDraftClaim(claimId: string, data: CreateClaimValues) {
  return runAuthenticatedAction(async ({ session, requestHeaders }) => {
    const limit = await enforceRateLimitForAction({
      name: 'action:update-draft',
      limit: 50,
      windowSeconds: 600,
      headers: requestHeaders,
    });
    if (limit.limited) return { success: false, error: 'Too many requests' };
    return updateDraftClaimCore({ session, requestHeaders, claimId, data });
  });
}

export async function cancelClaim(claimId: string) {
  return runAuthenticatedAction(async ({ session, requestHeaders }) => {
    const limit = await enforceRateLimitForAction({
      name: 'action:cancel-claim',
      limit: 10,
      windowSeconds: 600,
      headers: requestHeaders,
    });
    if (limit.limited) return { success: false, error: 'Too many requests' };
    return cancelClaimCore({ session, requestHeaders, claimId });
  });
}

export async function updateClaimStatus(claimId: string, newStatus: string) {
  return runAuthenticatedAction(async ({ session, requestHeaders }) => {
    const limit = await enforceRateLimitForAction({
      name: 'action:update-status',
      limit: 100,
      windowSeconds: 600,
      headers: requestHeaders,
    });
    if (limit.limited) return { success: false, error: 'Too many requests' };
    return updateClaimStatusCore({ session, requestHeaders, claimId, newStatus });
  });
}
