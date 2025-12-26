import { db } from '@interdomestik/database';
import { referrals } from '@interdomestik/database/schema';
import { count, eq } from 'drizzle-orm';

import type { Session } from './context';
import type { ActionResult, MemberReferralStats } from './types';

export async function getMemberReferralStatsCore(params: {
  session: NonNullable<Session> | null;
}): Promise<ActionResult<MemberReferralStats>> {
  const { session } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const [totalResult] = await db
      .select({ count: count() })
      .from(referrals)
      .where(eq(referrals.referrerId, session.user.id));

    const memberReferrals = await db.query.referrals.findMany({
      where: eq(referrals.referrerId, session.user.id),
      columns: {
        status: true,
        referrerRewardCents: true,
      },
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
