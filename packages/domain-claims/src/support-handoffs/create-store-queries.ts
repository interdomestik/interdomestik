import { claims, desc, eq, subscriptions, type TenantTransaction } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and } from 'drizzle-orm';

export type ClaimContext = {
  id: string;
  branchId: string | null;
  staffId: string | null;
  status: ClaimStatus | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  statusUpdatedAt: Date | string | null;
};

type SupportHandoffDb = Pick<TenantTransaction, 'select'>;

export async function getMemberSubscriptionBranch(
  database: SupportHandoffDb,
  args: { memberId: string; tenantId: string }
) {
  const [subscription] = await database
    .select({ branchId: subscriptions.branchId })
    .from(subscriptions)
    .where(
      withTenant(args.tenantId, subscriptions.tenantId, eq(subscriptions.userId, args.memberId))
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  return subscription?.branchId ?? null;
}

export async function getOwnedClaimContext(args: {
  database: SupportHandoffDb;
  claimId: string;
  memberId: string;
  tenantId: string;
}): Promise<ClaimContext | null> {
  const [claim] = await args.database
    .select({
      id: claims.id,
      branchId: claims.branchId,
      staffId: claims.staffId,
      status: claims.status,
      createdAt: claims.createdAt,
      updatedAt: claims.updatedAt,
      statusUpdatedAt: claims.statusUpdatedAt,
    })
    .from(claims)
    .where(
      withTenant(
        args.tenantId,
        claims.tenantId,
        and(eq(claims.id, args.claimId), eq(claims.userId, args.memberId))
      )
    )
    .limit(1);

  return claim ?? null;
}
