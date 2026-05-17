import {
  updateCrmLeadStage,
  type CrmLeadMutationResult,
} from '@interdomestik/domain-crm/leads/mutations';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { crmLeadMutationRepository } from '@/adapters/crm/lead-mutation-repository';

function mapStageError(result: Extract<CrmLeadMutationResult, { success: false }>) {
  if (result.error === 'not_found') {
    return { error: 'Not found' as const };
  }
  if (
    result.error === 'forbidden' &&
    (result.reason === 'agent_scope' || result.reason === 'branch_scope')
  ) {
    return { error: 'Not found' as const };
  }
  if (result.error === 'invalid_input') {
    return { error: 'Invalid stage' as const };
  }
  return { error: 'Forbidden' as const };
}

export async function updateLeadStatusCore(actor: CrmActorContext, leadId: string, stage: string) {
  const result = await updateCrmLeadStage({ actor, leadId, stage }, crmLeadMutationRepository);
  return result.success ? { success: true as const } : mapStageError(result);
}
