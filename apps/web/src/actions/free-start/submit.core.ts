import * as Sentry from '@sentry/nextjs';

import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { ActionError, ActionSuccess } from '@/lib/safe-action';
import { resolveTenantIdFromSources } from '@/lib/tenant/tenant-hosts';
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

/**
 * Technical reservation partition only. Mirrors the server tenant-request host contract
 * (`x-forwarded-host ?? host ?? ''`; an empty forwarded host does not fall back) and never
 * reads cookie, x-tenant-id, query or client country hints. It grants no access, legal,
 * booking, identity or membership authority.
 *
 * The resolved tenant is projected onto the canonical tenants provisioned by migration0008: tenant_mk stays tenant_mk and every other value, including tenant_ks, tenant_al,
 * pilot-mk or any future alias, shares the tenant_ks technical partition. This keeps the
 * reservation tenant FK satisfiable without probing tenants; it does not imply AL/pilot to KS
 * user, access, legal, country or booking identity.
 */
function resolveReservationTenantId(requestHeaders: Headers): 'tenant_ks' | 'tenant_mk' {
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? '';
  const tenantId = resolveTenantIdFromSources({ host }, { productionSensitive: true });
  return tenantId === 'tenant_mk' ? 'tenant_mk' : 'tenant_ks';
}

export async function submitFreeStartIntakeCore(params: {
  idempotencyKey?: string;
  requestHeaders: Headers;
  data: SubmitFreeStartIntakeInput;
}): Promise<SubmitFreeStartIntakeResult> {
  try {
    return await runCommercialActionWithIdempotency({
      action: 'free-start.submit',
      scope: {
        kind: 'tenant',
        tenantId: resolveReservationTenantId(params.requestHeaders),
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
