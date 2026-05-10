import type { CrmActorContext } from '../context';
import type { CrmLeadRepository } from '../leads/repository';
import type { CrmLead, CrmLeadActivity } from '../leads/types';
import type { SupportHandoffRepository } from '../support-handoffs/repository';
import type { SupportHandoff } from '../support-handoffs/types';
import {
  authorizeCrmLeadTimelineRead,
  authorizeSupportHandoffTimelineRead,
  type CrmTimelineReadDenialReason,
} from './authorization';

export type CrmTimelineItemKind =
  | 'lead_created'
  | 'lead_activity_logged'
  | 'support_handoff_created'
  | 'support_handoff_staff_response'
  | 'support_handoff_member_acknowledgement'
  | 'support_handoff_member_reply'
  | 'support_handoff_staff_follow_up';

export type CrmTimelineAggregateType = 'crm_lead' | 'support_handoff';

export type CrmTimelineItem = {
  id: string;
  aggregateId: string;
  aggregateType: CrmTimelineAggregateType;
  kind: CrmTimelineItemKind;
  occurredAt: string;
  actorId: string | null;
  metadata: Record<string, unknown>;
};

export type CrmTimelineReadResult =
  | { success: true; items: CrmTimelineItem[] }
  | { success: false; error: 'not_found' }
  | { success: false; error: 'forbidden'; reason: CrmTimelineReadDenialReason };

export type CrmSupportHandoffTimelineSources = {
  supportHandoffs: Pick<SupportHandoffRepository, 'findById'>;
};

export type CrmLeadTimelineSources = {
  leads: Pick<CrmLeadRepository, 'findById' | 'listActivitiesForLead'>;
};

export type CrmTimelineReadModelSources = CrmSupportHandoffTimelineSources & CrmLeadTimelineSources;

export type GetSupportHandoffTimelineInput = {
  actor: CrmActorContext;
  handoffId: string;
};

export type GetCrmLeadTimelineInput = {
  actor: CrmActorContext;
  leadId: string;
  limit?: number;
};

// Architectural invariant: CRM activity/timeline is a read-only derived projection.
// Domain writes must not write timeline rows directly. Timeline/read-model code may
// read aggregate repositories; aggregate modules must not import from timeline.
export interface CrmTimelineReadModel {
  listSupportHandoffTimeline(
    input: GetSupportHandoffTimelineInput,
    sources: CrmSupportHandoffTimelineSources
  ): Promise<CrmTimelineReadResult>;
  listLeadTimeline(
    input: GetCrmLeadTimelineInput,
    sources: CrmLeadTimelineSources
  ): Promise<CrmTimelineReadResult>;
}

function forbidden(reason: CrmTimelineReadDenialReason): CrmTimelineReadResult {
  return { success: false, error: 'forbidden', reason };
}

function notFound(): CrmTimelineReadResult {
  return { success: false, error: 'not_found' };
}

function orderTimelineItems(items: CrmTimelineItem[]): CrmTimelineItem[] {
  return [...items].sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) ||
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id)
  );
}

function item(args: CrmTimelineItem): CrmTimelineItem {
  return args;
}

function leadCreatedItem(lead: CrmLead): CrmTimelineItem {
  return item({
    id: `crm-lead:${lead.id}:created`,
    aggregateId: lead.id,
    aggregateType: 'crm_lead',
    kind: 'lead_created',
    occurredAt: lead.createdAt,
    actorId: lead.agentId,
    metadata: {
      branchId: lead.branchId ?? null,
      source: lead.source ?? null,
      stage: lead.stage,
      type: lead.type,
    },
  });
}

function leadActivityItem(activity: CrmLeadActivity): CrmTimelineItem {
  return item({
    id: `crm-lead:${activity.leadId}:activity:${activity.id}`,
    aggregateId: activity.leadId,
    aggregateType: 'crm_lead',
    kind: 'lead_activity_logged',
    occurredAt: activity.occurredAt,
    actorId: activity.agentId,
    metadata: {
      activityType: activity.type,
      completedAt: activity.completedAt ?? null,
      description: activity.description ?? null,
      scheduledAt: activity.scheduledAt ?? null,
      subject: activity.subject,
    },
  });
}

function supportHandoffCreatedItem(handoff: SupportHandoff): CrmTimelineItem {
  return item({
    id: `support-handoff:${handoff.id}:created`,
    aggregateId: handoff.id,
    aggregateType: 'support_handoff',
    kind: 'support_handoff_created',
    occurredAt: handoff.createdAt,
    actorId: handoff.memberId,
    metadata: {
      branchId: handoff.branchId,
      claimId: handoff.claimId,
      state: handoff.state,
    },
  });
}

