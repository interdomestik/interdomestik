import { isStaffLikeCrmActor, type CrmActorContext } from '../context';
import type { CrmLeadMergedEvent } from '../outbox/types';
import type { CrmLeadDedupeRepository } from './repository';
import {
  CRM_LEAD_MATCH_CONFIDENCE_THRESHOLDS,
  CRM_LEAD_MATCH_WEIGHTS,
  CRM_LEAD_MERGEABLE_FIELDS,
  LEAD_DEDUPE_MAX_CANDIDATES,
  LEAD_DEDUPE_MIN_PHONE_DIGITS,
  type CrmLeadDedupeIdentity,
  type CrmLeadDedupeIdentityInput,
  type CrmLeadDedupeLead,
  type CrmLeadMatchCandidate,
  type CrmLeadMatchConfidence,
  type CrmLeadMatchReasonCode,
  type CrmLeadMergeAggregatePolicy,
  type CrmLeadMergeFieldDecision,
  type CrmLeadMergeHistoryRecord,
  type CrmLeadMergeableField,
} from './types';

export type CrmLeadDedupeClock = {
  now(): string;
};

export type CrmLeadDedupeIds = {
  leadMergeHistoryId(): string;
};

export type CrmLeadDedupeDenialReason =
  | 'agent_scope'
  | 'branch_scope'
  | 'role_scope'
  | 'tenant_scope';

export type CrmLeadDedupeInvalidInputReason =
  | 'empty_field_decisions'
  | 'empty_reason'
  | 'invalid_field_decision'
  | 'invalid_target'
  | 'lead_state'
  | 'self_merge';

export type CrmLeadDedupeLeadStateReason =
  | 'active_deals_present'
  | 'already_merged'
  | 'archived'
  | 'closed'
  | 'converted';

export type ListDuplicateCandidatesInput = {
  actor: CrmActorContext;
  leadId: string;
};

export type ListDuplicateCandidatesResult =
  | { success: true; candidates: readonly CrmLeadMatchCandidate[] }
  | { success: false; error: 'not_found' }
  | { success: false; error: 'forbidden'; reason: CrmLeadDedupeDenialReason }
  | {
      success: false;
      error: 'invalid_input';
      reason: 'lead_state';
      leadStateReason: CrmLeadDedupeLeadStateReason;
    };

export type MergeCrmLeadInput = {
  actor: CrmActorContext;
  fieldDecisions: readonly CrmLeadMergeFieldDecision[];
  idempotencyKey?: string | null;
  loserLeadId: string;
  matchReasonCodes?: readonly CrmLeadMatchReasonCode[];
  reason?: string | null;
  winnerLeadId: string;
};

export type MergeCrmLeadResult =
  | {
      success: true;
      event: CrmLeadMergedEvent;
      history: CrmLeadMergeHistoryRecord;
    }
  | { success: false; error: 'not_found' }
  | { success: false; error: 'forbidden'; reason: CrmLeadDedupeDenialReason }
  | {
      success: false;
      error: 'invalid_input';
      reason: CrmLeadDedupeInvalidInputReason;
      leadStateReason?: CrmLeadDedupeLeadStateReason;
    };

const MERGE_FIELD_SET: ReadonlySet<string> = new Set(CRM_LEAD_MERGEABLE_FIELDS);

const MERGE_AGGREGATE_POLICY: CrmLeadMergeAggregatePolicy = {
  activities: 'reassign_to_winner',
  deals: 'refuse_if_present',
  followUps: 'reassign_to_winner',
  ownershipHistory: 'remain_on_loser_for_audit',
  stageHistory: 'remain_on_loser_for_audit',
};

function normalizedText(value?: string | null): string | null {
  const normalized = value?.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() ?? '';
  return normalized || null;
}

