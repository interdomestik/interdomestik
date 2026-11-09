import { assignClaimCore as assignClaimCoreDomain } from '@interdomestik/domain-claims/staff-claims/assign';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

import { revalidatePath } from 'next/cache';

import type { Session } from './context';

const LOCALES = ['sq', 'en', 'sr', 'mk', 'de'] as const;

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export async function assignClaimCore(params: {
  authority: TenantAuthority | null;
  claimId: string;
  session: NonNullable<Session> | null;
  requestHeaders?: Headers;
  staffId?: string | null;
}) {
  const result = await assignClaimCoreDomain(params);

  if (result.success) {
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
  }

  return result;
}
