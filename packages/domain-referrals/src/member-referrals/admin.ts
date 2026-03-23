import { db } from '@interdomestik/database';
import { memberReferralRewards } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

import type {
  ActionResult,
  MemberReferralRewardStatus,
  MemberReferralRewardType,
  MemberReferralQualifyingEventType,
} from './types';

export interface MemberReferralAdminRewardRow {
  id: string;
  tenantId: string;
  referralId: string;
  subscriptionId: string;
  referrerMemberId: string;
  referredMemberId: string;
  qualifyingEventId: string;
  qualifyingEventType: MemberReferralQualifyingEventType;
  rewardType: MemberReferralRewardType;
  status: MemberReferralRewardStatus;
  rewardCents: number;
  rewardPercentBps: number | null;
  currencyCode: string;
  earnedAt: Date | null;
  approvedAt: Date | null;
  creditedAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  updatedAt: Date | null;
  metadata: Record<string, unknown>;
}

const MAX_RESULTS = 100;

const ALLOWED_TRANSITIONS: Record<MemberReferralRewardStatus, Array<MemberReferralRewardStatus>> = {
  pending: ['approved', 'void'],
  approved: ['credited', 'paid', 'void'],
  credited: ['paid', 'void'],
  paid: [],
  void: [],
};

function buildStatusPatch(params: {
  currentApprovedAt: Date | null | undefined;
  newStatus: MemberReferralRewardStatus;
}): Record<string, unknown> {
  const now = new Date();
  const patch: Record<string, unknown> = {
    status: params.newStatus,
    updatedAt: now,
  };

  if (params.newStatus === 'approved') {
    patch.approvedAt = params.currentApprovedAt ?? now;
  }

  if (params.newStatus === 'credited') {
    patch.approvedAt = params.currentApprovedAt ?? now;
    patch.creditedAt = now;
  }

  if (params.newStatus === 'paid') {
    patch.approvedAt = params.currentApprovedAt ?? now;
    patch.paidAt = now;
  }

  if (params.newStatus === 'void') {
    patch.voidedAt = now;
  }

  return patch;
}

export async function listMemberReferralRewardsCore(params: {
  tenantId: string;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<MemberReferralAdminRewardRow[]>> {
  try {
    const limit = Math.min(params.limit ?? MAX_RESULTS, MAX_RESULTS);
    const offset = params.offset ?? 0;
    const rows = await db.query.memberReferralRewards.findMany({
      where: and(eq(memberReferralRewards.tenantId, params.tenantId)),
      limit,
      offset,
    });

    return {
      success: true,
      data: rows as MemberReferralAdminRewardRow[],
    };
  } catch (error) {
    console.error('Error listing member referral rewards:', error);
    return { success: false, error: 'Failed to list referral rewards' };
  }
}

export async function updateMemberReferralRewardStatusCore(params: {
  tenantId: string;
  rewardId: string;
  newStatus: MemberReferralRewardStatus;
}): Promise<ActionResult<MemberReferralAdminRewardRow>> {
  try {
    const current = await db.query.memberReferralRewards.findFirst({
      where: and(
        eq(memberReferralRewards.tenantId, params.tenantId),
        eq(memberReferralRewards.id, params.rewardId)
      ),
    });

    if (!current) {
      return { success: false, error: 'Referral reward not found' };
    }

    const currentStatus = current.status as MemberReferralRewardStatus;
    const allowedTransitions = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowedTransitions.includes(params.newStatus)) {
      return {
        success: false,
        error: `Invalid transition: ${currentStatus} -> ${params.newStatus}. Allowed: ${
          allowedTransitions.join(', ') || 'none'
        }`,
      };
    }

    const patch = buildStatusPatch({
      currentApprovedAt: current.approvedAt,
      newStatus: params.newStatus,
    });

    const [updated] = await db
      .update(memberReferralRewards)
      .set(patch)
      .where(
        and(
          eq(memberReferralRewards.tenantId, params.tenantId),
          eq(memberReferralRewards.id, params.rewardId)
        )
      )
      .returning();

    if (!updated) {
      return { success: false, error: 'Failed to update referral reward status' };
    }

    return {
      success: true,
      data: updated as MemberReferralAdminRewardRow,
    };
  } catch (error) {
    console.error('Error updating member referral reward:', error);
    return { success: false, error: 'Failed to update referral reward' };
  }
}