function normalizedEmail(value?: string | null): string | null {
  const normalized = normalizedText(value);
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

function normalizedPhone(value?: string | null): string | null {
  const digits = value?.replace(/\D/g, '') ?? '';
  return digits.length >= LEAD_DEDUPE_MIN_PHONE_DIGITS ? digits : null;
}

export function normalizeLeadDedupeIdentity(
  input: CrmLeadDedupeIdentityInput
): CrmLeadDedupeIdentity {
  return {
    companyName: normalizedText(input.companyName),
    email: normalizedEmail(input.email),
    fullName: normalizedText(input.fullName),
    leadId: input.leadId,
    phone: normalizedPhone(input.phone),
    tenantId: input.tenantId,
  };
}

function confidenceForScore(score: number): CrmLeadMatchConfidence {
  if (score >= CRM_LEAD_MATCH_CONFIDENCE_THRESHOLDS.high) return 'high';
  if (score >= CRM_LEAD_MATCH_CONFIDENCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

export function scoreCrmLeadMatchCandidate(
  source: CrmLeadDedupeLead,
  candidate: CrmLeadDedupeLead
): CrmLeadMatchCandidate | null {
  if (source.tenantId !== candidate.tenantId) return null;

  const sourceIdentity = normalizeLeadDedupeIdentity({
    companyName: source.companyName,
    email: source.email,
    fullName: source.fullName,
    leadId: source.id,
    phone: source.phone,
    tenantId: source.tenantId,
  });
  const candidateIdentity = normalizeLeadDedupeIdentity({
    companyName: candidate.companyName,
    email: candidate.email,
    fullName: candidate.fullName,
    leadId: candidate.id,
    phone: candidate.phone,
    tenantId: candidate.tenantId,
  });

  const reasons: CrmLeadMatchReasonCode[] = [];
  let score = 0;

  if (
    sourceIdentity.email &&
    candidateIdentity.email &&
    sourceIdentity.email === candidateIdentity.email
  ) {
    reasons.push('email_exact');
    score += CRM_LEAD_MATCH_WEIGHTS.email_exact;
  }
  if (
    sourceIdentity.phone &&
    candidateIdentity.phone &&
    sourceIdentity.phone === candidateIdentity.phone
  ) {
    reasons.push('phone_exact');
    score += CRM_LEAD_MATCH_WEIGHTS.phone_exact;
  }
  if (
    sourceIdentity.fullName &&
    sourceIdentity.companyName &&
    candidateIdentity.fullName &&
    candidateIdentity.companyName &&
    sourceIdentity.fullName === candidateIdentity.fullName &&
    sourceIdentity.companyName === candidateIdentity.companyName
  ) {
    reasons.push('name_company_exact');
    score += CRM_LEAD_MATCH_WEIGHTS.name_company_exact;
  }

  const cappedScore = Math.min(score, 100);
  return {
    confidence: confidenceForScore(cappedScore),
    leadId: candidate.id,
    reasons: reasons.length > 0 ? reasons : ['insufficient_identity'],
    score: cappedScore,
  };
}

function authorizeLeadRead(
  actor: CrmActorContext,
  lead: CrmLeadDedupeLead
): CrmLeadDedupeDenialReason | null {
  if (lead.tenantId !== actor.tenantId) return 'tenant_scope';
  if (actor.role === 'agent') {
    if (actor.scope.agentId && actor.scope.agentId !== actor.actorId) return 'agent_scope';
    if (lead.agentId !== actor.actorId) return 'agent_scope';
    if (!actor.scope.branchId || !lead.branchId || lead.branchId !== actor.scope.branchId) {
      return 'branch_scope';
    }
    return null;
  }

  if (!isStaffLikeCrmActor(actor)) return 'role_scope';
  if (actor.role === 'admin') return null;
  if (!actor.scope.branchId || !lead.branchId || lead.branchId !== actor.scope.branchId) {
    return 'branch_scope';
  }
  return null;
}

function authorizeLeadMerge(
  actor: CrmActorContext,
  winner: CrmLeadDedupeLead,
  loser: CrmLeadDedupeLead
): CrmLeadDedupeDenialReason | null {
  return authorizeLeadRead(actor, winner) ?? authorizeLeadRead(actor, loser);
}

function leadStateReason(lead: CrmLeadDedupeLead): CrmLeadDedupeLeadStateReason | null {
  if (lead.archivedAt) return 'archived';
  if (lead.mergedIntoLeadId) return 'already_merged';
  if (lead.convertedAt) return 'converted';
  if (lead.wonAt || lead.lostAt) return 'closed';
  return null;
}

function invalidLeadState(
  leadStateReason: CrmLeadDedupeLeadStateReason
): Extract<MergeCrmLeadResult, { error: 'invalid_input' }> {
  return { success: false, error: 'invalid_input', reason: 'lead_state', leadStateReason };
}

function isVisibleCandidate(actor: CrmActorContext, candidate: CrmLeadDedupeLead): boolean {
  return authorizeLeadRead(actor, candidate) === null;
}

function isEligibleCandidate(candidate: CrmLeadDedupeLead): boolean {
  return leadStateReason(candidate) === null;
}

function normalizeMatchReasonCodes(
  reasonCodes: readonly CrmLeadMatchReasonCode[] | undefined
): CrmLeadMatchReasonCode[] {
  if (!reasonCodes) return [];
  return [...new Set(reasonCodes)];
}

function normalizeFieldDecisions(
  decisions: readonly CrmLeadMergeFieldDecision[]
): CrmLeadMergeFieldDecision[] | null {
  const normalized = decisions
    .map(decision => {
      const field = decision.field.trim() as CrmLeadMergeableField;
      const value = decision.value?.trim();
      return {
        field,
        source: decision.source,
        ...(value ? { value } : {}),
      };
    })
    .filter(decision => MERGE_FIELD_SET.has(decision.field));

  if (normalized.length !== decisions.length) return null;
  return normalized.length > 0 ? normalized : null;
}

function eventForMerge(
  history: CrmLeadMergeHistoryRecord,
  actor: CrmActorContext
): CrmLeadMergedEvent {
  return {
    actor: {
      actorId: actor.actorId,
      branchId: history.branchId,
      role: actor.role,
      tenantId: actor.tenantId,
    },
    aggregateId: history.winnerLeadId,
    aggregateType: 'lead',
    idempotencyKey: history.idempotencyKey,
    occurredAt: history.mergedAt,
    payload: {
      branchId: history.branchId,
      loserLeadId: history.loserLeadId,
      matchReasonCodes: history.matchReasonCodes,
      mergedFieldKeys: history.fieldDecisions.map(decision => decision.field),
      reason: history.reason,
      winnerLeadId: history.winnerLeadId,
    },
    tenantId: history.tenantId,
    type: 'crm.lead.merged',
  };
}

export async function listDuplicateCandidates(
  input: ListDuplicateCandidatesInput,
  repository: CrmLeadDedupeRepository
): Promise<ListDuplicateCandidatesResult> {
  const leadId = input.leadId.trim();
  if (!leadId) {
    return { success: false, error: 'not_found' };
  }

  const source = await repository.findLeadForMerge({ leadId });
  if (!source) return { success: false, error: 'not_found' };

  const denied = authorizeLeadRead(input.actor, source);
  if (denied) return { success: false, error: 'forbidden', reason: denied };

  const sourceState = leadStateReason(source);
  if (sourceState) {
    return {
      success: false,
      error: 'invalid_input',
      reason: 'lead_state',
      leadStateReason: sourceState,
    };
  }

  const candidates = await repository.listPotentialDuplicateLeads({
    actor: input.actor,
    lead: source,
    limit: LEAD_DEDUPE_MAX_CANDIDATES,
  });

  const scored = candidates
    .filter(candidate => candidate.id !== source.id)
    .filter(candidate => candidate.tenantId === source.tenantId)
    .filter(isEligibleCandidate)
    .filter(candidate => isVisibleCandidate(input.actor, candidate))
    .map(candidate => scoreCrmLeadMatchCandidate(source, candidate))
    .filter((candidate): candidate is CrmLeadMatchCandidate => Boolean(candidate))
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.leadId.localeCompare(right.leadId))
    .slice(0, LEAD_DEDUPE_MAX_CANDIDATES);

  return { success: true, candidates: scored };
}

export async function mergeCrmLead(
  input: MergeCrmLeadInput,
  repository: CrmLeadDedupeRepository,
  services: { clock: CrmLeadDedupeClock; ids: CrmLeadDedupeIds }
): Promise<MergeCrmLeadResult> {
  const winnerLeadId = input.winnerLeadId.trim();
  const loserLeadId = input.loserLeadId.trim();
  if (!winnerLeadId || !loserLeadId) {
    return { success: false, error: 'invalid_input', reason: 'invalid_target' };
  }
  if (winnerLeadId === loserLeadId) {
    return { success: false, error: 'invalid_input', reason: 'self_merge' };
  }

  const reason = input.reason?.trim() ?? '';
  if (!reason) return { success: false, error: 'invalid_input', reason: 'empty_reason' };

  const fieldDecisions = normalizeFieldDecisions(input.fieldDecisions);
  if (!fieldDecisions) {
    return {
      success: false,
      error: 'invalid_input',
      reason:
        input.fieldDecisions.length === 0 ? 'empty_field_decisions' : 'invalid_field_decision',
    };
  }

  const [winner, loser] = await Promise.all([
    repository.findLeadForMerge({ leadId: winnerLeadId }),
    repository.findLeadForMerge({ leadId: loserLeadId }),
  ]);
  if (!winner || !loser) return { success: false, error: 'not_found' };

  const denied = authorizeLeadMerge(input.actor, winner, loser);
  if (denied) return { success: false, error: 'forbidden', reason: denied };

  const winnerState = leadStateReason(winner);
  if (winnerState) return invalidLeadState(winnerState);
  const loserState = leadStateReason(loser);
  if (loserState) return invalidLeadState(loserState);

  if (!winner.branchId || !loser.branchId || winner.branchId !== loser.branchId) {
    return { success: false, error: 'forbidden', reason: 'branch_scope' };
  }

  const loserAggregateSummary = await repository.findLeadMergeAggregateSummary({
    leadId: loserLeadId,
    tenantId: input.actor.tenantId,
  });
  if (loserAggregateSummary.activeDealsCount > 0) {
    return invalidLeadState('active_deals_present');
  }

  const history: CrmLeadMergeHistoryRecord = {
    actorId: input.actor.actorId,
    aggregatePolicy: MERGE_AGGREGATE_POLICY,
    branchId: winner.branchId,
    fieldDecisions,
    id: services.ids.leadMergeHistoryId(),
    idempotencyKey: input.idempotencyKey?.trim() || null,
    loserLeadId,
    matchReasonCodes: normalizeMatchReasonCodes(input.matchReasonCodes),
    mergedAt: services.clock.now(),
    reason,
    tenantId: input.actor.tenantId,
    winnerLeadId,
  };
  const appended = await repository.mergeLeads({ history });
  return { event: eventForMerge(appended, input.actor), history: appended, success: true };
}
