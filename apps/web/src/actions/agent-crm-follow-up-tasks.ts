import {
  completeCrmLeadFollowUp,
  type CrmLeadFollowUpActivityLike,
} from '@interdomestik/domain-crm/leads/follow-up';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { CrmTask } from '@interdomestik/domain-crm/tasks';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import {
  createCrmLeadFollowUpRepository,
  listCrmLeadFollowUpActivitiesForLead,
} from '@/adapters/crm/lead-follow-up-repository';
import { type CrmTaskBoundaryResult } from './crm-tasks.core';
import type { AgentCrmFollowUpActionResult } from './agent-crm-follow-up.core';
import { forEachInOrder } from '@/lib/in-order';

export const FOLLOW_UP_TASK_LABEL = 'Follow up';

export function parseTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function taskToFollowUpActivity(task: CrmTask): CrmLeadFollowUpActivityLike {
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
  };
}

export function mapTaskResult(result: CrmTaskBoundaryResult): AgentCrmFollowUpActionResult {
  if (result.outcome === 'success' || result.outcome === 'idempotent_replay') {
    return { success: true, activity: taskToFollowUpActivity(result.task) };
  }
  if (result.outcome === 'not_found') return { success: false, error: 'not_found' };
  if (result.outcome === 'unauthorized') return { success: false, error: 'unauthorized' };
  if (result.outcome === 'rate_limited') {
    return { success: false, error: 'rate_limited', retryAfter: result.retryAfter };
  }
  if (result.outcome === 'invalid_input') {
    return { success: false, error: 'invalid_input', reason: result.reason };
  }
  if (result.outcome === 'forbidden') {
    return { success: false, error: 'forbidden', reason: result.reason };
  }
  return { success: false, error: result.outcome, reason: result.reason };
}

export function hasSameScheduledAt(
  activity: CrmLeadFollowUpActivityLike,
  scheduledAt: string
): boolean {
  return parseTimestamp(activity.scheduledAt) === scheduledAt && activity.completedAt == null;
}

export async function completeShadowedLegacyFollowUps(params: {
  actor: CrmActorContext;
  authority: TenantAuthority;
  leadId: string;
  scheduledAt: string | null;
}) {
  const scheduledAt = params.scheduledAt;
  if (!scheduledAt) return;

  const legacyActivities = await listCrmLeadFollowUpActivitiesForLead({
    actor: params.actor,
    authority: params.authority,
    leadId: params.leadId,
  });
  const shadowedActivities = legacyActivities.filter(activity =>
    hasSameScheduledAt(activity, scheduledAt)
  );

  await forEachInOrder(shadowedActivities, async activity => {
    await completeCrmLeadFollowUp(
      {
        activityId: activity.id,
        actor: params.actor,
        leadId: params.leadId,
      },
      createCrmLeadFollowUpRepository(params.authority),
      { now: () => new Date().toISOString() }
    );
  });
}
