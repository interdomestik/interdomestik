import { acknowledgeSupportHandoffPublicResponseCore as acknowledgeDomainPublicResponse } from '@interdomestik/domain-claims/support-handoffs/acknowledgement';

import { logSupportHandoffAuditEvent as logAuditEvent } from './audit';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import {
  resolveSupportHandoffActionLocale,
  type SupportHandoffActionLocale,
} from './request-locale';

function revalidateSupportHandoffAcknowledgementPaths(locale: SupportHandoffActionLocale) {
  revalidatePath(`/${locale}/member/help`);
  revalidatePath(`/${locale}/staff/support-handoffs`);
}

function shouldRevalidateAcknowledgementResult(
  result: Awaited<ReturnType<typeof acknowledgeDomainPublicResponse>>
) {
  return result.success || result.code === 'STALE_VERSION' || result.code === 'CLOSED';
}

export async function acknowledgeSupportHandoffPublicResponseCore(params: {
  expectedPublicResponseVersion: number;
  handoffId: string;
  requestHeaders?: Headers;
  session: NonNullable<Session> | null;
}) {
  const result = await acknowledgeDomainPublicResponse(params, {
    logAuditEvent,
  });

  if (shouldRevalidateAcknowledgementResult(result)) {
    revalidateSupportHandoffAcknowledgementPaths(
      resolveSupportHandoffActionLocale(params.requestHeaders)
    );
  }

  return result;
}
