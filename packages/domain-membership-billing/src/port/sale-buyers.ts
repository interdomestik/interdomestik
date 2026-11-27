import type { TenantTransaction } from '@interdomestik/database';
import { memberLeads, subscriptions, user } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { currentMemberPredicate } from '@interdomestik/domain-communications/recipient-locale';
import { ROLES } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

import { readSponsorOutlook, resolveEffectiveMembership } from '../sponsor-coverage';
import {
  getMembershipLifecycleBucket,
  membershipLifecycleGrantsAccess,
} from '../subscription/lifecycle-reporting';
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
      .select({
        agentId: memberLeads.agentId,
        branchId: memberLeads.branchId,
        coverageUserId: memberLeads.convertedUserId,
      })
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
    .where(currentMemberPredicate(tenantId, buyer.id));
  const [member] = await (lock ? query.for('share') : query);
  if (member) return { agentId: null, branchId: member.branchId, coverageUserId: buyer.id };
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

export async function lockBuyerSubscriptions(
  tx: TenantTransaction,
  tenantId: string,
  userId: string
) {
  await tx
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(withTenant(tenantId, subscriptions.tenantId, eq(subscriptions.userId, userId)))
    .for('share');
}

export async function buyerCoverageFailure(
  tx: TenantTransaction,
  tenantId: string,
  userId: string
): Promise<'not_found' | 'already_covered' | null> {
  const now = new Date();
  const membership = (await resolveEffectiveMembership(tx, tenantId, [userId], now)).get(userId);
  if (!membership) return 'not_found';
  if (membership.source === 'sponsor') return 'already_covered';
  if (
    membership.source === 'subscription' &&
    membershipLifecycleGrantsAccess(
      getMembershipLifecycleBucket({ subscription: membership.subscription, now })
    )
  ) {
    return 'already_covered';
  }

  // The sponsor checkout outlook also blocks purchase if an accepted seat starts later.
  const outlook = (await readSponsorOutlook(tx, tenantId, [userId], now)).get(userId);
  return outlook?.covering || outlook?.nextStart ? 'already_covered' : null;
}
