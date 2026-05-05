import type { ClaimsDeps, ClaimsSession } from '../claims/types';

export const SUPPORT_HANDOFF_STATUSES = ['open', 'accepted', 'closed'] as const;
export type SupportHandoffStatus = (typeof SUPPORT_HANDOFF_STATUSES)[number];

export const ACTIVE_HANDOFF_STATUSES = ['open', 'accepted'] as const;
export type ActiveHandoffStatus = (typeof ACTIVE_HANDOFF_STATUSES)[number];

export const SUPPORT_HANDOFF_URGENCIES = ['critical', 'high', 'normal', 'low'] as const;
export type SupportHandoffUrgency = (typeof SUPPORT_HANDOFF_URGENCIES)[number];

export const SUPPORT_HANDOFF_TRUST_RISKS = ['high', 'medium', 'low', 'informational'] as const;
export type SupportHandoffTrustRisk = (typeof SUPPORT_HANDOFF_TRUST_RISKS)[number];

export type SupportHandoffContactPreference = 'staff_reply' | 'phone' | 'email' | 'whatsapp';

export const SUPPORT_HANDOFF_SOURCES = ['member_help', 'member_claim_detail'] as const;
export type SupportHandoffSource = (typeof SUPPORT_HANDOFF_SOURCES)[number];

export type SupportHandoffActionResult<T = void> =
  | { success: true; data: T; error?: undefined }
  | { success: false; error: string; code?: string; data?: undefined };

export type SupportHandoffSession = ClaimsSession;
export type SupportHandoffDeps = Pick<ClaimsDeps, 'logAuditEvent'>;

export const MAX_PUBLIC_RESPONSE_LENGTH = 1_000;
export const MAX_MEMBER_REPLY_LENGTH = 1_000;

export type CreateSupportHandoffInput = {
  subject: string;
  message: string;
  contactPreference?: SupportHandoffContactPreference;
  claimId?: string | null;
  source?: string | null;
  sourceClaimId?: string | null;
};

export type SupportHandoffLifecycleInput = {
  handoffId: string;
  expectedVersion?: number;
};

export type UpdateSupportHandoffPublicResponseInput = {
  handoffId: string;
  expectedVersion?: number;
  response: string;
};

export type UpdateSupportHandoffPublicResponseResult = {
  handoffId: string;
  memberId: string;
  publicResponseVersion: number;
  tenantId: string;
};

export type AcknowledgeSupportHandoffPublicResponseInput = {
  expectedPublicResponseVersion: number;
  handoffId: string;
};

export type AcknowledgeSupportHandoffPublicResponseErrorCode =
  | 'CLOSED'
  | 'STALE_VERSION'
  | 'UNAUTHORIZED';

export type AcknowledgeSupportHandoffPublicResponseResult = {
  acknowledgedAt: string;
  handoffId: string;
  publicResponseAcknowledgedVersion: number;
};

export type SubmitSupportHandoffMemberReplyInput = {
  expectedPublicResponseVersion: number;
  handoffId: string;
  replyText: string;
};

export type SubmitSupportHandoffMemberReplyErrorCode =
  | 'ALREADY_REPLIED'
  | 'CLOSED'
  | 'NO_RESPONSE'
  | 'NOT_ACKNOWLEDGED'
  | 'STALE_VERSION'
  | 'VALIDATION'
  | 'UNAUTHORIZED';

export type SubmitSupportHandoffMemberReplyResult = {
  handoffId: string;
  memberReplyAt: string;
  memberReplyResponseVersion: number;
};

export type SupportHandoffQueueAssignmentFilter = 'all' | 'mine' | 'unassigned';
export type SupportHandoffQueueStatusFilter = SupportHandoffStatus | 'all';
export type SupportHandoffQueueOwnerFilter = SupportHandoffQueueAssignmentFilter;

export type SupportHandoffDetailFields = {
  contactPreference: SupportHandoffContactPreference;
  source: string;
  acceptedAt: string | null;
  acceptedByName: string | null;
  reassignedAt: string | null;
  reassignedByName: string | null;
  reassignReason: string | null;
  closedAt: string | null;
  closedByName: string | null;
  closeReason: string | null;
};

export type StaffPublicResponseFields = {
  publicResponse: string | null;
  publicResponseAt: string | null;
  publicResponseVersion: number;
  publicResponseAcknowledged: boolean;
  publicResponseAcknowledgedAt: string | null;
  publicResponseAcknowledgedVersion: number | null;
};

export type MemberReplyFields = {
  memberReply: string | null;
  memberReplyAt: string | null;
  memberReplyResponseVersion: number | null;
};

export type SupportHandoffStaffDetail = SupportHandoffDetailFields & {
  memberReply: MemberReplyFields;
  publicResponse: StaffPublicResponseFields;
};

export type MemberActiveHandoffAdvisory = {
  /** Total count of open + accepted handoffs for this member. */
  activeCount: number;
  /** The primary handoff detail when a same-claim match exists. */
  claimMatch: {
    status: ActiveHandoffStatus;
    createdAt: string;
    updatedAt: string;
    /** Source identifier for UI localization, not presentation copy. */
    sourceLabel: string;
  } | null;
  /** Linked claim label from the matching handoff, if any. */
  linkedClaim: {
    label: string;
    status: string | null;
  } | null;
};

export type MemberSupportHandoffPublicResponse = {
  /** The support handoff that owns this public response. */
  handoffId: string;
  /** The latest staff-authored response text, or null if none sent. */
  publicResponse: string | null;
  /** ISO timestamp of when the response was last sent or updated. */
  publicResponseAt: string | null;
  /** Version of the current staff-authored public response. */
  publicResponseVersion: number;
  /** Whether the authenticated member acknowledged the current response version. */
  publicResponseAcknowledged: boolean;
  /** ISO timestamp for acknowledgement of the current response version, or null. */
  publicResponseAcknowledgedAt: string | null;
  /** The last acknowledged public-response version, or null if none. */
  publicResponseAcknowledgedVersion: number | null;
  /** The latest member follow-up text, scoped to the scalar handoff reply fields. */
  memberReply: string | null;
  /** ISO timestamp for the latest member reply, or null. */
  memberReplyAt: string | null;
  /** Public-response version that the latest member reply belongs to, or null. */
  memberReplyResponseVersion: number | null;
};

export type CloseSupportHandoffResult = {
  handoffId: string;
  lifecycleVersion: number;
  memberId: string;
  tenantId: string;
};

export type SupportHandoffQueueItemWithDetail = SupportHandoffQueueItem & {
  detail: SupportHandoffStaffDetail;
};

export type SupportHandoffQueueItem = {
  id: string;
  subject: string;
  message: string;
  status: SupportHandoffStatus;
  urgency: SupportHandoffUrgency;
  trustRisk: SupportHandoffTrustRisk;
  lifecycleVersion: number;
  publicResponseAt: string | null;
  createdAt: string;
  updatedAt: string;
  staffId: string | null;
  staffName: string | null;
  member: {
    id: string;
    name: string;
    email: string | null;
    memberNumber: string | null;
  };
  claim: {
    id: string;
    claimNumber: string | null;
    title: string | null;
    status: string | null;
  } | null;
  relationship: {
    branchName: string | null;
    planName: string | null;
    membershipStatus: string | null;
    agentName: string | null;
  };
};
