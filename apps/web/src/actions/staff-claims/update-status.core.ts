import { ROLES } from '@interdomestik/shared-auth';
import {
  claimStatusActionFailure,
  completeClaimStatusEffects,
} from '@/lib/claim-status-action-effects';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import { actionFailure, defineAction } from '@/lib/safe-action';
import { resolveEntryHostIdFromHeaders } from '@/lib/tenant/host-id';
import { LOCALES } from '@/i18n/locales';
import {
  changeClaimStatus,
  changeClaimStatusInputSchema,
} from '@interdomestik/domain-claims/claims/change-status';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export const updateClaimStatusCore = defineAction({
  name: 'staffClaims.updateStatus',
  basis: { kind: 'role', roles: [ROLES.staff] },
  input: changeClaimStatusInputSchema.extend({ isPublicNote: z.boolean().optional() }).strict(),
  subject: { type: 'claim', from: 'claimId' },
  async handler(input, { authority, requestHeaders, session }) {
    const limit = await enforceRateLimitForAction({
      name: `action:staff-update-status:${session.user.id}`,
      limit: 20,
      windowSeconds: 60,
      headers: requestHeaders,
      productionSensitive: true,
    });
    if (limit.limited) return actionFailure('RATE_LIMITED');

    const outcome = await changeClaimStatus(authority, input, {
      hostId: resolveEntryHostIdFromHeaders(requestHeaders),
      requestHeaders,
    });
    if (!outcome.ok) return claimStatusActionFailure(outcome.code);

    await completeClaimStatusEffects(authority, outcome);
    try {
      for (const locale of LOCALES) {
        revalidatePath(`/${locale}/staff/claims/${input.claimId}`);
        revalidatePath(`/${locale}/staff/claims`);
        revalidatePath(`/${locale}/member/claims/${input.claimId}`);
        revalidatePath(`/${locale}/member/claims`);
      }
    } catch (error) {
      console.error('Staff claim refresh failed after commit', error);
    }
  },
});
