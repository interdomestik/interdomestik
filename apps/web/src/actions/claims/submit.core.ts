import { submitClaimCore as submitClaimCoreDomain } from '@interdomestik/domain-claims/claims/submit';
import type { CreateClaimValues } from '@interdomestik/domain-claims/validators/claims';

import { logAuditEvent } from '@/lib/audit';
import { notifyClaimSubmitted } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

export async function submitClaimCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  data: CreateClaimValues;
}) {
  return submitClaimCoreDomain(params, {
    logAuditEvent,
    notifyClaimSubmitted,
    revalidatePath,
  });
}
