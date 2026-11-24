'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';
import { memberGuarded } from '@/lib/privacy/require-member-acceptance';

import type { ClaimStartHandoffContext } from '@interdomestik/domain-claims/claims/types';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { CreateClaimValues } from '@/lib/validators/claims';
import { createClaimCore } from './claims/create';
import { cancelClaimCore, updateDraftClaimCore } from './claims/draft';
import { updateClaimStatusCore } from './claims/status';
import { submitClaimCore } from './claims/submit';

const guardedCreateClaim = memberGuarded(
  async ({ session, authority }, _prevState: unknown, formData: FormData) => {
    return runAuthenticatedAction(async ({ requestHeaders }) => {
      const limit = await enforceRateLimitForAction({
        name: 'action:create-claim',
        limit: 5,
        windowSeconds: 600, // 10 minutes
        headers: requestHeaders,
        productionSensitive: true,
      });

      if (limit.limited) {
        // Safe Action wrapper expects us to return data or throws.
        // But createClaim returns { success: false, error: string }
        return { success: false, error: 'Too many requests. Please try again later.' };
      }

      return createClaimCore({ session, authority, requestHeaders, formData });
    });
  }
);

// ...

const guardedSubmitClaim = memberGuarded(
  async (
    { session, authority },
    data: CreateClaimValues,
    idempotencyKey?: string,
    handoffContext?: ClaimStartHandoffContext | null
  ) => {
    return runAuthenticatedAction(async ({ requestHeaders }) => {
      const limit = await enforceRateLimitForAction({
        name: 'action:submit-claim',
        limit: 5,
        windowSeconds: 600,
        headers: requestHeaders,
        productionSensitive: true,
      });

      if (limit.limited) {
        // We can throw or return specific error structure.
        // runAuthenticatedAction handles generic errors, but for specific logic returns we can return shape directly.
        return { success: false, error: 'Too many requests. Please try again later.' };
      }

      // submitClaimCore handles validation internally
      return submitClaimCore({
        session,
        authority,
        requestHeaders,
        data,
        idempotencyKey,
        handoffContext,
      });
    });
  }
);

const guardedUpdateDraftClaim = memberGuarded(
  async ({ session, authority }, claimId: string, data: CreateClaimValues) => {
    return runAuthenticatedAction(async ({ requestHeaders }) => {
      const limit = await enforceRateLimitForAction({
        name: 'action:update-draft',
        limit: 50,
        windowSeconds: 600,
        headers: requestHeaders,
        productionSensitive: true,
      });
      if (limit.limited) return { success: false, error: 'Too many requests' };
      return updateDraftClaimCore({ session, authority, requestHeaders, claimId, data });
    });
  }
);

const guardedCancelClaim = memberGuarded(async ({ session, authority }, claimId: string) => {
  return runAuthenticatedAction(async ({ requestHeaders }) => {
    const limit = await enforceRateLimitForAction({
      name: 'action:cancel-claim',
      limit: 10,
      windowSeconds: 600,
      headers: requestHeaders,
      productionSensitive: true,
    });
    if (limit.limited) return { success: false, error: 'Too many requests' };
    return cancelClaimCore({ session, authority, requestHeaders, claimId });
  });
});

const guardedUpdateClaimStatus = memberGuarded(
  async ({ session, authority }, claimId: string, newStatus: string) => {
    return runAuthenticatedAction(async ({ requestHeaders }) => {
      const limit = await enforceRateLimitForAction({
        name: 'action:update-status',
        limit: 100,
        windowSeconds: 600,
        headers: requestHeaders,
        productionSensitive: true,
      });
      if (limit.limited) return { success: false, error: 'Too many requests' };
      return updateClaimStatusCore({ session, authority, requestHeaders, claimId, newStatus });
    });
  }
);

export async function createClaim(...args: Parameters<typeof guardedCreateClaim>) {
  return guardedCreateClaim(...args);
}

export async function submitClaim(...args: Parameters<typeof guardedSubmitClaim>) {
  return guardedSubmitClaim(...args);
}

export async function updateDraftClaim(...args: Parameters<typeof guardedUpdateDraftClaim>) {
  return guardedUpdateDraftClaim(...args);
}

export async function cancelClaim(...args: Parameters<typeof guardedCancelClaim>) {
  return guardedCancelClaim(...args);
}

export async function updateClaimStatus(...args: Parameters<typeof guardedUpdateClaimStatus>) {
  return guardedUpdateClaimStatus(...args);
}
