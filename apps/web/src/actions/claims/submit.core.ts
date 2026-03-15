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
import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';
import {
  resolveCommercialLaunchScope,
  type CommercialEscalationReason,
} from '@/lib/commercial-claim-categories';
import { notifyClaimSubmitted } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { Session } from './context';

type CommercialEscalationDecision = 'requested' | 'declined';

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
  const launchScope = resolveCommercialLaunchScope(rawCategory);
  const claimCategory = launchScope.claimCategory ?? rawCategory.trim().toLowerCase();

  return {
    escalationRequest: {
      claimCategory,
      decision: launchScope.escalationEligible ? 'requested' : 'declined',
      decisionReason: launchScope.decisionReason,
    },
    freeStartCompletion: {
      claimCategory,
    },
  };
}

export async function submitClaimCore(params: {
  idempotencyKey?: string;
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
  }

  return runCommercialActionWithIdempotency({
    action: 'claims.submit',
    actorUserId: session?.user?.id ?? null,
    tenantId: session?.user?.tenantId ?? null,
    idempotencyKey: params.idempotencyKey,
    requestFingerprint: params.data,
    execute: async () => {
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
        if (error instanceof ClaimValidationError) {
          return { success: false, error: error.message, code: error.code };
        }

        Sentry.captureException(error, {
          tags: sentryContext,
          extra: { claimData: { category: params.data.category } },
        });

        throw error;
      }
    },
  });
}
