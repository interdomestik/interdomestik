import { claims, subscriptions } from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { differenceInDays } from 'date-fns';
import { and, eq } from 'drizzle-orm';

import type { Session } from './context';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function getWrappedStatsCore(params: {
  session: Session | null;
  authority: TenantAuthority | null;
}) {
  const { session, authority } = params;

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const userId = session.user.id;
  ensureTenantId(session);
  if (!authority) {
    throw new Error('Unauthorized');
  }
  const { tenantId } = readTenantAuthority(authority);

  const subscription = await withTenantAuthority(authority, async tx =>
    tx.query.subscriptions.findFirst({
      where: and(eq(subscriptions.userId, userId), eq(subscriptions.tenantId, tenantId)),
    })
  );

  if (!subscription?.createdAt) {
    return null;
  }

  const daysProtected = differenceInDays(new Date(), subscription.createdAt);

  const userClaims = await withTenantAuthority(authority, async tx =>
    tx.query.claims.findMany({
      where: and(eq(claims.userId, userId), eq(claims.tenantId, tenantId)),
    })
  );

  const claimsWithStatus = userClaims.map(claim => ({
    ...claim,
    status: claimStatusFromLifecycleFields(claim),
  }));

  const resolvedCount = claimsWithStatus.filter(c => c.status === 'resolved').length;

  const inProgressStatuses = CLAIM_STATUSES.filter(
    status => status !== 'draft' && status !== 'resolved' && status !== 'rejected'
  ) as ClaimStatus[];

  const inProgressCount = claimsWithStatus.filter(c =>
    inProgressStatuses.includes(c.status)
  ).length;

  const totalRecovered = claimsWithStatus
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
