import { getOAuthState } from 'better-auth/api';

import {
  assertNoAuthorityFields,
  AUTHORITY_INTENT_KEY,
  invalidOnboardingError,
  recordValue,
} from './authority-fields';
import { revalidateOnboardingIntent, type OnboardingIntent } from './onboarding-authority';

function contextPath(context: unknown): string {
  const record = recordValue(context);
  return typeof record?.path === 'string' ? record.path : '';
}

function contextHeaders(context: unknown): Headers {
  const record = recordValue(context);
  if (record?.headers instanceof Headers) return record.headers;
  const request = record?.request;
  return request instanceof Request ? request.headers : new Headers();
}

async function requestIntent(context: unknown): Promise<unknown> {
  const record = recordValue(context);
  const body = recordValue(record?.body);
  if (contextPath(context).startsWith('/callback/')) {
    return recordValue(await getOAuthState())?.[AUTHORITY_INTENT_KEY];
  }
  if (body && AUTHORITY_INTENT_KEY in body) return body[AUTHORITY_INTENT_KEY];
  return recordValue(body?.additionalData)?.[AUTHORITY_INTENT_KEY];
}

async function canonicalIntent(context: unknown): Promise<OnboardingIntent> {
  const intent = revalidateOnboardingIntent(await requestIntent(context), contextHeaders(context));
  if (!intent) throw invalidOnboardingError();
  return intent;
}

export async function assignUserAuthorityBeforeCreate(
  user: Record<string, unknown>,
  context: unknown
): Promise<{ data: Record<string, unknown> }> {
  const intent = await canonicalIntent(context);
  return {
    data: {
      ...user,
      role: 'member',
      tenantId: intent.tenant,
      branchId: null,
      memberNumber: null,
      tenantClassificationPending: intent.mode === 'deferred',
      agentId: null,
      referralCode: null,
    },
  };
}

export function assertUserAuthorityUpdateBefore(data: unknown): void {
  assertNoAuthorityFields(data);
}
