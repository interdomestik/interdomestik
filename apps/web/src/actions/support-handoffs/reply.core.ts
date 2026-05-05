import { submitSupportHandoffMemberReplyCore as submitDomainMemberReply } from '@interdomestik/domain-claims/support-handoffs/reply';

import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import {
  resolveSupportHandoffActionLocale,
  type SupportHandoffActionLocale,
} from './request-locale';

function revalidateSupportHandoffReplyPaths(locale: SupportHandoffActionLocale) {
  revalidatePath(`/${locale}/member/help`);
  revalidatePath(`/${locale}/staff/support-handoffs`);
}

function shouldRevalidateReplyResult(result: Awaited<ReturnType<typeof submitDomainMemberReply>>) {
  return result.success;
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
    revalidateSupportHandoffReplyPaths(resolveSupportHandoffActionLocale(params.requestHeaders));
  }

  return result;
}
