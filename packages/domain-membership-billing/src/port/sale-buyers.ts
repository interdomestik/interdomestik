import type { TenantTransaction } from '@interdomestik/database';
import { memberLeads, user } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ROLES } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

import type { SalePrincipal } from './sale-authority';
import type { SaleInput } from './sale-input';

export type SaleBuyer = { kind: 'lead' | 'member'; id: string };

export function requestedBuyer(buyer: SaleInput['buyer']): SaleBuyer {
  return 'leadId' in buyer
    ? { kind: 'lead', id: buyer.leadId }
    : { kind: 'member', id: buyer.memberUserId };
}

async function findBuyer(tx: TenantTransaction, tenantId: string, buyer: SaleBuyer, lock: boolean) {
  if (buyer.kind === 'lead') {
    const query = tx
      .select({ agentId: memberLeads.agentId, branchId: memberLeads.branchId })
      .from(memberLeads)
      .where(
        withTenant(
          tenantId,
          memberLeads.tenantId,
          and(eq(memberLeads.id, buyer.id), eq(memberLeads.leadKind, 'individual'))
        )
      );
    const [lead] = await (lock ? query.for('share') : query);
    return lead;
  }
  const query = tx
    .select({ branchId: user.branchId })
    .from(user)
    .where(
      withTenant(tenantId, user.tenantId, and(eq(user.id, buyer.id), eq(user.role, ROLES.member)))
    );
  const [member] = await (lock ? query.for('share') : query);
  if (member) return { agentId: null, branchId: member.branchId };
}

export async function findScopedBuyer(
  tx: TenantTransaction,
  principal: SalePrincipal,
  buyer: SaleBuyer,
  lock: boolean
) {
  const row = await findBuyer(tx, principal.tenantId, buyer, lock);
  if (!row) return null;
  if (principal.role === ROLES.tenant_admin) return row;
  if (!principal.branchId || principal.branchId !== row.branchId) return null;
  if (principal.role === ROLES.staff) return row;
  return buyer.kind === 'lead' && row.agentId === principal.userId ? row : null;
}
