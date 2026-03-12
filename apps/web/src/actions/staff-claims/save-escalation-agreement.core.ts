import { saveClaimEscalationAgreementCore as saveClaimEscalationAgreementCoreDomain } from '@interdomestik/domain-claims/staff-claims/save-escalation-agreement';

import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import type {
  ActionResult,
  ClaimEscalationAgreementSnapshot,
  SaveClaimEscalationAgreementInput,
} from './types';

export async function saveClaimEscalationAgreementCore(
  params: SaveClaimEscalationAgreementInput & {
    session: NonNullable<Session> | null;
  }
): Promise<ActionResult<ClaimEscalationAgreementSnapshot>> {
  const result = await saveClaimEscalationAgreementCoreDomain(params);

  if (result.success) {
    revalidatePath(`/staff/claims/${params.claimId}`);
    revalidatePath('/staff/claims');
  }

  return result;
}
