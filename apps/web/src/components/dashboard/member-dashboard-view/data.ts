import { and, db, eq, subscriptions, user } from '@interdomestik/database';
import { cache } from 'react';

export const getCachedUser = cache(async (userId: string) => {
  // db-access-guard: tenant-scoped -- reason: userId comes from authenticated member dashboard data
  return db.query.user.findFirst({
    where: eq(user.id, userId),
  });
});

export const getCachedTenantSubscriptions = cache(async (userId: string, tenantId: string) => {
  return db.query.subscriptions.findMany({
    where: and(eq(subscriptions.userId, userId), eq(subscriptions.tenantId, tenantId)),
    orderBy: (subscriptionTable, { desc }) => [desc(subscriptionTable.createdAt)],
  });
});
