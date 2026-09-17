'use server';

import { getActionContext } from './context';
import { createInformationRequest } from '@interdomestik/domain-claims';
import { revalidatePath } from 'next/cache';

export async function createClaimInformationRequest(input: unknown) {
  const { session } = await getActionContext();
  const result = await createInformationRequest(session, input);
  if (result.success) {
    const claimId = (input as { claimId: string }).claimId;
    for (const locale of ['sq', 'en', 'sr', 'mk']) {
      revalidatePath(`/${locale}/staff/claims/${claimId}`);
      revalidatePath(`/${locale}/member/claims/${claimId}`);
    }
  }
  return result;
}
