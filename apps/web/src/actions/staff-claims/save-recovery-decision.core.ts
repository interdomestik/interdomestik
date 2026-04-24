import { saveStaffRecoveryDecisionCore as saveRecoveryDecisionCoreDomain } from '@interdomestik/domain-claims';

import { logAuditEvent } from '@/lib/audit';
import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';
import { notifyRecoveryDecision } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import type { ActionResult, RecoveryDecisionSnapshot, SaveRecoveryDecisionInput } from './types';

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export async function saveRecoveryDecisionCore(
  params: SaveRecoveryDecisionInput & {
    idempotencyKey?: string;
    requestHeaders?: Headers;
    session: NonNullable<Session> | null;
  }
): Promise<ActionResult<RecoveryDecisionSnapshot>> {
  const requestFingerprint =
    params.decisionType === 'declined'
      ? {
          claimId: params.claimId,
          decisionType: params.decisionType,
          declineReasonCode: params.declineReasonCode,
          explanation: params.explanation,
        }
      : {
          claimId: params.claimId,
          decisionType: params.decisionType,
          explanation: params.explanation,
        };

  const result = await runCommercialActionWithIdempotency({
    action: 'staff-claims.save-recovery-decision',
    actorUserId: params.session?.user?.id ?? null,
    tenantId: params.session?.user?.tenantId ?? null,
    idempotencyKey: params.idempotencyKey,
    requestFingerprint,
    execute: () =>
      saveRecoveryDecisionCoreDomain(params, { logAuditEvent, notifyRecoveryDecision }),
  });

  if (result.success) {
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
    revalidatePathForAllLocales(`/member/claims/${params.claimId}`);
    revalidatePathForAllLocales('/member/claims');
  }

  return result;
}
