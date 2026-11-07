import { auditLog } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { nanoid } from 'nanoid';

/**
 * Durably records a paid Paddle lead whose email already belongs to an account, without the
 * email, for an operator to reconcile. Unlike the best-effort audit helper, a failed write throws
 * so the caller can keep the delivery retryable.
 */
export async function recordPaddleLeadEmailConflict(
  authority: TenantAuthority,
  params: { leadId: string }
): Promise<void> {
  const { tenantId } = readTenantAuthority(authority);
  // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
  await withTenantAuthority(authority, tx =>
    tx.insert(auditLog).values({
      id: nanoid(),
      tenantId,
      actorId: null,
      actorRole: 'system',
      action: 'PADDLE_LEAD_CONVERSION_EMAIL_CONFLICT',
      entityType: 'member_lead',
      entityId: params.leadId,
      metadata: { disposition: 'member_email_conflict', reconciliation: 'operator' },
      createdAt: new Date(),
    })
  );
}
