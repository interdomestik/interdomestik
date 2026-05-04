import { updateSupportHandoffPublicResponseCore as updateDomainPublicResponse } from '@interdomestik/domain-claims/support-handoffs/response';

import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

function revalidateSupportHandoffPaths() {
  revalidatePathForAllLocales('/staff/support-handoffs');
}

function revalidateMemberHelpPaths() {
  revalidatePathForAllLocales('/member/help');
}

export async function updateSupportHandoffPublicResponseCore(params: {
  expectedVersion?: number;
  handoffId: string;
  requestHeaders?: Headers;
  response: string;
  session: NonNullable<Session> | null;
}) {
  const result = await updateDomainPublicResponse(params, { logAuditEvent });

  if (result.success) {
    revalidateSupportHandoffPaths();
    revalidateMemberHelpPaths();
  }

  return result;
}
