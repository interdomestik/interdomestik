'use server';

import { auth } from '@/lib/auth';
import { claims, db, subscriptions } from '@interdomestik/database';
import { differenceInDays } from 'date-fns';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';

export async function getWrappedStats() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const userId = session.user.id;

  // 1. Get Subscription Info
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  });

  if (!subscription || !subscription.createdAt) {
    return null;
  }

  // 2. Calculate Days Protected
  const daysProtected = differenceInDays(new Date(), subscription.createdAt);

  // 3. Get Claim Stats
  const userClaims = await db.query.claims.findMany({
    where: eq(claims.userId, userId),
  });

  const resolvedCount = userClaims.filter(c => c.status === 'resolved').length;
  const inProgressCount = userClaims.filter(
    c =>
      c.status &&
      ['submitted', 'verification', 'evaluation', 'negotiation', 'court'].includes(c.status)
  ).length;

  // 4. Calculate Total Managed/Recovered
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
