import { isCrmLeadFollowUpDue } from '../leads/follow-up';
import type { CrmActorContext } from '../context';
import type { CrmLeadActivity } from '../leads/types';

export { CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE } from '../leads/follow-up';

export const AGENT_CRM_DASHBOARD_MAX_DUE_FOLLOW_UPS = 5;

export type AgentCrmDashboard = {
  newLeadsCount: number;
  contactedLeadsCount: number;
  closedWonDealsCount: number;
  paidCommissionTotal: number;
  dueFollowUps: AgentCrmDashboardDueFollowUp[];
};

export type AgentCrmDashboardDueFollowUp = {
  activityId: string;
  expectedLifecycleVersion?: number | null;
  leadId: string;
  leadName: string | null;
  scheduledAt: string;
  source?: 'legacy_activity' | 'crm_task';
  subject: string;
};

export type AgentCrmDashboardLeadCountRow = {
  count: number | string | null;
  stage: string | null;
};

export type AgentCrmDashboardDueFollowUpRow = {
  activityId: string;
  agentId: string;
  branchId?: string | null;
  completedAt?: Date | string | null;
  companyName?: string | null;
  createdAt?: Date | string | null;
  expectedLifecycleVersion?: number | null;
  fullName?: string | null;
  leadId: string;
  scheduledAt?: Date | string | null;
  source?: 'legacy_activity' | 'crm_task';
  subject: string;
  tenantId: string;
  type: string;
};

export type AgentCrmDashboardReadModel = {
  closedWonDealsCount: number | string | null;
  dueFollowUps: readonly AgentCrmDashboardDueFollowUpRow[];
  leadCounts: readonly AgentCrmDashboardLeadCountRow[];
  paidCommissionTotal: number | string | null;
};

export type AgentCrmDashboardRepository = {
  readAgentDashboard(params: {
    actor: CrmActorContext;
    limit: number;
    now: string;
  }): Promise<AgentCrmDashboardReadModel>;
};

export type AgentCrmDashboardClock = {
  now(): string;
};

export type AgentCrmDashboardAuthorizationDenialReason =
  | 'agent_scope'
  | 'branch_scope'
  | 'role_scope';

export type AgentCrmDashboardResult =
  | { success: true; dashboard: AgentCrmDashboard }
  | {
      success: false;
      error: 'forbidden';
      reason: AgentCrmDashboardAuthorizationDenialReason;
    };

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function dueFollowUpSourceRank(row: AgentCrmDashboardDueFollowUpRow): number {
  return row.source === 'crm_task' ? 0 : 1;
}

function dueFollowUpDedupeKey(row: AgentCrmDashboardDueFollowUpRow): string {
  return [row.tenantId, row.agentId, row.leadId, toIso(row.scheduledAt)].join(':');
}

export function authorizeAgentCrmDashboardRead(
  actor: CrmActorContext
): AgentCrmDashboardAuthorizationDenialReason | null {
  if (actor.role !== 'agent') return 'role_scope';
  if (actor.scope.agentId && actor.scope.agentId !== actor.actorId) return 'agent_scope';
  if (!actor.scope.branchId) return 'branch_scope';
  return null;
}

export async function getAgentCrmDashboard(
  input: { actor: CrmActorContext },
  repository: AgentCrmDashboardRepository,
  clock: AgentCrmDashboardClock
): Promise<AgentCrmDashboardResult> {
  const denied = authorizeAgentCrmDashboardRead(input.actor);
  if (denied) {
    return { success: false, error: 'forbidden', reason: denied };
  }

  const now = clock.now();
  const readModel = await repository.readAgentDashboard({
    actor: input.actor,
    limit: AGENT_CRM_DASHBOARD_MAX_DUE_FOLLOW_UPS,
    now,
  });

  return {
    success: true,
    dashboard: {
      newLeadsCount: toNumber(readModel.leadCounts.find(r => r.stage === 'new')?.count),
      contactedLeadsCount: toNumber(readModel.leadCounts.find(r => r.stage === 'contacted')?.count),
      closedWonDealsCount: toNumber(readModel.closedWonDealsCount),
      paidCommissionTotal: toNumber(readModel.paidCommissionTotal),
      dueFollowUps: [...readModel.dueFollowUps]
        .filter(row => {
          const activity: CrmLeadActivity = {
            agentId: row.agentId,
            branchId: row.branchId ?? null,
            completedAt: toIso(row.completedAt),
            createdAt: toIso(row.createdAt) ?? now,
            description: null,
            id: row.activityId,
            leadId: row.leadId,
            occurredAt: toIso(row.createdAt) ?? now,
            scheduledAt: toIso(row.scheduledAt),
            subject: row.subject,
            tenantId: row.tenantId,
            type: row.type,
          };
          return isCrmLeadFollowUpDue(activity, now);
        })
        .sort((left, right) => {
          const leftAt = Date.parse(toIso(left.scheduledAt) ?? '');
          const rightAt = Date.parse(toIso(right.scheduledAt) ?? '');
          const scheduledDiff = leftAt - rightAt;
          if (scheduledDiff !== 0) return scheduledDiff;
          const sourceDiff = dueFollowUpSourceRank(left) - dueFollowUpSourceRank(right);
          if (sourceDiff !== 0) return sourceDiff;
          return left.activityId.localeCompare(right.activityId);
        })
        .filter((row, index, rows) => {
          const key = dueFollowUpDedupeKey(row);
          return rows.findIndex(candidate => dueFollowUpDedupeKey(candidate) === key) === index;
        })
        .slice(0, AGENT_CRM_DASHBOARD_MAX_DUE_FOLLOW_UPS)
        .map(row => ({
          activityId: row.activityId,
          expectedLifecycleVersion: row.expectedLifecycleVersion ?? null,
          leadId: row.leadId,
          leadName: row.fullName || row.companyName || null,
          scheduledAt: toIso(row.scheduledAt) ?? now,
          source: row.source ?? 'legacy_activity',
          subject: row.subject,
        })),
    },
  };
}
