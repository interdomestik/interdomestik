import {
  getAgentCrmLeadDetail,
  type AgentCrmLeadDetailAuthorizationDenialReason,
} from '@interdomestik/domain-crm/lead-details';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import {
  createCrmLeadDetailRepository,
  type AgentCrmLeadDetailDealRow,
  type AgentCrmLeadDetailLeadRow,
} from '@/adapters/crm/lead-detail-repository';

export type AgentLeadDetails = AgentCrmLeadDetailLeadRow | null;

export type AgentLeadDealRow = AgentCrmLeadDetailDealRow;

export type AgentLeadDetailsResult =
  | { kind: 'ok'; lead: NonNullable<AgentLeadDetails>; deals: AgentLeadDealRow[] }
  | { kind: 'not_found' };

export class AgentLeadDetailsAccessDeniedError extends Error {
  constructor(readonly reason: AgentCrmLeadDetailAuthorizationDenialReason) {
    super(`CRM lead detail read denied: ${reason}`);
    this.name = 'AgentLeadDetailsAccessDeniedError';
  }
}

export async function getAgentLeadDetailsCore(args: {
  actor: CrmActorContext;
  authority: TenantAuthority;
  leadId: string;
}): Promise<AgentLeadDetailsResult> {
  const result = await getAgentCrmLeadDetail(
    { actor: args.actor, leadId: args.leadId },
    createCrmLeadDetailRepository(args.authority)
  );

  if (result.success) {
    return { kind: 'ok', lead: result.lead, deals: result.deals };
  }

  if (result.error === 'not_found') {
    return { kind: 'not_found' };
  }

  throw new AgentLeadDetailsAccessDeniedError(result.reason);
}
