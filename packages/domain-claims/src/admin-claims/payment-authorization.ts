import { claimEscalationAgreements, eq } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';

import type { PaymentAuthorizationState } from '../staff-claims/types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

const paymentGatedStatuses = new Set<string>(['negotiation', 'court']);

export async function getPaymentAuthorizationState(params: {
  claimId: string;
  status: string;
  authority: TenantAuthority;
}): Promise<PaymentAuthorizationState | null | undefined> {
  if (!paymentGatedStatuses.has(params.status)) {
    return undefined;
  }

  const { tenantId } = readTenantAuthority(params.authority);
  const [agreement] = await withTenantAuthority(params.authority, tx =>
    tx
      .select({
        paymentAuthorizationState: claimEscalationAgreements.paymentAuthorizationState,
      })
      .from(claimEscalationAgreements)
      .where(
        withTenant(
          tenantId,
          claimEscalationAgreements.tenantId,
          eq(claimEscalationAgreements.claimId, params.claimId)
        )
      )
      .limit(1)
  );

  return agreement?.paymentAuthorizationState ?? null;
}
