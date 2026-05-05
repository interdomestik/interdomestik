import { submitSupportHandoffMemberReplyCore as submitDomainMemberReply } from '@interdomestik/domain-claims/support-handoffs/reply';

import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import { eachSupportHandoffActionLocale } from './request-locale';

function revalidatePathForAllLocales(path: string) {
  eachSupportHandoffActionLocale(locale => revalidatePath(`/${locale}${path}`));
}

function revalidateSupportHandoffReplyPaths() {
  revalidatePathForAllLocales('/member/help');
  revalidatePathForAllLocales('/staff/support-handoffs');
}

function shouldRevalidateReplyResult(result: Awaited<ReturnType<typeof submitDomainMemberReply>>) {
  return result.success || (result.code != null && result.code !== 'UNAUTHORIZED');
}

export async function submitSupportHandoffMemberReplyCore(params: {
  expectedPublicResponseVersion: number;
  handoffId: string;
  replyText: string;
  requestHeaders?: Headers;
  session: NonNullable<Session> | null;
}) {
  const result = await submitDomainMemberReply(params, { logAuditEvent });

  if (shouldRevalidateReplyResult(result)) {
    revalidateSupportHandoffReplyPaths();
  }

  return result;
}
