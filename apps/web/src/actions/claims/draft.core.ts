import {
  cancelClaimCore as cancelClaimCoreDomain,
  updateDraftClaimCore as updateDraftClaimCoreDomain,
} from '@interdomestik/domain-claims/claims/draft';
import type { CreateClaimValues } from '@interdomestik/domain-claims/validators/claims';

import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

export async function updateDraftClaimCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  claimId: string;
  data: CreateClaimValues;
}) {
  return updateDraftClaimCoreDomain(params, {
    logAuditEvent,
    revalidatePath,
  });
}

export async function cancelClaimCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  claimId: string;
}) {
  return cancelClaimCoreDomain(params, {
    logAuditEvent,
    revalidatePath,
  });
}
