import type { CrmActorContext } from '../context';
import type {
  CrmLeadDedupeLead,
  CrmLeadMergeAggregateSummary,
  CrmLeadMergeHistoryRecord,
} from './types';

export type {
  CrmLeadDedupeIdentity,
  CrmLeadDedupeIdentityInput,
  CrmLeadDedupeLead,
  CrmLeadMatchCandidate,
  CrmLeadMatchConfidence,
  CrmLeadMatchReasonCode,
  CrmLeadMergeAggregatePolicy,
  CrmLeadMergeAggregateSummary,
  CrmLeadMergeFieldDecision,
  CrmLeadMergeableField,
  CrmLeadMergeHistoryRecord,
} from './types';

export {
  CRM_LEAD_MATCH_CONFIDENCE_THRESHOLDS,
  CRM_LEAD_MATCH_WEIGHTS,
  CRM_LEAD_MERGEABLE_FIELDS,
  LEAD_DEDUPE_MAX_CANDIDATES,
  LEAD_DEDUPE_MIN_PHONE_DIGITS,
} from './types';

export interface CrmLeadDedupeRepository {
  findLeadForMerge(params: { leadId: string }): Promise<CrmLeadDedupeLead | null>;
  findLeadMergeAggregateSummary(params: {
    leadId: string;
    tenantId: string;
  }): Promise<CrmLeadMergeAggregateSummary>;
  listPotentialDuplicateLeads(params: {
    actor: CrmActorContext;
    lead: CrmLeadDedupeLead;
    limit: number;
  }): Promise<readonly CrmLeadDedupeLead[]>;
  mergeLeads(params: { history: CrmLeadMergeHistoryRecord }): Promise<CrmLeadMergeHistoryRecord>;
}
