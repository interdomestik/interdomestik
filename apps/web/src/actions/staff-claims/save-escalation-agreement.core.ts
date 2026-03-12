import { saveClaimEscalationAgreementCore as saveClaimEscalationAgreementCoreDomain } from '@interdomestik/domain-claims/staff-claims/save-escalation-agreement';

import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import type {
  ActionResult,
  ClaimEscalationAgreementSnapshot,
  SaveClaimEscalationAgreementInput,
} from './types';

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export async function saveClaimEscalationAgreementCore(
  params: SaveClaimEscalationAgreementInput & {
    session: NonNullable<Session> | null;
  }
): Promise<ActionResult<ClaimEscalationAgreementSnapshot>> {
  const result = await saveClaimEscalationAgreementCoreDomain(params);

  if (result.success) {
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
  }

  return result;
}
