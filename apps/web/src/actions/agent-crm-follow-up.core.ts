import {
  completeCrmLeadFollowUp,
  scheduleCrmLeadFollowUp,
  type CrmLeadFollowUpResult,
} from '@interdomestik/domain-crm/leads/follow-up';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { ensureTenantId, type SessionWithTenant } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';

import { LOCALES } from '@/i18n/locales';
import { crmLeadFollowUpRepository } from '@/lib/domain-crm/lead-follow-up-repository';

type AgentCrmFollowUpSession = NonNullable<SessionWithTenant>;
type AgentCrmFollowUpActionFailure = Extract<AgentCrmFollowUpActionResult, { success: false }>;

export type AgentCrmFollowUpActionResult =
  | CrmLeadFollowUpResult
  | { success: false; error: 'unauthorized' | 'missing_branch_scope' };

function revalidateAgentLeadFollowUpPaths(leadId: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}/agent/crm`);
    revalidatePath(`/${locale}/agent/leads/${leadId}`);
  }
}

export function createAgentCrmActorContext(
  session: AgentCrmFollowUpSession | null
): CrmActorContext | null {
  if (!session?.user?.id || session.user.role !== 'agent') {
    return null;
  }

  const tenantId = ensureTenantId(session);
  return {
    actorId: session.user.id,
    role: 'agent',
    scope: {
      agentId: session.user.id,
      branchId: session.user.branchId ?? null,
    },
    tenantId,
  };
}

function requireAgentActor(
  session: AgentCrmFollowUpSession | null
): AgentCrmFollowUpActionFailure | CrmActorContext {
  const actor = createAgentCrmActorContext(session);
  if (!actor) {
    return { success: false, error: 'unauthorized' };
  }

  if (!actor.scope.branchId) {
    return { success: false, error: 'missing_branch_scope' };
  }

  return actor;
}

export async function scheduleAgentLeadFollowUpCore(params: {
  description?: string | null;
  leadId: string;
  scheduledAt?: string | null;
  session: AgentCrmFollowUpSession | null;
  subject: string;
}): Promise<AgentCrmFollowUpActionResult> {
  const actor = requireAgentActor(params.session);
  if ('success' in actor) {
    return actor;
  }

  const now = new Date().toISOString();

  const result = await scheduleCrmLeadFollowUp(
    {
      actor,
      description: params.description,
      leadId: params.leadId,
      scheduledAt: params.scheduledAt?.trim() || now,
      subject: params.subject,
    },
    crmLeadFollowUpRepository,
    {
      activityId: () => nanoid(),
      now: () => now,
    }
  );

  if (result.success) {
    revalidateAgentLeadFollowUpPaths(params.leadId);
  }

  return result;
}

export async function completeAgentLeadFollowUpCore(params: {
  activityId: string;
  leadId: string;
  session: AgentCrmFollowUpSession | null;
}): Promise<AgentCrmFollowUpActionResult> {
  const actor = requireAgentActor(params.session);
  if ('success' in actor) {
    return actor;
  }

  const result = await completeCrmLeadFollowUp(
    {
      activityId: params.activityId,
      actor,
      leadId: params.leadId,
    },
    crmLeadFollowUpRepository,
    { now: () => new Date().toISOString() }
  );

  if (result.success) {
    revalidateAgentLeadFollowUpPaths(params.leadId);
  }

  return result;
}
