import * as Sentry from '@sentry/nextjs';

import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { ActionError, ActionSuccess } from '@/lib/safe-action';
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
  requestHeaders: Headers;
  data: SubmitFreeStartIntakeInput;
}): Promise<SubmitFreeStartIntakeResult> {
  try {
    const limit = await enforceRateLimitForAction({
      name: 'action:submit-free-start-intake',
      limit: 10,
      windowSeconds: 600,
      headers: params.requestHeaders,
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
