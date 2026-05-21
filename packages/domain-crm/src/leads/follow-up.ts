import type { CrmActorContext } from '../context';
import type { CrmLeadRepository } from './repository';
import type { CrmLead, CrmLeadActivity } from './types';

export const CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE = 'follow_up' as const;

export type CrmLeadNextAction =
  | { kind: 'none' }
  | {
      activityId: string;
      description: string | null;
      expectedLifecycleVersion?: number | null;
      isOverdue: boolean;
      kind: 'follow_up_due' | 'follow_up_scheduled';
      leadId: string;
      scheduledAt: string;
      source?: 'legacy_activity' | 'crm_task';
      subject: string;
    };

export type CrmLeadFollowUpAuthorizationDenialReason =
  | 'tenant_scope'
  | 'agent_scope'
  | 'branch_scope'
  | 'role_scope';

export type CrmLeadFollowUpAuthorization =
  | { allowed: true }
  | { allowed: false; reason: CrmLeadFollowUpAuthorizationDenialReason };

export type CrmLeadFollowUpResult =
  | { success: true; activity: CrmLeadActivity }
  | { success: false; error: 'not_found' }
  | {
      success: false;
      error: 'forbidden';
      reason: CrmLeadFollowUpAuthorizationDenialReason;
    }
  | { success: false; error: 'invalid_input'; reason: 'invalid_scheduled_at' };

export type ScheduleCrmLeadFollowUpInput = {
  actor: CrmActorContext;
  description?: string | null;
  leadId: string;
  scheduledAt: string;
  subject: string;
};

export type CompleteCrmLeadFollowUpInput = {
  activityId: string;
  actor: CrmActorContext;
  completedAt?: string;
  leadId: string;
};

export type CreateCrmLeadFollowUpActivity = {
  createdAt: string;
  description: string | null;
  id: string;
  leadId: string;
  occurredAt: string;
  scheduledAt: string;
  subject: string;
  tenantId: string;
  type: typeof CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE;
};

export interface CrmLeadFollowUpRepository extends Pick<CrmLeadRepository, 'findById'> {
  completeFollowUpActivity(params: {
    activityId: string;
    actor: CrmActorContext;
    completedAt: string;
    leadId: string;
  }): Promise<CrmLeadActivity | null>;
  createFollowUpActivity(params: {
    activity: CreateCrmLeadFollowUpActivity;
    actor: CrmActorContext;
  }): Promise<CrmLeadActivity>;
}

export type CrmLeadFollowUpClock = {
  now(): string;
};

export type CrmLeadFollowUpIds = {
  activityId(): string;
};

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

type CrmLeadFollowUpActivityLike = CrmLeadActivity & {
  readonly expectedLifecycleVersion?: number | null;
  readonly followUpSource?: 'legacy_activity' | 'crm_task';
};

function followUpSourceRank(activity: CrmLeadFollowUpActivityLike): number {
  return activity.followUpSource === 'crm_task' ? 0 : 1;
}

function followUpDedupeKey(activity: CrmLeadFollowUpActivityLike): string {
  return [activity.tenantId, activity.agentId, activity.leadId, activity.scheduledAt].join(':');
}

function isSameAgent(actor: CrmActorContext, agentId: string): boolean {
  return actor.actorId === agentId || actor.scope.agentId === agentId;
}

function hasMatchingBranch(actor: CrmActorContext, lead: Pick<CrmLead, 'branchId'>): boolean {
  if (!actor.scope.branchId) return false;
  return lead.branchId != null && lead.branchId === actor.scope.branchId;
}

export function authorizeCrmLeadFollowUpAction(
  actor: CrmActorContext,
  lead: Pick<CrmLead, 'agentId' | 'branchId' | 'tenantId'>
): CrmLeadFollowUpAuthorization {
  if (lead.tenantId !== actor.tenantId) {
    return { allowed: false, reason: 'tenant_scope' };
  }

  if (actor.role !== 'agent') {
    return { allowed: false, reason: 'role_scope' };
  }

  if (!isSameAgent(actor, lead.agentId)) {
    return { allowed: false, reason: 'agent_scope' };
  }

  if (!hasMatchingBranch(actor, lead)) {
    return { allowed: false, reason: 'branch_scope' };
  }

  return { allowed: true };
}

export function isOpenCrmLeadFollowUpActivity(activity: CrmLeadActivity): boolean {
  return (
    activity.type === CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE &&
    activity.scheduledAt != null &&
    activity.completedAt == null
  );
}

