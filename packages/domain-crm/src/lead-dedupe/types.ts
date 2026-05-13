import type { CrmLead } from '../leads/types';

export const LEAD_DEDUPE_MIN_PHONE_DIGITS = 7;
export const LEAD_DEDUPE_MAX_CANDIDATES = 25;

export const CRM_LEAD_MATCH_WEIGHTS = {
  email_exact: 60,
  phone_exact: 35,
  name_company_exact: 45,
} as const;

export const CRM_LEAD_MATCH_CONFIDENCE_THRESHOLDS = {
  high: 80,
  medium: 45,
} as const;

export const CRM_LEAD_MERGEABLE_FIELDS = [
  'fullName',
  'companyName',
  'phone',
  'email',
  'source',
  'notes',
] as const;

export type CrmLeadDedupeLead = Pick<
  CrmLead,
  | 'agentId'
  | 'branchId'
  | 'companyName'
  | 'email'
  | 'fullName'
  | 'id'
  | 'lostAt'
  | 'notes'
  | 'phone'
  | 'source'
  | 'tenantId'
  | 'wonAt'
> & {
  archivedAt?: string | null;
  convertedAt?: string | null;
  mergedIntoLeadId?: string | null;
};

export type CrmLeadDedupeIdentityInput = {
  companyName?: string | null;
  email?: string | null;
  fullName?: string | null;
  leadId: string;
  phone?: string | null;
  tenantId: string;
};

export type CrmLeadDedupeIdentity = {
  companyName?: string | null;
  email?: string | null;
  fullName?: string | null;
  leadId: string;
  phone?: string | null;
  tenantId: string;
};

export type CrmLeadMatchReasonCode =
  | 'email_exact'
  | 'phone_exact'
  | 'name_company_exact'
  | 'insufficient_identity';

export type CrmLeadMatchConfidence = 'high' | 'medium' | 'low';

export type CrmLeadMatchCandidate = {
  confidence: CrmLeadMatchConfidence;
  leadId: string;
  reasons: readonly CrmLeadMatchReasonCode[];
  score: number;
};

export type CrmLeadMergeableField = (typeof CRM_LEAD_MERGEABLE_FIELDS)[number];

export type CrmLeadMergeFieldDecision = {
  field: CrmLeadMergeableField;
  source: 'winner' | 'loser' | 'explicit';
  value?: string | null;
};

export type CrmLeadMergeAggregatePolicy = {
  activities: 'reassign_to_winner';
  deals: 'refuse_if_present';
  followUps: 'reassign_to_winner';
  ownershipHistory: 'remain_on_loser_for_audit';
  stageHistory: 'remain_on_loser_for_audit';
};

export type CrmLeadMergeAggregateSummary = {
  activitiesCount: number;
  activeDealsCount: number;
  openFollowUpsCount: number;
};

export type CrmLeadMergeHistoryRecord = {
  aggregatePolicy: CrmLeadMergeAggregatePolicy;
  actorId: string;
  branchId: string;
  fieldDecisions: readonly CrmLeadMergeFieldDecision[];
  id: string;
  idempotencyKey?: string | null;
  loserLeadId: string;
  matchReasonCodes: readonly CrmLeadMatchReasonCode[];
  mergedAt: string;
  reason: string;
  tenantId: string;
  winnerLeadId: string;
};
