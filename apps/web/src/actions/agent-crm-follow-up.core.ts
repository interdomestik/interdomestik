import {
  authorizeCrmLeadFollowUpAction,
  completeCrmLeadFollowUp,
  type CrmLeadFollowUpResult,
} from '@interdomestik/domain-crm/leads/follow-up';
import type { CrmLeadActivity } from '@interdomestik/domain-crm/leads/types';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { CrmTask } from '@interdomestik/domain-crm/tasks';
import { ensureTenantId, type SessionWithTenant } from '@interdomestik/shared-auth';
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { LOCALES } from '@/i18n/locales';
import {
  crmLeadFollowUpRepository,
  listCrmLeadFollowUpActivitiesForLead,
  listCrmLeadFollowUpTasksForLead,
} from '@/adapters/crm/lead-follow-up-repository';
import {
  completeCrmTaskCore,
  createCrmTaskCore,
  type CrmTaskBoundaryResult,
} from './crm-tasks.core';

type AgentCrmFollowUpSession = NonNullable<SessionWithTenant>;
type AgentCrmFollowUpActionFailure = Extract<AgentCrmFollowUpActionResult, { success: false }>;

export type AgentCrmFollowUpActionResult =
  | CrmLeadFollowUpResult
  | { success: false; error: 'unauthorized' | 'missing_branch_scope' }
  | { success: false; error: 'conflict' | 'repository_failure'; reason: string }
  | { success: false; error: 'rate_limited'; retryAfter?: number }
  | { success: false; error: 'invalid_input'; reason: 'missing_task_lifecycle_version' };

const FOLLOW_UP_TASK_LABEL = 'Follow up';
const FOLLOW_UP_TASK_ID_PREFIX = 'lead-follow-up';

type TaskBackedFollowUpActivity = CrmLeadActivity & {
  readonly expectedLifecycleVersion?: number | null;
  readonly followUpSource?: 'legacy_activity' | 'crm_task';
};

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

function parseTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
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

function taskToFollowUpActivity(task: CrmTask): CrmLeadActivity {
  const agentId =
    task.assignedTo.kind === 'actor' && task.assignedTo.role === 'agent'
      ? task.assignedTo.actorId
      : task.createdBy.actorId;
  return {
    agentId,
    branchId: task.branchId,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    description: null,
    expectedLifecycleVersion: task.lifecycleVersion,
    followUpSource: 'crm_task',
    id: task.taskId,
    leadId: task.subjectReference.id,
    occurredAt: task.createdAt,
    scheduledAt: task.dueAt,
    subject: FOLLOW_UP_TASK_LABEL,
    tenantId: task.tenantId,
    type: 'follow_up',
  } as CrmLeadActivity;
}

function mapTaskResult(result: CrmTaskBoundaryResult): AgentCrmFollowUpActionResult {
  if (result.outcome === 'success' || result.outcome === 'idempotent_replay') {
    return { success: true, activity: taskToFollowUpActivity(result.task) };
  }
  if (result.outcome === 'not_found') return { success: false, error: 'not_found' };
  if (result.outcome === 'unauthorized') return { success: false, error: 'unauthorized' };
  if (result.outcome === 'rate_limited') {
    return { success: false, error: 'rate_limited', retryAfter: result.retryAfter };
  }
  if (result.outcome === 'invalid_input') {
    return { success: false, error: 'invalid_input', reason: 'invalid_scheduled_at' };
  }
  if (result.outcome === 'forbidden') {
    return { success: false, error: 'forbidden', reason: 'branch_scope' };
  }
  return { success: false, error: result.outcome, reason: result.reason };
}

function hasSameScheduledAt(activity: CrmLeadActivity, scheduledAt: string): boolean {
  return parseTimestamp(activity.scheduledAt) === scheduledAt && activity.completedAt == null;
}

async function completeShadowedLegacyFollowUps(params: {
  actor: CrmActorContext;
  leadId: string;
  scheduledAt: string | null;
}) {
  const scheduledAt = params.scheduledAt;
  if (!scheduledAt) return;

  const legacyActivities = await listCrmLeadFollowUpActivitiesForLead({
    actor: params.actor,
    leadId: params.leadId,
  });
  const shadowedActivities = legacyActivities.filter(activity =>
    hasSameScheduledAt(activity, scheduledAt)
  );

  for (const activity of shadowedActivities) {
    await completeCrmLeadFollowUp(
      {
        activityId: activity.id,
        actor: params.actor,
        leadId: params.leadId,
      },
      crmLeadFollowUpRepository,
      { now: () => new Date().toISOString() }
    );
  }
}

export async function scheduleAgentLeadFollowUpCore(params: {
  description?: string | null;
  leadId: string;
  requestHeaders?: Headers;
  scheduledAt?: string | null;
  session: AgentCrmFollowUpSession | null;
  subject: string;
}): Promise<AgentCrmFollowUpActionResult> {
  const actor = requireAgentActor(params.session);
  if ('success' in actor) {
    return actor;
  }

  const now = new Date().toISOString();
  const scheduledAt = parseTimestamp(params.scheduledAt?.trim() || now);
  if (!scheduledAt) {
    return { success: false, error: 'invalid_input', reason: 'invalid_scheduled_at' };
  }

  const lead = await crmLeadFollowUpRepository.findById({ actor, leadId: params.leadId });
  if (!lead) {
    return { success: false, error: 'not_found' };
  }

  const authorization = authorizeCrmLeadFollowUpAction(actor, lead);
  if (!authorization.allowed) {
    return { success: false, error: 'forbidden', reason: authorization.reason };
  }

  const legacyActivities = await listCrmLeadFollowUpActivitiesForLead({
    actor,
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
  source?: string | null;
}): Promise<AgentCrmFollowUpActionResult> {
  const actor = requireAgentActor(params.session);
  if ('success' in actor) {
    return actor;
  }

  if (params.source === 'crm_task') {
    const expectedLifecycleVersion = Number(params.expectedLifecycleVersion);
    if (!Number.isInteger(expectedLifecycleVersion) || expectedLifecycleVersion < 1) {
      return { success: false, error: 'invalid_input', reason: 'missing_task_lifecycle_version' };
    }

    const taskBackedFollowUps = (await listCrmLeadFollowUpTasksForLead({
      actor,
      leadId: params.leadId,
    })) as TaskBackedFollowUpActivity[];
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
        requestHeaders: params.requestHeaders,
        session: params.session as AgentCrmFollowUpSession,
      })
    );
    if (result.success) {
      await completeShadowedLegacyFollowUps({
        actor,
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
    crmLeadFollowUpRepository,
    { now: () => new Date().toISOString() }
  );

  if (result.success) {
    revalidateAgentLeadFollowUpPaths(params.leadId);
  }

  return result;
}
