import { claims, db, subscriptions } from '@interdomestik/database';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { differenceInDays } from 'date-fns';
import { eq } from 'drizzle-orm';

import type { Session } from './context';

export async function getWrappedStatsCore(params: { session: Session | null }) {
  const { session } = params;

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const userId = session.user.id;

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  });

  if (!subscription?.createdAt) {
    return null;
  }

  const daysProtected = differenceInDays(new Date(), subscription.createdAt);

  const userClaims = await db.query.claims.findMany({
    where: eq(claims.userId, userId),
  });

  const resolvedCount = userClaims.filter(c => c.status === 'resolved').length;

  const inProgressStatuses = CLAIM_STATUSES.filter(
    status => status !== 'draft' && status !== 'resolved' && status !== 'rejected'
  ) as ClaimStatus[];

  const inProgressCount = userClaims.filter(
    c => !!c.status && inProgressStatuses.includes(c.status as ClaimStatus)
  ).length;

  const totalRecovered = userClaims
    .filter(c => c.status === 'resolved')
    .reduce((acc, c) => acc + Number(c.claimAmount || 0), 0);

  return {
    userName: session.user.name || 'Member',
    planId: subscription.planId,
    daysProtected,
    totalClaims: userClaims.length,
    resolvedCount,
    inProgressCount,
    totalRecovered,
    joinedDate: subscription.createdAt,
  };
}
