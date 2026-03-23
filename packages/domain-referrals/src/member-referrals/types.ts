export interface MemberReferralLink {
  code: string;
  link: string;
  whatsappShareUrl: string;
}

export type MemberReferralRewardStatus = 'pending' | 'approved' | 'credited' | 'paid' | 'void';
export type MemberReferralRewardType = 'fixed' | 'percent';
export type MemberReferralSettlementMode = 'credit_only' | 'credit_or_payout';
export type MemberReferralQualifyingEventType = 'first_paid_membership' | 'renewal';

export interface MemberReferralProgramSettings {
  tenantId: string;
  enabled: boolean;
  rewardType: MemberReferralRewardType;
  fixedRewardCents: number;
  percentRewardBps: number | null;
  settlementMode: MemberReferralSettlementMode;
  payoutThresholdCents: number;
  fraudReviewEnabled: boolean;
  currencyCode: string;
  qualifyingEventType: MemberReferralQualifyingEventType;
}

export interface MemberReferralSettingsInput {
  enabled?: boolean;
  rewardType?: MemberReferralRewardType;
  fixedRewardCents?: number | null;
  percentRewardBps?: number | null;
  settlementMode?: MemberReferralSettlementMode;
  payoutThresholdCents?: number;
  fraudReviewEnabled?: boolean;
  currencyCode?: string;
  qualifyingEventType?: MemberReferralQualifyingEventType;
}

export interface MemberReferralRewardRecord {
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
  metadata: Record<string, unknown>;
}

export interface MemberReferralAdminRewardRow extends MemberReferralRewardRecord {
  earnedAt?: Date | null;
  approvedAt?: Date | null;
  creditedAt?: Date | null;
  paidAt?: Date | null;
  voidedAt?: Date | null;
  updatedAt?: Date | null;
}

export interface MemberReferralRewardInput {
  tenantId: string;
  referralId?: string | null;
  subscriptionId: string;
  qualifyingEventId: string;
  qualifyingEventType: MemberReferralQualifyingEventType;
  paymentAmountCents: number;
  currencyCode?: string;
  metadata?: Record<string, unknown>;
}

export type MemberReferralRewardNoopReason =
  | 'program_disabled'
  | 'non_qualifying_event'
  | 'no_referral'
  | 'zero_reward';

export type MemberReferralRewardResult =
  | {
      kind: 'created';
      created: true;
      id: string;
      rewardCents: number;
      status: MemberReferralRewardStatus;
      rewardType: MemberReferralRewardType;
      currencyCode: string;
    }
  | {
      kind: 'existing';
      created: false;
      id: string;
      rewardCents: number;
      status: MemberReferralRewardStatus;
      rewardType: MemberReferralRewardType;
      currencyCode: string;
    }
  | {
      kind: 'no-op';
      created: false;
      reason: MemberReferralRewardNoopReason;
    };

export interface MemberReferralStats {
  totalReferred: number;
  pendingRewards: number;
  creditedRewards: number;
  payoutEligibleRewards: number;
  paidRewards: number;
  rewardsCurrency: string;
}

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export type MemberReferralSession = {
  user: {
    id: string;
    role: string;
    name?: string | null;
    tenantId?: string | null;
  };
};
