import {
  resolveRecoveryDecisionActor,
  saveRecoveryDecisionSchema,
  saveStaffRecoveryDecisionCore as saveRecoveryDecisionCoreDomain,
} from '@interdomestik/domain-claims';

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
  const { authority, session, idempotencyKey, requestHeaders, ...input } = params;
  const actor = resolveRecoveryDecisionActor(authority, session);
  if (!authority || !actor) {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = saveRecoveryDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid recovery decision',
    };
  }
  const { claimId } = parsed.data;

  const result = await runCommercialActionWithIdempotency({
    action: 'staff-claims.save-recovery-decision',
    scope: {
      kind: 'tenant',
      actorUserId: actor.id,
      authority,
    },
    idempotencyKey,
    requestFingerprint: { ...input, explanation: input.explanation },
    execute: async () => {
      const { deliveryIds, ...outcome } = await saveRecoveryDecisionCoreDomain(
        { ...parsed.data, authority, requestHeaders, session },
        { logAuditEvent }
      );
      if (outcome.success) await kickClaimNotificationDeliveries(authority, deliveryIds ?? []);
      return outcome;
    },
  });

  if (result.success) {
    try {
      revalidatePathForAllLocales(`/staff/claims/${claimId}`);
      revalidatePathForAllLocales('/staff/claims');
      revalidatePathForAllLocales(`/member/claims/${claimId}`);
      revalidatePathForAllLocales('/member/claims');
    } catch (error) {
      console.error('Recovery decision refresh failed after commit', error);
    }
  }

  return result;
}
