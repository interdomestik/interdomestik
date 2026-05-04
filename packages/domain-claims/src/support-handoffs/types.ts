import type { ClaimsDeps, ClaimsSession } from '../claims/types';

export const SUPPORT_HANDOFF_STATUSES = ['open', 'accepted', 'closed'] as const;
export type SupportHandoffStatus = (typeof SUPPORT_HANDOFF_STATUSES)[number];

export const SUPPORT_HANDOFF_URGENCIES = ['critical', 'high', 'normal', 'low'] as const;
export type SupportHandoffUrgency = (typeof SUPPORT_HANDOFF_URGENCIES)[number];

export const SUPPORT_HANDOFF_TRUST_RISKS = ['high', 'medium', 'low', 'informational'] as const;
export type SupportHandoffTrustRisk = (typeof SUPPORT_HANDOFF_TRUST_RISKS)[number];

export type SupportHandoffContactPreference = 'staff_reply' | 'phone' | 'email' | 'whatsapp';

export type SupportHandoffActionResult<T = void> =
  | { success: true; data: T; error?: undefined }
  | { success: false; error: string; data?: undefined };

export type SupportHandoffSession = ClaimsSession;
export type SupportHandoffDeps = Pick<ClaimsDeps, 'logAuditEvent'>;

export type CreateSupportHandoffInput = {
  subject: string;
  message: string;
  contactPreference?: SupportHandoffContactPreference;
  claimId?: string | null;
};

export type SupportHandoffLifecycleInput = {
  handoffId: string;
  expectedVersion?: number;
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

export type SupportHandoffQueueItemWithDetail = SupportHandoffQueueItem & {
  detail: SupportHandoffDetailFields;
};

export type SupportHandoffQueueItem = {
  id: string;
  subject: string;
  message: string;
  status: SupportHandoffStatus;
  urgency: SupportHandoffUrgency;
  trustRisk: SupportHandoffTrustRisk;
  lifecycleVersion: number;
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
