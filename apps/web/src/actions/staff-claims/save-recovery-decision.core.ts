import { saveRecoveryDecisionCore as saveRecoveryDecisionCoreDomain } from '@interdomestik/domain-claims/staff-claims/save-recovery-decision';

import { logAuditEvent } from '@/lib/audit';
import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';
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
  const result = await runCommercialActionWithIdempotency({
    action: 'staff-claims.save-recovery-decision',
    actorUserId: params.session?.user?.id ?? null,
    tenantId: params.session?.user?.tenantId ?? null,
    idempotencyKey: params.idempotencyKey,
    requestFingerprint: params,
    execute: () => saveRecoveryDecisionCoreDomain(params, { logAuditEvent }),
  });

  if (result.success) {
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
    revalidatePathForAllLocales(`/member/claims/${params.claimId}`);
    revalidatePathForAllLocales('/member/claims');
  }

  return result;
}
