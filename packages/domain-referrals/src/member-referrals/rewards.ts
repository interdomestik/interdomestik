import { db } from '@interdomestik/database';
import { memberReferralRewards, referrals } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { getMemberReferralProgramSettingsCore } from './settings';
import type {
  ActionResult,
  MemberReferralRewardInput,
  MemberReferralRewardRecord,
  MemberReferralRewardResult,
  MemberReferralRewardType,
} from './types';

function resolveRewardCents(args: {
  rewardType: MemberReferralRewardType;
  fixedRewardCents: number | null;
  percentRewardBps: number | null;
  paymentAmountCents: number;
}): number {
  if (args.rewardType === 'fixed') {
    return args.fixedRewardCents ?? 0;
  }

  if (args.percentRewardBps == null) {
    return 0;
  }

  return Math.round((args.paymentAmountCents * args.percentRewardBps) / 10000);
}

function toResult(
  kind: 'created' | 'existing',
  row: Pick<
    MemberReferralRewardRecord,
    'id' | 'rewardCents' | 'status' | 'rewardType' | 'currencyCode'
  >
): MemberReferralRewardResult {
  if (kind === 'created') {
    return {
      kind: 'created',
      created: true,
      ...row,
    };
  }

  return {
    kind: 'existing',
    created: false,
    ...row,
  };
}

async function findExistingReward(args: {
  tenantId: string;
  subscriptionId: string;
  qualifyingEventType: string;
  qualifyingEventId: string;
}): Promise<MemberReferralRewardRecord | null> {
  const row = await db.query.memberReferralRewards.findFirst({
    where: and(
      eq(memberReferralRewards.tenantId, args.tenantId),
      eq(memberReferralRewards.subscriptionId, args.subscriptionId),
      eq(memberReferralRewards.qualifyingEventType, args.qualifyingEventType),
      eq(memberReferralRewards.qualifyingEventId, args.qualifyingEventId)
    ),
  });

  return (row as MemberReferralRewardRecord | null) ?? null;
}

export async function createMemberReferralRewardCore(
  params: MemberReferralRewardInput
): Promise<ActionResult<MemberReferralRewardResult>> {
  const { tenantId, referralId, subscriptionId, qualifyingEventId, qualifyingEventType } = params;

  const settingsResult = await getMemberReferralProgramSettingsCore({ tenantId });
  if (!settingsResult.success) {
    return { success: false, error: settingsResult.error };
  }

  const settings = settingsResult.data;
  if (qualifyingEventType !== settings.qualifyingEventType) {
    return {
      success: true,
      data: {
        kind: 'no-op',
        created: false,
        reason: 'non_qualifying_event',
      },
    };
  }

  if (!referralId) {
    return {
      success: true,
      data: {
        kind: 'no-op',
        created: false,
        reason: 'no_referral',
      },
    };
  }

  if (!settings.enabled) {
    return {
      success: true,
      data: {
        kind: 'no-op',
        created: false,
        reason: 'program_disabled',
      },
    };
  }

  const referralRow = await db.query.referrals.findFirst({
    where: and(eq(referrals.id, referralId), eq(referrals.tenantId, tenantId)),
  });
  if (!referralRow) {
    return {
      success: true,
      data: {
        kind: 'no-op',
        created: false,
        reason: 'no_referral',
      },
    };
  }

  const existing = await findExistingReward({
    tenantId,
    subscriptionId,
    qualifyingEventType,
    qualifyingEventId,
  });
  if (existing) {
    return {
      success: true,
      data: toResult('existing', existing),
    };
  }

  const rewardCents = resolveRewardCents({
    rewardType: settings.rewardType,
    fixedRewardCents: settings.fixedRewardCents,
    percentRewardBps: settings.percentRewardBps,
    paymentAmountCents: params.paymentAmountCents,
  });

  if (rewardCents <= 0) {
    return {
      success: true,
      data: {
        kind: 'no-op',
        created: false,
        reason: 'zero_reward',
      },
    };
  }

  const rewardId = nanoid();
  const rows = await db
    .insert(memberReferralRewards)
    .values({
      id: rewardId,
      tenantId,
      referralId,
      subscriptionId,
      referrerMemberId: referralRow.referrerId,
      referredMemberId: referralRow.referredId,
      qualifyingEventId,
      qualifyingEventType,
      rewardType: settings.rewardType,
      status: 'pending',
      rewardCents,
      rewardPercentBps: settings.rewardType === 'percent' ? settings.percentRewardBps : null,
      currencyCode: params.currencyCode ?? settings.currencyCode,
      metadata: {
        ...(params.metadata ?? {}),
        source: 'member_referral_program',
        settingSnapshot: settings,
      },
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [
        memberReferralRewards.tenantId,
        memberReferralRewards.subscriptionId,
        memberReferralRewards.qualifyingEventType,
        memberReferralRewards.qualifyingEventId,
      ],
    })
    .returning({
      id: memberReferralRewards.id,
      rewardCents: memberReferralRewards.rewardCents,
      status: memberReferralRewards.status,
      rewardType: memberReferralRewards.rewardType,
      currencyCode: memberReferralRewards.currencyCode,
    });

  const row = rows[0];
  if (!row) {
    const replay = await findExistingReward({
      tenantId,
      subscriptionId,
      qualifyingEventType,
      qualifyingEventId,
    });

    if (!replay) {
      return {
        success: false,
        error: 'Failed to create member referral reward',
      };
    }

    return {
      success: true,
      data: toResult('existing', replay),
    };
  }

  return {
    success: true,
    data: toResult('created', row),
  };
}
