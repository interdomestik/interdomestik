import type { CrmActorContext } from '../context';
import type { CrmLead, CrmLeadActivity } from './types';
import type { CrmLeadRepository } from './repository';

export const CRM_LEAD_STAGES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;
export type CrmLeadStage = (typeof CRM_LEAD_STAGES)[number];

export const CRM_LEAD_ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note', 'other'] as const;
export type CrmLeadActivityType = (typeof CRM_LEAD_ACTIVITY_TYPES)[number];
export type CrmLeadType = 'individual' | 'business';

export type CrmLeadMutationDenialReason =
  | 'tenant_scope'
  | 'agent_scope'
  | 'branch_scope'
  | 'role_scope';

export type CreateCrmLeadInput = {
  actor: CrmActorContext;
  companyName?: string | null;
  email?: string | null;
  fullName?: string | null;
  leadId: string;
  notes?: string | null;
  phone?: string | null;
  source?: string | null;
  stage: string;
  tenantId: string;
  type: string;
};

export type CreateCrmLeadData = Omit<
  CreateCrmLeadInput,
  'actor' | 'stage' | 'tenantId' | 'type'
> & {
  stage: CrmLeadStage;
  type: CrmLeadType;
};

export type UpdateCrmLeadStageInput = {
  actor: CrmActorContext;
  leadId: string;
  stage: string;
};

export type RecordCrmLeadActivityInput = {
  actor: CrmActorContext;
  activityId: string;
  leadId: string;
  occurredAt: string;
  summary: string;
  type: string;
};

export type CrmLeadMutationResult =
  | { success: true; lead: CrmLead }
  | { success: true; activity: CrmLeadActivity }
  | { success: false; error: 'not_found' }
  | {
      success: false;
      error: 'invalid_input';
      reason: 'invalid_activity_type' | 'invalid_occurred_at' | 'invalid_stage' | 'invalid_type';
    }
  | { success: false; error: 'forbidden'; reason: CrmLeadMutationDenialReason };

export interface CrmLeadMutationRepository extends Pick<CrmLeadRepository, 'findById'> {
  createLead(params: { actor: CrmActorContext; lead: CreateCrmLeadData }): Promise<CrmLead>;
  recordActivity(params: {
    activity: RecordCrmLeadActivityInput;
    actor: CrmActorContext;
  }): Promise<CrmLeadActivity>;
  updateStage(params: {
    actor: CrmActorContext;
    leadId: string;
    stage: CrmLeadStage;
  }): Promise<CrmLead | null>;
}

function isLeadStage(value: string): value is CrmLeadStage {
  return CRM_LEAD_STAGES.includes(value as CrmLeadStage);
}

function isLeadActivityType(value: string): value is CrmLeadActivityType {
  return CRM_LEAD_ACTIVITY_TYPES.includes(value as CrmLeadActivityType);
}

function isParseableDate(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

function authorizeAgent(actor: CrmActorContext): CrmLeadMutationDenialReason | null {
  if (actor.role !== 'agent') return 'role_scope';
  if (actor.scope.agentId && actor.scope.agentId !== actor.actorId) return 'agent_scope';
  return null;
}

function authorizeExistingLead(
  actor: CrmActorContext,
  lead: Pick<CrmLead, 'agentId' | 'branchId' | 'tenantId'>
): CrmLeadMutationDenialReason | null {
  const actorDenied = authorizeAgent(actor);
  if (actorDenied) return actorDenied;
  if (lead.tenantId !== actor.tenantId) return 'tenant_scope';
  if (lead.agentId !== actor.actorId) return 'agent_scope';
  if (!actor.scope.branchId || !lead.branchId || lead.branchId !== actor.scope.branchId) {
    return 'branch_scope';
  }
  return null;
}

export async function createCrmLead(
  input: CreateCrmLeadInput,
  repository: CrmLeadMutationRepository
): Promise<CrmLeadMutationResult> {
  const actorDenied = authorizeAgent(input.actor);
  if (actorDenied) return { success: false, error: 'forbidden', reason: actorDenied };
  if (input.tenantId !== input.actor.tenantId) {
    return { success: false, error: 'forbidden', reason: 'tenant_scope' };
  }
  if (!input.actor.scope.branchId) {
    return { success: false, error: 'forbidden', reason: 'branch_scope' };
  }
  if (input.type !== 'individual' && input.type !== 'business') {
    return { success: false, error: 'invalid_input', reason: 'invalid_type' };
  }
  if (!isLeadStage(input.stage))
    return { success: false, error: 'invalid_input', reason: 'invalid_stage' };
  const leadInput: CreateCrmLeadData = {
    companyName: input.companyName,
    email: input.email,
    fullName: input.fullName,
    leadId: input.leadId,
    notes: input.notes,
    phone: input.phone,
    source: input.source,
    stage: input.stage,
    type: input.type,
  };
  const lead = await repository.createLead({
    actor: input.actor,
    lead: leadInput,
  });
  return { success: true, lead };
}

export async function updateCrmLeadStage(
  input: UpdateCrmLeadStageInput,
  repository: CrmLeadMutationRepository
): Promise<CrmLeadMutationResult> {
  if (!isLeadStage(input.stage))
    return { success: false, error: 'invalid_input', reason: 'invalid_stage' };
  const lead = await repository.findById({ actor: input.actor, leadId: input.leadId });
  if (!lead) return { success: false, error: 'not_found' };
  const denied = authorizeExistingLead(input.actor, lead);
  if (denied) return { success: false, error: 'forbidden', reason: denied };
  const updated = await repository.updateStage({
    actor: input.actor,
    leadId: input.leadId,
    stage: input.stage,
  });
  return updated ? { success: true, lead: updated } : { success: false, error: 'not_found' };
}

export async function recordCrmLeadActivity(
  input: RecordCrmLeadActivityInput,
  repository: CrmLeadMutationRepository
): Promise<CrmLeadMutationResult> {
  if (!isLeadActivityType(input.type)) {
    return { success: false, error: 'invalid_input', reason: 'invalid_activity_type' };
  }
  if (!isParseableDate(input.occurredAt)) {
    return { success: false, error: 'invalid_input', reason: 'invalid_occurred_at' };
  }
  const lead = await repository.findById({ actor: input.actor, leadId: input.leadId });
  if (!lead) return { success: false, error: 'not_found' };
  const denied = authorizeExistingLead(input.actor, lead);
  if (denied) return { success: false, error: 'forbidden', reason: denied };
  const activity = await repository.recordActivity({ actor: input.actor, activity: input });
  return { success: true, activity };
}
