'use server';

import { getActionContext } from './context';
import {
  acknowledgeInformationRequestEvidenceInput,
  acknowledgeInformationRequestEvidence,
  createInformationRequest,
  informationRequestInput,
} from '@interdomestik/domain-claims';
import { revalidatePath } from 'next/cache';

function revalidateInformationRequestPaths(claimId: string) {
  for (const locale of ['sq', 'en', 'sr', 'mk']) {
    revalidatePath(`/${locale}/staff/claims/${claimId}`);
    revalidatePath(`/${locale}/member/claims/${claimId}`);
  }
}

export async function createClaimInformationRequest(input: unknown) {
  const { session } = await getActionContext();
  const parsed = informationRequestInput.safeParse(input);
  const result = await createInformationRequest(session, input);
  if (result.success && parsed.success) {
    revalidateInformationRequestPaths(parsed.data.claimId);
  }
  return result;
}

export async function acknowledgeClaimInformationRequestEvidence(input: unknown) {
  const { session } = await getActionContext();
  const parsed = acknowledgeInformationRequestEvidenceInput.safeParse(input);
  const result = await acknowledgeInformationRequestEvidence(session, input);
  if (result.success && parsed.success) {
    revalidateInformationRequestPaths(parsed.data.claimId);
  }
  return result;
}
