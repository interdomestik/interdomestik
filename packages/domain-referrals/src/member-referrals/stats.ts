import { memberReferralRewards, referrals } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, count, eq } from 'drizzle-orm';

import { isMissingRelationError } from './errors';
import { getMemberReferralProgramSettingsCore } from './settings';
import type { ActionResult, MemberReferralSession, MemberReferralStats } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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
  authority: TenantAuthority | null;
}): Promise<ActionResult<MemberReferralStats>> {
  const { session, authority } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  if (!authority) {
    return { success: false, error: 'Missing tenant context' };
  }
  // Fail closed on an unrecognized or expired authority before any read starts.
  readTenantAuthority(authority);

  try {
    const [settingsResult, referralCountRows, rewardRows] = await Promise.all([
      getMemberReferralProgramSettingsCore({ authority }),
      safeReferralCountQuery(session.user.id, authority),
      safeRewardRowsQuery(session.user.id, authority),
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

async function safeReferralCountQuery(userId: string, authority: TenantAuthority) {
  const { tenantId } = readTenantAuthority(authority);
  try {
    return await withTenantAuthority(authority, tx =>
      tx
        .select({ count: count() })
        .from(referrals)
        .where(and(eq(referrals.referrerId, userId), eq(referrals.tenantId, tenantId)))
    );
  } catch (error) {
    if (isMissingRelationError(error)) {
      return [{ count: 0 }];
    }

    throw error;
  }
}

async function safeRewardRowsQuery(userId: string, authority: TenantAuthority) {
  const { tenantId } = readTenantAuthority(authority);
  try {
    return await withTenantAuthority(authority, tx =>
      tx.query.memberReferralRewards.findMany({
        where: and(
          eq(memberReferralRewards.referrerMemberId, userId),
          eq(memberReferralRewards.tenantId, tenantId)
        ),
        columns: {
          status: true,
          rewardCents: true,
        },
      })
    );
  } catch (error) {
    if (isMissingRelationError(error)) {
      return [];
    }

    throw error;
  }
}
