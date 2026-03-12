import { saveSuccessFeeCollectionCore as saveSuccessFeeCollectionCoreDomain } from '@interdomestik/domain-claims/staff-claims/save-success-fee-collection';

import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import type {
  ActionResult,
  SaveSuccessFeeCollectionInput,
  SuccessFeeCollectionSnapshot,
} from './types';

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export async function saveSuccessFeeCollectionCore(
  params: SaveSuccessFeeCollectionInput & {
    requestHeaders?: Headers;
    session: NonNullable<Session> | null;
  }
): Promise<ActionResult<SuccessFeeCollectionSnapshot>> {
  const result = await saveSuccessFeeCollectionCoreDomain(params, { logAuditEvent });

  if (result.success) {
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
  }

  return result;
}
