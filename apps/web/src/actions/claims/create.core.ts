import { createClaimCore as createClaimCoreDomain } from '@interdomestik/domain-claims/claims/create';

import { logAuditEvent } from '@/lib/audit';

import type { Session } from './context';

export async function createClaimCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  formData: FormData;
}) {
  return createClaimCoreDomain(params, { logAuditEvent });
}
