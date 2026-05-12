import type { CrmActorContext } from '../context';

export type AgentCrmLeadDetailAuthorizationDenialReason =
  | 'agent_scope'
  | 'branch_scope'
  | 'role_scope'
  | 'tenant_scope';

export type AgentCrmLeadDetailLead = {
  agentId: string;
  branchId?: string | null;
  id: string;
  tenantId: string;
};

export type AgentCrmLeadDetailDeal = {
  agentId: string;
  leadId: string;
  tenantId: string;
};

export type AgentCrmLeadDetailRepository<
  TLead extends AgentCrmLeadDetailLead = AgentCrmLeadDetailLead,
  TDeal extends AgentCrmLeadDetailDeal = AgentCrmLeadDetailDeal,
> = {
  findAgentLead(params: { actor: CrmActorContext; leadId: string }): Promise<TLead | null>;
  listAgentLeadDeals(params: { actor: CrmActorContext; lead: TLead }): Promise<readonly TDeal[]>;
};

export type AgentCrmLeadDetailResult<
  TLead extends AgentCrmLeadDetailLead = AgentCrmLeadDetailLead,
  TDeal extends AgentCrmLeadDetailDeal = AgentCrmLeadDetailDeal,
> =
  | { success: true; lead: TLead; deals: TDeal[] }
  | { success: false; error: 'not_found' }
  | {
      success: false;
      error: 'forbidden';
      reason: AgentCrmLeadDetailAuthorizationDenialReason;
    };

export function authorizeAgentCrmLeadDetailRead(
  actor: CrmActorContext,
  lead?: AgentCrmLeadDetailLead
): AgentCrmLeadDetailAuthorizationDenialReason | null {
  if (actor.role !== 'agent') return 'role_scope';
  if (actor.scope.agentId && actor.scope.agentId !== actor.actorId) return 'agent_scope';
  if (!actor.scope.branchId) return 'branch_scope';

  if (!lead) return null;

  if (lead.tenantId !== actor.tenantId) return 'tenant_scope';
  if (lead.agentId !== actor.actorId) return 'agent_scope';
  if (lead.branchId !== actor.scope.branchId) return 'branch_scope';
  return null;
}

export async function getAgentCrmLeadDetail<
  TLead extends AgentCrmLeadDetailLead,
  TDeal extends AgentCrmLeadDetailDeal,
>(
  input: { actor: CrmActorContext; leadId: string },
  repository: AgentCrmLeadDetailRepository<TLead, TDeal>
): Promise<AgentCrmLeadDetailResult<TLead, TDeal>> {
  const actorDenied = authorizeAgentCrmLeadDetailRead(input.actor);
  if (actorDenied) {
    return { success: false, error: 'forbidden', reason: actorDenied };
  }

  const lead = await repository.findAgentLead({ actor: input.actor, leadId: input.leadId });
  if (!lead) {
    return { success: false, error: 'not_found' };
  }

  const leadDenied = authorizeAgentCrmLeadDetailRead(input.actor, lead);
  if (leadDenied) {
    return { success: false, error: 'forbidden', reason: leadDenied };
  }

  const deals = await repository.listAgentLeadDeals({ actor: input.actor, lead });
  return { success: true, lead, deals: [...deals] };
}
