import { claimEscalationAgreements, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

import type { PaymentAuthorizationState } from '../staff-claims/types';

const paymentGatedStatuses = new Set<string>(['negotiation', 'court']);

export async function getPaymentAuthorizationState(params: {
  claimId: string;
  status: string;
  tenantId: string;
}): Promise<PaymentAuthorizationState | null | undefined> {
  if (!paymentGatedStatuses.has(params.status)) {
    return undefined;
  }

  const [agreement] = await db
    .select({
      paymentAuthorizationState: claimEscalationAgreements.paymentAuthorizationState,
    })
    .from(claimEscalationAgreements)
    .where(
      withTenant(
        params.tenantId,
        claimEscalationAgreements.tenantId,
        eq(claimEscalationAgreements.claimId, params.claimId)
      )
    )
    .limit(1);

  return agreement?.paymentAuthorizationState ?? null;
}
