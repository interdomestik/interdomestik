import { db } from '@interdomestik/database';
import { memberReferralRewards, referrals } from '@interdomestik/database/schema';
import { and, count, eq } from 'drizzle-orm';

import { getMemberReferralProgramSettingsCore } from './settings';
import type { ActionResult, MemberReferralSession, MemberReferralStats } from './types';

function sumRewards(
  rows: Array<{
    status: string;
    rewardCents: number | null;
  }>
): {
  pendingCents: number;
  approvedCents: number;
  creditedCents: number;
  paidCents: number;
} {
  return rows.reduce(
    (acc, row) => {
      const amount = row.rewardCents ?? 0;
      if (row.status === 'pending') {
        acc.pendingCents += amount;
      } else if (row.status === 'approved') {
        acc.approvedCents += amount;
      } else if (row.status === 'credited') {
        acc.creditedCents += amount;
      } else if (row.status === 'paid') {
        acc.paidCents += amount;
      }

      return acc;
    },
    { pendingCents: 0, approvedCents: 0, creditedCents: 0, paidCents: 0 }
  );
}

export async function getMemberReferralStatsCore(params: {
  session: MemberReferralSession | null;
}): Promise<ActionResult<MemberReferralStats>> {
  const { session } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return { success: false, error: 'Missing tenant context' };
  }

  try {
    const [settingsResult, referralCountRows, rewardRows] = await Promise.all([
      getMemberReferralProgramSettingsCore({ tenantId }),
      db
        .select({ count: count() })
        .from(referrals)
        .where(and(eq(referrals.referrerId, session.user.id), eq(referrals.tenantId, tenantId))),
      db.query.memberReferralRewards.findMany({
        where: and(
          eq(memberReferralRewards.referrerMemberId, session.user.id),
          eq(memberReferralRewards.tenantId, tenantId)
        ),
        columns: {
          status: true,
          rewardCents: true,
        },
      }),
    ]);

    if (!settingsResult.success) {
      return { success: false, error: settingsResult.error };
    }

    const { count: totalReferred = 0 } = referralCountRows[0] ?? {};
    const { pendingCents, approvedCents, creditedCents, paidCents } = sumRewards(
      rewardRows as Array<{ status: string; rewardCents: number | null }>
    );
    // Approved rewards are already reviewed but not yet settled, so they stay in the
    // pending/available balance shown to members.
    const availableCents = pendingCents + approvedCents;
    const payoutEligibleCents =
      settingsResult.data.settlementMode === 'credit_or_payout' &&
      creditedCents >= settingsResult.data.payoutThresholdCents
        ? creditedCents
        : 0;

    return {
      success: true,
      data: {
        totalReferred,
        pendingRewards: availableCents / 100,
        creditedRewards: creditedCents / 100,
        payoutEligibleRewards: payoutEligibleCents / 100,
        paidRewards: paidCents / 100,
        rewardsCurrency: settingsResult.data.currencyCode,
      },
    };
  } catch (error) {
    console.error('Error fetching member referral stats:', error);
    return { success: false, error: 'Failed to fetch referral stats' };
  }
}
