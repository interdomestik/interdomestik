import { assignClaimCore as assignClaimCoreDomain } from '@interdomestik/domain-claims/staff-claims/assign';

import { revalidatePath } from 'next/cache';

import type { Session } from './context';

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export async function assignClaimCore(params: {
  claimId: string;
  session: NonNullable<Session> | null;
}) {
  const result = await assignClaimCoreDomain(params);

  if (result.success) {
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
  }

  return result;
}
