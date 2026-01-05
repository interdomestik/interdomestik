import { db } from '@interdomestik/database';
import { referrals } from '@interdomestik/database/schema';
import { and, count, eq } from 'drizzle-orm';

import type { ActionResult, MemberReferralSession, MemberReferralStats } from './types';

const MAX_REFERRALS_QUERY = 100; // Cap for pagination

export async function getMemberReferralStatsCore(params: {
  session: MemberReferralSession | null;
}): Promise<ActionResult<MemberReferralStats>> {
  const { session } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  // SECURITY: Tenant scoping
  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return { success: false, error: 'Missing tenant context' };
  }

  try {
    // SECURITY: Query scoped to tenant + user
    const [totalResult] = await db
      .select({ count: count() })
      .from(referrals)
      .where(and(eq(referrals.referrerId, session.user.id), eq(referrals.tenantId, tenantId)));

    // SECURITY: Query scoped to tenant + user with pagination cap
    const memberReferrals = await db.query.referrals.findMany({
      where: and(eq(referrals.referrerId, session.user.id), eq(referrals.tenantId, tenantId)),
      columns: {
        status: true,
        referrerRewardCents: true,
      },
      limit: MAX_REFERRALS_QUERY,
    });

    let pendingCents = 0;
    let paidCents = 0;

    for (const ref of memberReferrals) {
      const amount = ref.referrerRewardCents || 0;
      if (ref.status === 'pending') {
        pendingCents += amount;
      } else if (ref.status === 'rewarded') {
        paidCents += amount;
      }
    }

    return {
      success: true,
      data: {
        totalReferred: totalResult?.count || 0,
        pendingRewards: pendingCents / 100,
        paidRewards: paidCents / 100,
        rewardsCurrency: 'EUR',
      },
    };
  } catch (error) {
    console.error('Error fetching member referral stats:', error);
    return { success: false, error: 'Failed to fetch referral stats' };
  }
}
