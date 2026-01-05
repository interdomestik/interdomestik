import {
  ClaimValidationError,
  submitClaimCore as submitClaimCoreDomain,
} from '@interdomestik/domain-claims/claims/submit';
import type { CreateClaimValues } from '@interdomestik/domain-claims/validators/claims';

import { logAuditEvent } from '@/lib/audit';
import { notifyClaimSubmitted } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { Session } from './context';

export type SubmitClaimResult =
  | { success: true }
  | { success: false; error: string; code?: string };

export async function submitClaimCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  data: CreateClaimValues;
}): Promise<SubmitClaimResult> {
  const { session, requestHeaders } = params;

  if (session?.user?.id) {
    const limit = await enforceRateLimitForAction({
      name: `action:submit-claim:${session.user.id}`,
      limit: 1,
      windowSeconds: 10,
      headers: requestHeaders,
    });
    if (limit.limited) {
      return { success: false, error: 'Too many requests. Please wait a moment.' };
    }
  }
  try {
    await submitClaimCoreDomain(params, {
      logAuditEvent,
      notifyClaimSubmitted,
      revalidatePath,
    });
    // Explicitly return success result
    return { success: true };
  } catch (error) {
    // Map ClaimValidationError to proper 400/403 response
    if (error instanceof ClaimValidationError) {
      return { success: false, error: error.message, code: error.code };
    }
    // Re-throw unexpected errors
    throw error;
  }
}
