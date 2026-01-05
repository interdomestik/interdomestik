import { updateClaimStatusCore as updateClaimStatusCoreDomain } from '@interdomestik/domain-claims/claims/status';

import { logAuditEvent } from '@/lib/audit';
import { notifyStatusChanged } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { Session } from './context';

export async function updateClaimStatusCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  claimId: string;
  newStatus: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  // Rate limit: 10 per minute
  if (params.session?.user?.id) {
    const limit = await enforceRateLimitForAction({
      name: `action:claim-status:${params.session.user.id}`,
      limit: 10,
      windowSeconds: 60,
      headers: params.requestHeaders,
    });
    if (limit.limited) {
      return { success: false, error: 'Too many requests. Please wait a moment.' };
    }
  }

  const result = await updateClaimStatusCoreDomain(params, {
    logAuditEvent,
    notifyStatusChanged,
    revalidatePath,
  });

  if (result.error) {
    return { success: false, error: result.error };
  }
  return { success: true };
}
