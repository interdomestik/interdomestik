import * as Sentry from '@sentry/nextjs';

import {
  ClaimValidationError,
  submitClaimCore as submitClaimCoreDomain,
} from '@interdomestik/domain-claims/claims/submit';
import type { CreateClaimValues } from '@interdomestik/domain-claims/validators/claims';

import { logAuditEvent } from '@/lib/audit';
import {
  emitClaimAiRunRequestedService,
  markClaimAiRunDispatchFailedService,
} from '@/lib/ai/claim-workflows';
import { COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORIES } from '@/lib/commercial-claim-categories';
import { notifyClaimSubmitted } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { Session } from './context';

type CommercialEscalationDecision = 'requested' | 'declined';
type CommercialEscalationReason = 'launch_scope_supported' | 'outside_launch_scope';

export type SubmitClaimCommercialFlow = {
  escalationRequest: {
    claimCategory: string;
    decision: CommercialEscalationDecision;
    decisionReason: CommercialEscalationReason;
  };
  freeStartCompletion: {
    claimCategory: string;
  };
};

export type SubmitClaimResult =
  | {
      success: true;
      claimId: string;
      commercialFlow: SubmitClaimCommercialFlow;
    }
  | { success: false; error: string; code?: string };

function resolveCommercialFlow(rawCategory: string): SubmitClaimCommercialFlow {
  const claimCategory = rawCategory.trim().toLowerCase();
  const escalationRequested = COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORIES.has(claimCategory);

  return {
    escalationRequest: {
      claimCategory,
      decision: escalationRequested ? 'requested' : 'declined',
      decisionReason: escalationRequested ? 'launch_scope_supported' : 'outside_launch_scope',
    },
    freeStartCompletion: {
      claimCategory,
    },
  };
}

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
    const result = await submitClaimCoreDomain(params, {
      dispatchClaimAiRun: emitClaimAiRunRequestedService,
      logAuditEvent,
      markClaimAiRunDispatchFailed: markClaimAiRunDispatchFailedService,
      notifyClaimSubmitted,
      revalidatePath,
    });
    if (result.success && typeof result.claimId === 'string') {
      return {
        success: true,
        claimId: result.claimId,
        commercialFlow: resolveCommercialFlow(params.data.category),
      };
    }
    return { success: false, error: 'Failed to submit, please try again.' };
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
