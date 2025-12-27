import { assignClaimCore as assignClaimCoreDomain } from '@interdomestik/domain-claims/staff-claims/assign';

import { revalidatePath } from 'next/cache';

import type { Session } from './context';

export async function assignClaimCore(params: {
  claimId: string;
  session: NonNullable<Session> | null;
}) {
  const result = await assignClaimCoreDomain(params);

  if (result.success) {
    revalidatePath(`/staff/claims/${params.claimId}`);
    revalidatePath('/staff/claims');
  }

  return result;
}
