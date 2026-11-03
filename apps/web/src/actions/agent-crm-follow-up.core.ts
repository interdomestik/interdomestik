import {
  authorizeCrmLeadFollowUpAction,
  completeCrmLeadFollowUp,
  type CrmLeadFollowUpResult,
} from '@interdomestik/domain-crm/leads/follow-up';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { ensureTenantId, type SessionWithTenant } from '@interdomestik/shared-auth';
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { LOCALES } from '@/i18n/locales';
import {
  createCrmLeadFollowUpRepository,
  listCrmLeadFollowUpActivitiesForLead,
  listCrmLeadFollowUpTasksForLead,
} from '@/adapters/crm/lead-follow-up-repository';
import { completeCrmTaskCore, createCrmTaskCore } from './crm-tasks.core';
import {
  parseTimestamp,
  mapTaskResult,
  hasSameScheduledAt,
  completeShadowedLegacyFollowUps,
} from './agent-crm-follow-up-tasks';

type AgentCrmFollowUpSession = NonNullable<SessionWithTenant>;
type AgentCrmFollowUpActionFailure = Extract<AgentCrmFollowUpActionResult, { success: false }>;

export type AgentCrmFollowUpActionResult =
  | CrmLeadFollowUpResult
  | { success: false; error: 'unauthorized' | 'missing_branch_scope' }
  | { success: false; error: 'conflict' | 'repository_failure'; reason: string }
  | { success: false; error: 'rate_limited'; retryAfter?: number }
  | { success: false; error: 'invalid_input'; reason: string }
  | { success: false; error: 'forbidden'; reason: string };
const FOLLOW_UP_TASK_ID_PREFIX = 'lead-follow-up';

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
  session: AgentCrmFollowUpSession | null,
  authority: TenantAuthority | null
): AgentCrmFollowUpActionFailure | { actor: CrmActorContext; authority: TenantAuthority } {
  const actor = createAgentCrmActorContext(session);
  if (!actor || !authority) {
    return { success: false, error: 'unauthorized' };
  }

  if (!actor.scope.branchId) {
    return { success: false, error: 'missing_branch_scope' };
  }

  return { actor, authority };
}

function hashStructuralId(material: string): string {
  return createHash('sha256').update(material).digest('hex').slice(0, 48);
}

function taskFollowUpKey(params: {
  actor: CrmActorContext;
  leadId: string;
  scheduledAt: string;
}): string {
  return hashStructuralId(
    [params.actor.tenantId, params.actor.actorId, params.leadId, params.scheduledAt].join(':')
  );
}

export async function scheduleAgentLeadFollowUpCore(params: {
  description?: string | null;
  leadId: string;
  requestHeaders?: Headers;
  scheduledAt?: string | null;
  session: AgentCrmFollowUpSession | null;
  authority: TenantAuthority | null;
  subject: string;
}): Promise<AgentCrmFollowUpActionResult> {
  const agent = requireAgentActor(params.session, params.authority);
  if ('success' in agent) {
    return agent;
  }
  const { actor, authority } = agent;

  const now = new Date().toISOString();
  const scheduledAt = parseTimestamp(params.scheduledAt?.trim() || now);
  if (!scheduledAt) {
    return { success: false, error: 'invalid_input', reason: 'invalid_scheduled_at' };
  }

  const lead = await createCrmLeadFollowUpRepository(authority).findById({
    actor,
    leadId: params.leadId,
  });
  if (!lead) {
    return { success: false, error: 'not_found' };
  }

  const authorization = authorizeCrmLeadFollowUpAction(actor, lead);
  if (!authorization.allowed) {
    return { success: false, error: 'forbidden', reason: authorization.reason };
  }

  const legacyActivities = await listCrmLeadFollowUpActivitiesForLead({
    actor,
    authority,
    leadId: params.leadId,
  });
  const existingLegacy = legacyActivities.find(activity =>
    hasSameScheduledAt(activity, scheduledAt)
  );
  if (existingLegacy) {
    revalidateAgentLeadFollowUpPaths(params.leadId);
    return { success: true, activity: existingLegacy };
  }

  const taskKey = taskFollowUpKey({ actor, leadId: params.leadId, scheduledAt });
  const result = mapTaskResult(
    await createCrmTaskCore({
      input: {
        assignedTo: {
          actorId: actor.actorId,
          branchId: actor.scope.branchId,
          kind: 'actor',
          role: 'agent',
          tenantId: actor.tenantId,
        },
        createReasonCode: 'follow_up',
        dueAt: scheduledAt,
        idempotencyKey: `${FOLLOW_UP_TASK_ID_PREFIX}:schedule:${taskKey}`,
        priority: 'normal',
        subjectReference: { id: params.leadId, kind: 'lead' },
        taskId: `${FOLLOW_UP_TASK_ID_PREFIX}:${taskKey}`,
      },
      authority,
      requestHeaders: params.requestHeaders,
      session: params.session as AgentCrmFollowUpSession,
    })
  );

  if (result.success) {
    revalidateAgentLeadFollowUpPaths(params.leadId);
  }

  return result;
}

export async function completeAgentLeadFollowUpCore(params: {
  activityId: string;
  expectedLifecycleVersion?: number | string | null;
  leadId: string;
  requestHeaders?: Headers;
  session: AgentCrmFollowUpSession | null;
  authority: TenantAuthority | null;
  source?: string | null;
}): Promise<AgentCrmFollowUpActionResult> {
  const agent = requireAgentActor(params.session, params.authority);
  if ('success' in agent) {
    return agent;
  }
  const { actor, authority } = agent;

  if (params.source === 'crm_task') {
    const expectedLifecycleVersion = Number(params.expectedLifecycleVersion);
    if (!Number.isInteger(expectedLifecycleVersion) || expectedLifecycleVersion < 1) {
      return { success: false, error: 'invalid_input', reason: 'missing_task_lifecycle_version' };
    }

    const taskBackedFollowUps = await listCrmLeadFollowUpTasksForLead({
      actor,
      authority,
      leadId: params.leadId,
    });
    const taskBackedFollowUp = taskBackedFollowUps.find(
      activity => activity.id === params.activityId && activity.followUpSource === 'crm_task'
    );
    if (!taskBackedFollowUp) {
      return { success: false, error: 'not_found' };
    }
    if (taskBackedFollowUp.expectedLifecycleVersion !== expectedLifecycleVersion) {
      return { success: false, error: 'conflict', reason: 'lifecycle_conflict' };
    }

    const result = mapTaskResult(
      await completeCrmTaskCore({
        input: {
          expectedLifecycleVersion,
          reasonCode: 'resolved',
          taskId: params.activityId,
        },
        authority,
        requestHeaders: params.requestHeaders,
        session: params.session as AgentCrmFollowUpSession,
      })
    );
    if (result.success) {
      await completeShadowedLegacyFollowUps({
        actor,
        authority,
        leadId: params.leadId,
        scheduledAt: taskBackedFollowUp.scheduledAt ?? null,
      });
      revalidateAgentLeadFollowUpPaths(params.leadId);
    }
    return result;
  }

  const result = await completeCrmLeadFollowUp(
    {
      activityId: params.activityId,
      actor,
      leadId: params.leadId,
    },
    createCrmLeadFollowUpRepository(authority),
    { now: () => new Date().toISOString() }
  );

  if (result.success) {
    revalidateAgentLeadFollowUpPaths(params.leadId);
  }

  return result;
}
