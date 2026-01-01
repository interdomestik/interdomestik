import { createClaimCore as createClaimCoreDomain } from '@interdomestik/domain-claims/claims/create';

import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimit } from '@/lib/rate-limit';

import type { Session } from './context';

export async function createClaimCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  formData: FormData;
}) {
  const rateLimit = await enforceRateLimit({
    name: 'action:claim-create',
    limit: 5,
    windowSeconds: 600, // 5 claims per 10 minutes
    headers: params.requestHeaders,
  });

  if (rateLimit) {
    return { error: 'Too many requests. Please try again later.' };
  }

  return createClaimCoreDomain(params, { logAuditEvent });
}
