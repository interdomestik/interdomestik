import { updateSupportHandoffPublicResponseCore as updateDomainPublicResponse } from '@interdomestik/domain-claims/support-handoffs/response';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import { eachSupportHandoffActionLocale } from './request-locale';

function revalidatePathForAllLocales(path: string) {
  eachSupportHandoffActionLocale(locale => revalidatePath(`/${locale}${path}`));
}

function revalidateSupportHandoffPaths() {
  revalidatePathForAllLocales('/staff/support-handoffs');
}

function revalidateMemberHelpPaths() {
  revalidatePathForAllLocales('/member/help');
}

export async function updateSupportHandoffPublicResponseCore(params: {
  authority: TenantAuthority | null;
  expectedVersion?: number;
  handoffId: string;
  requestHeaders?: Headers;
  response: string;
  session: NonNullable<Session> | null;
}) {
  const result = await updateDomainPublicResponse(params, { logAuditEvent });

  if (result.success) {
    try {
      revalidateSupportHandoffPaths();
    } catch (error) {
      console.error('Staff handoff refresh failed after commit', error);
    }
    try {
      revalidateMemberHelpPaths();
    } catch (error) {
      console.error('Member handoff refresh failed after commit', error);
    }
  }

  return result;
}
