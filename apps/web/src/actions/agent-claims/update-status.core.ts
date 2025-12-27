import { updateClaimStatusCore as updateClaimStatusCoreDomain } from '@interdomestik/domain-claims/agent-claims/update-status';

import { logAuditEvent } from '@/lib/audit';
import { notifyStatusChanged } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

export async function updateClaimStatusCore(params: {
  claimId: string;
  newStatus: string;
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
}) {
  await updateClaimStatusCoreDomain(params, {
    logAuditEvent,
    notifyStatusChanged,
  });

  revalidatePath('/member/claims');
  revalidatePath(`/member/claims/${params.claimId}`);
  revalidatePath('/staff/claims');
  revalidatePath(`/staff/claims/${params.claimId}`);
  revalidatePath('/member/claims');
  revalidatePath(`/member/claims/${params.claimId}`);
}
