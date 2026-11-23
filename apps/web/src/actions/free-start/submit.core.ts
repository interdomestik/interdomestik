import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { getTranslations } from 'next-intl/server';

import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { ActionError, ActionSuccess } from '@/lib/safe-action';
import { resolvePublicAdmissionTenant } from '@/lib/tenant/public-admission-tenant';
import { authorizeOpenPublicIntake } from '@/lib/tenant/public-intake-admission';
import {
  submitFreeStartIntakeSchema,
  type SubmitFreeStartIntakeInput,
} from '@/lib/validators/free-start';

export type SubmitFreeStartIntakePayload = {
  claimCategory: string;
  desiredOutcome: string;
  intakeIssue: string;
};

export type SubmitFreeStartIntakeResult = ActionSuccess<SubmitFreeStartIntakePayload> | ActionError;

function formatFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(fieldErrors)
      .filter(([, value]) => Boolean(value?.[0]))
      .map(([key, value]) => [key, value?.[0] ?? 'Invalid input'])
  );
}

export async function submitFreeStartIntakeCore(params: {
  idempotencyKey?: string;
  requestHeaders: Headers;
  data: SubmitFreeStartIntakeInput;
}): Promise<SubmitFreeStartIntakeResult> {
  const tenantId = resolvePublicAdmissionTenant(params.requestHeaders);
  let authority: Awaited<ReturnType<typeof authorizeOpenPublicIntake>> = null;
  if (tenantId === 'tenant_ks' || tenantId === 'tenant_mk') {
    authority = await authorizeOpenPublicIntake(tenantId);
  }
  if (!authority) {
    const t = await getTranslations('freeStart');
    return { success: false, code: 'CLOSED', error: t('CLOSED') };
  }

  try {
    return await runCommercialActionWithIdempotency({
      action: 'free-start.submit',
      scope: {
        kind: 'tenant',
        authority,
        actorUserId: null,
      },
      idempotencyKey: params.idempotencyKey,
      requestFingerprint: params.data,
      execute: async () => {
        const limit = await enforceRateLimitForAction({
          name: 'action:submit-free-start-intake',
          limit: 10,
          windowSeconds: 600,
          headers: params.requestHeaders,
          productionSensitive: true,
        });

        if (limit.limited) {
          return {
            success: false,
            error: 'Too many requests. Please try again later.',
            code: 'RATE_LIMITED',
          };
        }

        const parsed = submitFreeStartIntakeSchema.safeParse(params.data);

        if (!parsed.success) {
          return {
            success: false,
            error: 'Validation failed',
            code: 'INVALID_PAYLOAD',
            issues: formatFieldErrors(parsed.error.flatten().fieldErrors),
          };
        }

        return {
          success: true,
          data: {
            claimCategory: parsed.data.category,
            desiredOutcome: parsed.data.desiredOutcome,
            intakeIssue: parsed.data.issueType,
          },
        };
      },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        action: 'submitFreeStartIntake',
        feature: 'free-start',
      },
    });

    return {
      success: false,
      error: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
    };
  }
}
