import type { CrmActorContext } from '../context';
import type { CrmLeadActivity } from '../leads/types';

export const AGENT_CRM_LEAD_ACTIVITY_MAX_ROWS = 100;

export type AgentCrmLeadActivityAuthorizationDenialReason =
  | 'agent_scope'
  | 'branch_scope'
  | 'role_scope'
  | 'tenant_scope';

export type AgentCrmLeadActivityLead = {
  agentId: string;
  branchId?: string | null;
  id: string;
  tenantId: string;
};

export type AgentCrmLeadActivity = Omit<CrmLeadActivity, 'description'> & {
  description: string | null;
  agent?: { name: string | null } | null;
};

export type AgentCrmLeadActivityRepository<
  TLead extends AgentCrmLeadActivityLead = AgentCrmLeadActivityLead,
  TActivity extends AgentCrmLeadActivity = AgentCrmLeadActivity,
> = {
  findAgentLead(params: { actor: CrmActorContext; leadId: string }): Promise<TLead | null>;
  listAgentLeadActivities(params: {
    actor: CrmActorContext;
    lead: TLead;
    limit: number;
  }): Promise<readonly TActivity[]>;
};

export type AgentCrmLeadActivityResult<
  TActivity extends AgentCrmLeadActivity = AgentCrmLeadActivity,
> =
  | { success: true; activities: TActivity[] }
  | { success: false; error: 'not_found' }
  | {
      success: false;
      error: 'forbidden';
      reason: AgentCrmLeadActivityAuthorizationDenialReason;
    };

function normalizeLimit(limit: number | null | undefined): number {
  if (!Number.isFinite(limit ?? AGENT_CRM_LEAD_ACTIVITY_MAX_ROWS)) {
    return AGENT_CRM_LEAD_ACTIVITY_MAX_ROWS;
  }
  return Math.max(
    1,
    Math.min(limit ?? AGENT_CRM_LEAD_ACTIVITY_MAX_ROWS, AGENT_CRM_LEAD_ACTIVITY_MAX_ROWS)
  );
}

export function authorizeAgentCrmLeadActivityRead(
  actor: CrmActorContext,
  lead?: AgentCrmLeadActivityLead,
  activity?: AgentCrmLeadActivity
): AgentCrmLeadActivityAuthorizationDenialReason | null {
  if (actor.role !== 'agent') return 'role_scope';
  if (actor.scope.agentId && actor.scope.agentId !== actor.actorId) return 'agent_scope';
  if (!actor.scope.branchId) return 'branch_scope';

  if (lead) {
    if (lead.tenantId !== actor.tenantId) return 'tenant_scope';
    if (lead.agentId !== actor.actorId) return 'agent_scope';
    if (lead.branchId !== actor.scope.branchId) return 'branch_scope';
  }

  if (activity) {
    if (activity.tenantId !== actor.tenantId) return 'tenant_scope';
    if (activity.agentId !== actor.actorId) return 'agent_scope';
    if (lead && activity.leadId !== lead.id) return 'agent_scope';
    if (activity.branchId !== actor.scope.branchId) return 'branch_scope';
  }

  return null;
}

export async function getAgentCrmLeadActivities<
  TLead extends AgentCrmLeadActivityLead,
  TActivity extends AgentCrmLeadActivity,
>(
  input: { actor: CrmActorContext; leadId: string; limit?: number },
  repository: AgentCrmLeadActivityRepository<TLead, TActivity>
): Promise<AgentCrmLeadActivityResult<TActivity>> {
  const actorDenied = authorizeAgentCrmLeadActivityRead(input.actor);
  if (actorDenied) {
    return { success: false, error: 'forbidden', reason: actorDenied };
  }

  const lead = await repository.findAgentLead({ actor: input.actor, leadId: input.leadId });
  if (!lead) {
    return { success: false, error: 'not_found' };
  }

  const leadDenied = authorizeAgentCrmLeadActivityRead(input.actor, lead);
  if (leadDenied) {
    return { success: false, error: 'forbidden', reason: leadDenied };
  }

  const activities = await repository.listAgentLeadActivities({
    actor: input.actor,
    lead,
    limit: normalizeLimit(input.limit),
  });

  return {
    success: true,
    activities: activities.filter(
      activity => !authorizeAgentCrmLeadActivityRead(input.actor, lead, activity)
    ),
  };
}
