import type { CrmActorContext } from '../context';
import type { CrmLeadStage } from '../leads/mutations';

export const CRM_DOMAIN_EVENT_TYPES = [
  'crm.account.created',
  'crm.contact.created',
  'crm.lead.created',
  'crm.lead.converted',
  'crm.lead.stage_changed',
  'crm.lead.ownership_transferred',
  'crm.lead.activity_recorded',
  'crm.deal.won',
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

export type CrmDomainEvent =
  | CrmAccountCreatedEvent
  | CrmContactCreatedEvent
  | CrmLeadCreatedEvent
  | CrmLeadConvertedEvent
  | CrmLeadStageChangedEvent
  | CrmLeadOwnershipTransferredEvent
  | CrmLeadActivityRecordedEvent
  | CrmDealWonEvent;

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
