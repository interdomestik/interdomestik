import { saveStaffRecoveryDecisionCore as saveRecoveryDecisionCoreDomain } from '@interdomestik/domain-claims';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

import { logAuditEvent } from '@/lib/audit';
import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';
import { kickClaimNotificationDeliveries } from '@/lib/claim-notification-delivery-kick';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import type { ActionResult, RecoveryDecisionSnapshot, SaveRecoveryDecisionInput } from './types';

const LOCALES = ['sq', 'en', 'sr', 'mk', 'de'] as const;

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export async function saveRecoveryDecisionCore(
  params: SaveRecoveryDecisionInput & {
    idempotencyKey?: string;
    authority: TenantAuthority | null;
    requestHeaders?: Headers;
    session: NonNullable<Session> | null;
  }
): Promise<ActionResult<RecoveryDecisionSnapshot>> {
  if (params.session?.user?.role !== 'staff' || !params.authority) {
    return { success: false, error: 'Unauthorized' };
  }

  const { authority } = params;
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
    scope: {
      kind: 'tenant',
      actorUserId: params.session?.user?.id ?? null,
      authority,
    },
    idempotencyKey: params.idempotencyKey,
    requestFingerprint,
    execute: async () => {
      const { deliveryIds, ...outcome } = await saveRecoveryDecisionCoreDomain(params, {
        logAuditEvent,
      });
      if (outcome.success) await kickClaimNotificationDeliveries(authority, deliveryIds ?? []);
      return outcome;
    },
  });

  if (result.success) {
    try {
      revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
      revalidatePathForAllLocales('/staff/claims');
      revalidatePathForAllLocales(`/member/claims/${params.claimId}`);
      revalidatePathForAllLocales('/member/claims');
    } catch (error) {
      console.error('Recovery decision refresh failed after commit', error);
    }
  }

  return result;
}
