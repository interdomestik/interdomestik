import {
  and,
  claimDocuments,
  claims,
  eq,
  subscriptions,
  withTenantContext,
} from '@interdomestik/database';
import { count } from 'drizzle-orm';
import { cache } from 'react';

export const getCachedTenantSubscriptions = cache(async (userId: string, tenantId: string) => {
  return withTenantContext({ tenantId, role: 'member' }, tx =>
    tx.query.subscriptions.findMany({
      where: and(eq(subscriptions.userId, userId), eq(subscriptions.tenantId, tenantId)),
      orderBy: (subscriptionTable, { desc }) => [desc(subscriptionTable.createdAt)],
    })
  );
});

export const getCachedClaimDocumentCount = cache(async (userId: string, tenantId: string) => {
  const rows = await withTenantContext({ tenantId, role: 'member' }, tx =>
    // db-access-guard: tenant-scoped -- reason: document summary joins only viewer-owned claims inside tenant context
    tx
      .select({ count: count() })
      .from(claimDocuments)
      .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
      .where(
        and(
          eq(claims.userId, userId),
          eq(claims.tenantId, tenantId),
          eq(claimDocuments.tenantId, tenantId)
        )
      )
  );

  return Number(rows[0]?.count ?? 0);
});
