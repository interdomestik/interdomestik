export interface MemberReferralLink {
  code: string;
  link: string;
  whatsappShareUrl: string;
}

export interface MemberReferralStats {
  totalReferred: number;
  pendingRewards: number;
  paidRewards: number;
  rewardsCurrency: string;
}

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export type MemberReferralSession = {
  user: {
    id: string;
    role: string;
    name?: string | null;
  };
};