export function isCrmLeadFollowUpDue(activity: CrmLeadActivity, now: string): boolean {
  if (!isOpenCrmLeadFollowUpActivity(activity)) return false;
  const scheduledAt = parseTime(activity.scheduledAt);
  const nowAt = parseTime(now);
  return scheduledAt != null && nowAt != null && scheduledAt <= nowAt;
}

export function deriveCrmLeadNextAction(args: {
  activities: readonly CrmLeadActivity[];
  lead: Pick<CrmLead, 'id' | 'tenantId'>;
  now: string;
}): CrmLeadNextAction {
  const nowAt = parseTime(args.now);
  const openFollowUps = (args.activities as readonly CrmLeadFollowUpActivityLike[])
    .filter(
      activity =>
        activity.tenantId === args.lead.tenantId &&
        activity.leadId === args.lead.id &&
        isOpenCrmLeadFollowUpActivity(activity) &&
        parseTime(activity.scheduledAt) != null
    )
    .sort((left, right) => {
      const scheduledDiff = parseTime(left.scheduledAt)! - parseTime(right.scheduledAt)!;
      if (scheduledDiff !== 0) return scheduledDiff;
      const sourceDiff = followUpSourceRank(left) - followUpSourceRank(right);
      if (sourceDiff !== 0) return sourceDiff;
      return left.id.localeCompare(right.id);
    });
  const deduped = new Map<string, CrmLeadFollowUpActivityLike>();
  for (const activity of openFollowUps) {
    const key = followUpDedupeKey(activity);
    if (!deduped.has(key)) deduped.set(key, activity);
  }
  const next = [...deduped.values()][0];

  if (!next?.scheduledAt || nowAt == null) {
    return { kind: 'none' };
  }

  const scheduledAt = parseTime(next.scheduledAt)!;
  const isOverdue = scheduledAt <= nowAt;
  return {
    activityId: next.id,
    description: next.description ?? null,
    isOverdue,
    kind: isOverdue ? 'follow_up_due' : 'follow_up_scheduled',
    leadId: next.leadId,
    scheduledAt: next.scheduledAt,
    source: next.followUpSource ?? 'legacy_activity',
    expectedLifecycleVersion: next.expectedLifecycleVersion ?? null,
    subject: next.subject,
  };
}

export async function scheduleCrmLeadFollowUp(
  input: ScheduleCrmLeadFollowUpInput,
  repository: CrmLeadFollowUpRepository,
  services: CrmLeadFollowUpClock & CrmLeadFollowUpIds
): Promise<CrmLeadFollowUpResult> {
  if (parseTime(input.scheduledAt) == null) {
    return { success: false, error: 'invalid_input', reason: 'invalid_scheduled_at' };
  }

  const lead = await repository.findById({ actor: input.actor, leadId: input.leadId });
  if (!lead) {
    return { success: false, error: 'not_found' };
  }

  const authorization = authorizeCrmLeadFollowUpAction(input.actor, lead);
  if (!authorization.allowed) {
    return { success: false, error: 'forbidden', reason: authorization.reason };
  }

  const now = services.now();
  const activity = await repository.createFollowUpActivity({
    actor: input.actor,
    activity: {
      createdAt: now,
      description: input.description ?? null,
      id: services.activityId(),
      leadId: input.leadId,
      occurredAt: now,
      scheduledAt: input.scheduledAt,
      subject: input.subject,
      tenantId: input.actor.tenantId,
      type: CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE,
    },
  });

  return { success: true, activity };
}

export async function completeCrmLeadFollowUp(
  input: CompleteCrmLeadFollowUpInput,
  repository: CrmLeadFollowUpRepository,
  services: CrmLeadFollowUpClock
): Promise<CrmLeadFollowUpResult> {
  const lead = await repository.findById({ actor: input.actor, leadId: input.leadId });
  if (!lead) {
    return { success: false, error: 'not_found' };
  }

  const authorization = authorizeCrmLeadFollowUpAction(input.actor, lead);
  if (!authorization.allowed) {
    return { success: false, error: 'forbidden', reason: authorization.reason };
  }

  const activity = await repository.completeFollowUpActivity({
    activityId: input.activityId,
    actor: input.actor,
    completedAt: input.completedAt ?? services.now(),
    leadId: input.leadId,
  });
  if (!activity) {
    return { success: false, error: 'not_found' };
  }

  return { success: true, activity };
}
