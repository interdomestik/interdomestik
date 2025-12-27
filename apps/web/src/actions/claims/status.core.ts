import { updateClaimStatusCore as updateClaimStatusCoreDomain } from '@interdomestik/domain-claims/claims/status';

import { logAuditEvent } from '@/lib/audit';
import { notifyStatusChanged } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

export async function updateClaimStatusCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  claimId: string;
  newStatus: string;
}) {
  return updateClaimStatusCoreDomain(params, {
    logAuditEvent,
    notifyStatusChanged,
    revalidatePath,
  });
}