function supportHandoffResponseItem(handoff: SupportHandoff): CrmTimelineItem | null {
  if (!handoff.cycle.publicResponseAt) {
    return null;
  }

  const isFollowUp =
    handoff.cycle.staffFollowedUpAt != null ||
    (handoff.cycle.memberReplyAt != null &&
      handoff.cycle.memberReplyResponseVersion != null &&
      handoff.cycle.publicResponseVersion > handoff.cycle.memberReplyResponseVersion);

  return item({
    id: `support-handoff:${handoff.id}:${isFollowUp ? 'staff-follow-up' : 'staff-response'}`,
    aggregateId: handoff.id,
    aggregateType: 'support_handoff',
    kind: isFollowUp ? 'support_handoff_staff_follow_up' : 'support_handoff_staff_response',
    occurredAt: handoff.cycle.staffFollowedUpAt ?? handoff.cycle.publicResponseAt,
    actorId:
      handoff.cycle.staffFollowedUpById ?? handoff.cycle.publicResponseById ?? handoff.staffId,
    metadata: {
      responseVersion: handoff.cycle.publicResponseVersion,
    },
  });
}

function isRecordedCycleVersion(
  version: number | null,
  publicResponseVersion: number
): version is number {
  return version != null && version > 0 && version <= publicResponseVersion;
}

function supportHandoffAcknowledgementItem(handoff: SupportHandoff): CrmTimelineItem | null {
  const responseVersion = handoff.cycle.publicResponseAcknowledgedVersion;
  if (
    !handoff.cycle.publicResponseAcknowledgedAt ||
    !isRecordedCycleVersion(responseVersion, handoff.cycle.publicResponseVersion)
  ) {
    return null;
  }

  return item({
    id: `support-handoff:${handoff.id}:member-acknowledgement`,
    aggregateId: handoff.id,
    aggregateType: 'support_handoff',
    kind: 'support_handoff_member_acknowledgement',
    occurredAt: handoff.cycle.publicResponseAcknowledgedAt,
    actorId: handoff.cycle.publicResponseAcknowledgedById ?? handoff.memberId,
    metadata: {
      responseVersion,
    },
  });
}

function supportHandoffMemberReplyItem(handoff: SupportHandoff): CrmTimelineItem | null {
  const responseVersion = handoff.cycle.memberReplyResponseVersion;
  if (
    !handoff.cycle.memberReplyAt ||
    !isRecordedCycleVersion(responseVersion, handoff.cycle.publicResponseVersion)
  ) {
    return null;
  }

  return item({
    id: `support-handoff:${handoff.id}:member-reply`,
    aggregateId: handoff.id,
    aggregateType: 'support_handoff',
    kind: 'support_handoff_member_reply',
    occurredAt: handoff.cycle.memberReplyAt,
    actorId: handoff.memberId,
    metadata: {
      responseVersion,
    },
  });
}

function compactItems(items: Array<CrmTimelineItem | null>): CrmTimelineItem[] {
  return items.filter((value): value is CrmTimelineItem => value != null);
}

function buildSupportHandoffTimeline(handoff: SupportHandoff): CrmTimelineItem[] {
  return orderTimelineItems(
    compactItems([
      supportHandoffCreatedItem(handoff),
      supportHandoffResponseItem(handoff),
      supportHandoffAcknowledgementItem(handoff),
      supportHandoffMemberReplyItem(handoff),
    ])
  );
}

function buildLeadTimeline(lead: CrmLead, activities: CrmLeadActivity[]): CrmTimelineItem[] {
  return orderTimelineItems([leadCreatedItem(lead), ...activities.map(leadActivityItem)]);
}

export async function listSupportHandoffTimeline(
  input: GetSupportHandoffTimelineInput,
  sources: CrmSupportHandoffTimelineSources
): Promise<CrmTimelineReadResult> {
  const handoff = await sources.supportHandoffs.findById({
    actor: input.actor,
    handoffId: input.handoffId,
  });
  if (!handoff) {
    return notFound();
  }

  const authorization = authorizeSupportHandoffTimelineRead(input.actor, handoff);
  if (!authorization.allowed) {
    return forbidden(authorization.reason);
  }

  return { success: true, items: buildSupportHandoffTimeline(handoff) };
}

export async function listLeadTimeline(
  input: GetCrmLeadTimelineInput,
  sources: CrmLeadTimelineSources
): Promise<CrmTimelineReadResult> {
  const lead = await sources.leads.findById({ actor: input.actor, leadId: input.leadId });
  if (!lead) {
    return notFound();
  }

  const authorization = authorizeCrmLeadTimelineRead(input.actor, lead);
  if (!authorization.allowed) {
    return forbidden(authorization.reason);
  }

  const activities = await sources.leads.listActivitiesForLead({
    actor: input.actor,
    leadId: input.leadId,
    limit: input.limit,
  });
  return { success: true, items: buildLeadTimeline(lead, activities) };
}

export const crmTimelineReadModel: CrmTimelineReadModel = {
  listSupportHandoffTimeline,
  listLeadTimeline,
};
