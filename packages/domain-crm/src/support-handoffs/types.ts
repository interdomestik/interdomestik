import type { CrmActorContext } from '../context';

export const SUPPORT_HANDOFF_STATUSES = ['open', 'accepted', 'closed'] as const;
export type SupportHandoffStatus = (typeof SUPPORT_HANDOFF_STATUSES)[number];

export const SUPPORT_HANDOFF_CRM_STATES = [
  'member_requested',
  'staff_accepted',
  'staff_responded',
  'member_acknowledged',
  'member_replied',
  'staff_followed_up',
  'closed',
] as const;
export type SupportHandoffCrmState = (typeof SUPPORT_HANDOFF_CRM_STATES)[number];

export type SupportHandoffCycle = {
  publicResponseVersion: number;
  publicResponseAt: string | null;
  publicResponseById?: string | null;
  publicResponseAcknowledgedAt: string | null;
  publicResponseAcknowledgedById?: string | null;
  publicResponseAcknowledgedVersion: number | null;
  memberReplyAt: string | null;
  memberReplyResponseVersion: number | null;
  staffFollowedUpAt: string | null;
  staffFollowedUpById: string | null;
};

export type SupportHandoff = {
  id: string;
  tenantId: string;
  memberId: string;
  branchId: string | null;
  staffId: string | null;
  claimId: string | null;
  status: SupportHandoffStatus;
  state: SupportHandoffCrmState;
  lifecycleVersion: number;
  cycle: SupportHandoffCycle;
  acceptedAt?: string | null;
  acceptedById?: string | null;
  closedAt?: string | null;
  closedById?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportHandoffStateSnapshot = Pick<SupportHandoff, 'status' | 'staffId' | 'cycle'> & {
  acceptedAt?: string | null;
};

export type SupportHandoffCommandEnvelope<TInput> = {
  actor: CrmActorContext;
  input: TInput;
};
