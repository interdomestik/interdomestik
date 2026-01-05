import { updateClaimStatusCore as updateClaimStatusCoreDomain } from '@interdomestik/domain-claims/agent-claims/update-status';

import { logAuditEvent } from '@/lib/audit';
import { notifyStatusChanged } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

import { enforceRateLimitForAction } from '@/lib/rate-limit';
// ...

export async function updateClaimStatusCore(params: {
  claimId: string;
  newStatus: string;
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
}) {
  const { session, requestHeaders } = params;

  if (session?.user?.id) {
    const limit = await enforceRateLimitForAction({
      name: `action:agent-update-status:${session.user.id}`,
      limit: 10,
      windowSeconds: 60,
      headers: requestHeaders,
    });
    if (limit.limited) {
      throw new Error('Too many requests. Please wait a moment.');
    }
  }

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
