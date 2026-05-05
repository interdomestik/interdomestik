import {
  acceptSupportHandoffCore as acceptDomainSupportHandoff,
  closeSupportHandoffCore as closeDomainSupportHandoff,
  reassignSupportHandoffCore as reassignDomainSupportHandoff,
} from '@interdomestik/domain-claims/support-handoffs/lifecycle';

import { logAuditEvent } from '@/lib/audit';
import { clearSupportHandoffPublicResponseNotifications } from '@/lib/notifications';
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

export async function acceptSupportHandoffCore(params: {
  expectedVersion?: number;
  handoffId: string;
  requestHeaders?: Headers;
  session: NonNullable<Session> | null;
}) {
  const result = await acceptDomainSupportHandoff(params, { logAuditEvent });

  if (result.success) {
    revalidateSupportHandoffPaths();
  }

  return result;
}

export async function reassignSupportHandoffCore(params: {
  expectedVersion?: number;
  handoffId: string;
  nextStaffId: string;
  reason: string;
  requestHeaders?: Headers;
  session: NonNullable<Session> | null;
}) {
  const result = await reassignDomainSupportHandoff(params, { logAuditEvent });

  if (result.success) {
    revalidateSupportHandoffPaths();
  }

  return result;
}

export async function closeSupportHandoffCore(params: {
  expectedVersion?: number;
  handoffId: string;
  reason: string;
  requestHeaders?: Headers;
  session: NonNullable<Session> | null;
}) {
  const result = await closeDomainSupportHandoff(params, { logAuditEvent });

  if (result.success) {
    try {
      const notificationResult = await clearSupportHandoffPublicResponseNotifications(
        result.data.memberId,
        { id: result.data.handoffId },
        { tenantId: result.data.tenantId }
      );

      if (!notificationResult.success) {
        console.error('Failed to clear support handoff public response notifications:', {
          error: notificationResult.error,
          handoffId: result.data.handoffId,
        });
      }
    } catch (error) {
      console.error('Failed to clear support handoff public response notifications:', {
        error,
        handoffId: result.data.handoffId,
      });
    }

    revalidateSupportHandoffPaths();
    revalidateMemberHelpPaths();
  }

  return result;
}
