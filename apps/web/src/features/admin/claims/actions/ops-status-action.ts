import { LOCALES } from '@/i18n/locales';
import {
  claimStatusActionFailure,
  completeClaimStatusEffects,
} from '@/lib/claim-status-action-effects';
import { defineAction } from '@/lib/safe-action';
import { resolveEntryHostIdFromHeaders } from '@/lib/tenant/host-id';
import type { ClaimStatus } from '@interdomestik/database/constants';
import {
  changeClaimStatus,
  changeClaimStatusInputSchema,
} from '@interdomestik/domain-claims/claims/change-status';
import type { RecoveryDeclineReasonCode } from '@interdomestik/domain-claims/staff-claims/types';
import { z } from 'zod';
import { type OpsActionResponse, revalidateClaim } from './action-helpers';
import { completeCommittedOpsAction, toSafeOpsActionError } from './ops-action-outcome';

export type OpsStatusOptions = {
  note?: string;
  declineReasonCode?: RecoveryDeclineReasonCode;
  decisionExplanation?: string;
};

const updateStatusCommand = defineAction({
  name: 'adminClaims.updateStatus',
  basis: { kind: 'role', roles: ['admin', 'tenant_admin', 'super_admin'] },
  input: changeClaimStatusInputSchema
    .omit({ isPublicNote: true, allowanceOverrideReason: true })
    .extend({ locale: z.enum(LOCALES) })
    .strict(),
  subject: { type: 'claim', from: 'claimId' },
  async handler({ locale, ...input }, { authority, requestHeaders }) {
    const outcome = await changeClaimStatus(authority, input, {
      hostId: resolveEntryHostIdFromHeaders(requestHeaders),
      requestHeaders,
    });
    if (!outcome.ok) return claimStatusActionFailure(outcome.code);

    await completeClaimStatusEffects(authority, outcome);
    return completeCommittedOpsAction('updateStatus', () => revalidateClaim(locale, input.claimId));
  },
});

export async function updateStatusAction(
  claimId: string,
  toStatus: ClaimStatus,
  locale: string,
  options: OpsStatusOptions = {}
): Promise<OpsActionResponse> {
  try {
    const result = await updateStatusCommand({ ...options, claimId, toStatus, locale });
    if (result.success) return result.data ?? result;
    if (result.code === 'INTERNAL_SERVER_ERROR') {
      return toSafeOpsActionError('updateStatus', new Error(result.code));
    }
    return result;
  } catch (error) {
    return toSafeOpsActionError('updateStatus', error);
  }
}
