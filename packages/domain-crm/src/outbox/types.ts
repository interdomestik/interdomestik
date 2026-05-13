import type { CrmActorContext } from '../context';
import type { CrmLeadStage } from '../leads/mutations';

export const CRM_DOMAIN_EVENT_TYPES = [
  'crm.account.created',
  'crm.contact.created',
  'crm.lead.created',
  'crm.lead.converted',
  'crm.lead.merged',
  'crm.lead.stage_changed',
  'crm.lead.ownership_transferred',
  'crm.lead.activity_recorded',
  'crm.deal.created',
  'crm.deal.stage_changed',
  'crm.deal.won',
  'crm.deal.lost',
  'crm.deal.reopened',
] as const;
export type CrmDomainEventType = (typeof CRM_DOMAIN_EVENT_TYPES)[number];

export const CRM_DOMAIN_EVENT_AGGREGATE_TYPES = [
  'account',
  'contact',
  'deal',
  'lead',
  'support_handoff',
] as const;
export type CrmDomainEventAggregateType = (typeof CRM_DOMAIN_EVENT_AGGREGATE_TYPES)[number];

export type CrmDomainEventActor = Pick<CrmActorContext, 'actorId' | 'role' | 'tenantId'> & {
  branchId?: string | null;
};

export type CrmDomainEventBase<
  TType extends CrmDomainEventType,
  TAggregateType extends CrmDomainEventAggregateType,
  TPayload extends Record<string, unknown>,
> = {
  actor?: CrmDomainEventActor | null;
  aggregateId: string;
  aggregateType: TAggregateType;
  occurredAt: string;
  payload: TPayload;
  tenantId: string;
  type: TType;
  idempotencyKey?: string | null;
};

export type CrmAccountCreatedEvent = CrmDomainEventBase<
  'crm.account.created',
  'account',
  {
    accountId: string;
    branchId: string;
    name: string;
    ownerAgentId?: string | null;
  }
>;

export type CrmContactCreatedEvent = CrmDomainEventBase<
  'crm.contact.created',
  'contact',
  {
    branchId: string;
    contactId: string;
    email?: string | null;
    fullName: string;
  }
>;

export type CrmLeadCreatedEvent = CrmDomainEventBase<
  'crm.lead.created',
  'lead',
  {
    agentId: string;
    branchId?: string | null;
    leadId: string;
    source?: string | null;
    stage: CrmLeadStage;
    type: 'individual' | 'business';
  }
>;

export type CrmLeadConvertedEvent = CrmDomainEventBase<
  'crm.lead.converted',
  'lead',
  {
    accountId: string;
    branchId: string;
    contactId: string;
    conversionId: string;
    leadId: string;
    reason?: string | null;
  }
>;

export type CrmLeadMergedEvent = CrmDomainEventBase<
  'crm.lead.merged',
  'lead',
  {
    branchId: string;
    loserLeadId: string;
    matchReasonCodes: readonly string[];
    mergedFieldKeys: readonly string[];
    reason: string;
    winnerLeadId: string;
  }
>;

export type CrmLeadStageChangedEvent = CrmDomainEventBase<
  'crm.lead.stage_changed',
  'lead',
  {
    branchId?: string | null;
    fromStage: CrmLeadStage;
    leadId: string;
    toStage: CrmLeadStage;
  }
>;

export type CrmLeadOwnershipTransferredEvent = CrmDomainEventBase<
  'crm.lead.ownership_transferred',
  'lead',
  {
    fromAgentId: string;
    fromBranchId: string;
    leadId: string;
    reason: string;
    toAgentId: string;
    toBranchId: string;
  }
>;

export type CrmLeadActivityRecordedEvent = CrmDomainEventBase<
  'crm.lead.activity_recorded',
  'lead',
  {
    activityId: string;
    activityType: string;
    agentId: string;
    branchId?: string | null;
    leadId: string;
    occurredAt: string;
  }
>;

export type CrmDealWonEvent = CrmDomainEventBase<
  'crm.deal.won',
  'deal',
  {
    accountId?: string | null;
    agentId?: string | null;
    branchId?: string | null;
    dealId: string;
    expectedCommissionCents?: number | null;
    valueCents?: number | null;
  }
>;

export type CrmDealCreatedEvent = CrmDomainEventBase<
  'crm.deal.created',
  'deal',
  {
    accountId: string;
    agentId: string;
    branchId: string;
    contactId?: string | null;
    currencyCode: string;
    dealId: string;
    expectedCloseAt?: string | null;
    forecastCategory: 'pipeline' | 'best' | 'commit' | 'omitted' | 'closed';
    pipelineId: string;
    pipelineStageId: string;
    valueAmountMinor: number;
  }
>;

export type CrmDealStageChangedEvent = CrmDomainEventBase<
  'crm.deal.stage_changed',
  'deal',
  {
    dealId: string;
    fromStageId: string;
    isLost: false;
    isWon: false;
    pipelineId: string;
    toStageId: string;
  }
>;

export type CrmDealLostEvent = CrmDomainEventBase<
  'crm.deal.lost',
  'deal',
  {
    dealId: string;
    fromStageId: string;
    lossReasonId: string;
    pipelineId: string;
    toStageId: string;
  }
>;

export type CrmDealReopenedEvent = CrmDomainEventBase<
  'crm.deal.reopened',
  'deal',
  {
    dealId: string;
    fromStageId: string;
    pipelineId: string;
    reopenReason: string;
    toStageId: string;
  }
>;

export type CrmDomainEvent =
  | CrmAccountCreatedEvent
  | CrmContactCreatedEvent
  | CrmLeadCreatedEvent
  | CrmLeadConvertedEvent
  | CrmLeadMergedEvent
  | CrmLeadStageChangedEvent
  | CrmLeadOwnershipTransferredEvent
  | CrmLeadActivityRecordedEvent
  | CrmDealCreatedEvent
  | CrmDealStageChangedEvent
  | CrmDealWonEvent
  | CrmDealLostEvent
  | CrmDealReopenedEvent;

export const CRM_OUTBOX_EVENT_STATUSES = ['pending', 'publishing', 'published', 'failed'] as const;
export type CrmOutboxEventStatus = (typeof CRM_OUTBOX_EVENT_STATUSES)[number];

export type CrmOutboxEvent<TEvent extends CrmDomainEvent = CrmDomainEvent> = {
  aggregateId: TEvent['aggregateId'];
  aggregateType: TEvent['aggregateType'];
  availableAt: string;
  createdAt: string;
  event: TEvent;
  id: string;
  idempotencyKey?: string | null;
  lastError?: string | null;
  lockedAt?: string | null;
  lockedBy?: string | null;
  publishedAt?: string | null;
  retryCount: number;
  status: CrmOutboxEventStatus;
  tenantId: TEvent['tenantId'];
  type: TEvent['type'];
};

export type CreateCrmOutboxEventData<TEvent extends CrmDomainEvent = CrmDomainEvent> = {
  availableAt: string;
  event: TEvent;
  id: string;
  idempotencyKey?: string | null;
};
