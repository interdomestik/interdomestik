import {
  recordCrmLeadActivity,
  type CrmLeadMutationResult,
} from '@interdomestik/domain-crm/leads/mutations';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { nanoid } from 'nanoid';
import { crmLeadMutationRepository } from '@/adapters/crm/lead-mutation-repository';

function mapActivityError(result: Extract<CrmLeadMutationResult, { success: false }>) {
  if (result.error === 'not_found') {
    return { error: 'Not found' as const };
  }
  if (
    result.error === 'forbidden' &&
    (result.reason === 'agent_scope' || result.reason === 'branch_scope')
  ) {
    return { error: 'Not found' as const };
  }
  return { error: result.error === 'forbidden' ? 'Forbidden' : 'Invalid activity' };
}

export async function logActivityCore(
  actor: CrmActorContext,
  leadId: string,
  type: string,
  summary: string
) {
  const occurredAt = new Date().toISOString();
  const result = await recordCrmLeadActivity(
    { activityId: nanoid(), actor, leadId, occurredAt, summary, type },
    crmLeadMutationRepository
  );
  return result.success ? { success: true as const } : mapActivityError(result);
}
