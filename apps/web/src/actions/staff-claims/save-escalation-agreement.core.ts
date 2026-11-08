import { saveClaimEscalationAgreementCore as saveClaimEscalationAgreementCoreDomain } from '@interdomestik/domain-claims/staff-claims/save-escalation-agreement';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

import { logAuditEvent } from '@/lib/audit';
import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';
import type {
  ActionResult,
  ClaimEscalationAgreementSnapshot,
  SaveClaimEscalationAgreementInput,
} from './types';

const LOCALES = ['sq', 'en', 'sr', 'mk', 'de'] as const;

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export async function saveClaimEscalationAgreementCore(
  params: SaveClaimEscalationAgreementInput & {
    idempotencyKey?: string;
    authority: TenantAuthority | null;
    requestHeaders?: Headers;
    session: NonNullable<Session> | null;
  }
): Promise<ActionResult<ClaimEscalationAgreementSnapshot>> {
  if (params.session?.user?.role !== 'staff' || !params.authority) {
    return { success: false, error: 'Unauthorized' };
  }

  const result = await runCommercialActionWithIdempotency({
    action: 'staff-claims.save-escalation-agreement',
    scope: {
      kind: 'tenant',
      actorUserId: params.session?.user?.id ?? null,
      authority: params.authority,
    },
    idempotencyKey: params.idempotencyKey,
    requestFingerprint: {
      claimId: params.claimId,
      decisionNextStatus: params.decisionNextStatus,
      decisionReason: params.decisionReason,
      feePercentage: params.feePercentage,
      legalActionCapPercentage: params.legalActionCapPercentage,
      minimumFee: params.minimumFee,
      paymentAuthorizationState: params.paymentAuthorizationState,
      termsVersion: params.termsVersion,
    },
    execute: () => saveClaimEscalationAgreementCoreDomain(params, { logAuditEvent }),
  });

  if (result.success) {
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
  }

  return result;
}
