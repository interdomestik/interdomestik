import * as Sentry from '@sentry/nextjs';

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

  // Context for Sentry (populated incrementally)
  const sentryContext: Record<string, string> = {
    feature: 'claims',
    action: 'submitClaim',
  };

  if (session?.user?.id) {
    sentryContext.userId = session.user.id;
    sentryContext.tenantId = session.user.tenantId ?? 'unknown';

    const limit = await enforceRateLimitForAction({
      name: `action:submit-claim:${session.user.id}`,
      limit: 1,
      windowSeconds: 10,
      headers: requestHeaders,
    });
    if (limit.limited) {
      // Expected rate limit - do NOT send to Sentry
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
    // Expected validation - do NOT send to Sentry
    if (error instanceof ClaimValidationError) {
      return { success: false, error: error.message, code: error.code };
    }

    // Capture unexpected errors with full context
    Sentry.captureException(error, {
      tags: sentryContext,
      extra: { claimData: { category: params.data.category } },
    });

    // Re-throw unexpected errors
    throw error;
  }
}
