import { updateClaimStatusCore as updateClaimStatusCoreDomain } from '@interdomestik/domain-claims/staff-claims/update-status';

import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import type { ActionResult, ClaimStatus } from './types';

import { enforceRateLimitForAction } from '@/lib/rate-limit';
// ...

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export async function updateClaimStatusCore(params: {
  claimId: string;
  newStatus: ClaimStatus;
  note?: string;
  isPublicChange?: boolean;
  session: NonNullable<Session> | null;
  requestHeaders?: Headers;
}): Promise<ActionResult> {
  const { session, requestHeaders } = params;

  if (session?.user?.id) {
    const limit = await enforceRateLimitForAction({
      name: `action:staff-update-status:${session.user.id}`,
      limit: 20,
      windowSeconds: 60,
      headers: requestHeaders || new Headers(), // Use passed headers or fallback
    });
    if (limit.limited) {
      return { success: false, error: 'Too many requests. Please wait a moment.' };
    }
  }

  const result = await updateClaimStatusCoreDomain(params, { logAuditEvent });

  if (result.success) {
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
  }

  return result;
}
