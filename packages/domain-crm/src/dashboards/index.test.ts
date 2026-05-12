import { describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import {
  AGENT_CRM_DASHBOARD_MAX_DUE_FOLLOW_UPS,
  authorizeAgentCrmDashboardRead,
  getAgentCrmDashboard,
  type AgentCrmDashboardRepository,
} from './index';

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function repository(
  overrides: Partial<Awaited<ReturnType<AgentCrmDashboardRepository['readAgentDashboard']>>> = {}
): AgentCrmDashboardRepository {
  return {
    readAgentDashboard: vi.fn(async () => ({
      closedWonDealsCount: 2,
      dueFollowUps: [],
      leadCounts: [
        { stage: 'new', count: '3' },
        { stage: 'contacted', count: 4 },
      ],
      paidCommissionTotal: '123.45',
      ...overrides,
    })),
  };
}

describe('getAgentCrmDashboard', () => {
  it('rejects non-agent actors before reading dashboard data', async () => {
    const repo = repository();

    const result = await getAgentCrmDashboard(
      {
        actor: {
          ...agentActor,
          role: 'staff',
          scope: { staffId: 'staff-1', branchId: 'branch-1' },
        },
      },
      repo,
      { now: () => '2026-05-12T08:00:00.000Z' }
    );

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'role_scope' });
    expect(repo.readAgentDashboard).not.toHaveBeenCalled();
  });

  it('rejects wrong-agent actor scope before reading dashboard data', async () => {
    const repo = repository();

    const result = await getAgentCrmDashboard(
      { actor: { ...agentActor, scope: { ...agentActor.scope, agentId: 'agent-2' } } },
      repo,
      { now: () => '2026-05-12T08:00:00.000Z' }
    );

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'agent_scope' });
    expect(repo.readAgentDashboard).not.toHaveBeenCalled();
  });

  it('rejects missing branch scope before reading dashboard data', async () => {
    const repo = repository();

    const result = await getAgentCrmDashboard(
      { actor: { ...agentActor, scope: { agentId: 'agent-1', branchId: null } } },
      repo,
      { now: () => '2026-05-12T08:00:00.000Z' }
    );

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'branch_scope' });
    expect(repo.readAgentDashboard).not.toHaveBeenCalled();
  });

  it('uses the actor context and stable dashboard limit when reading', async () => {
    const repo = repository();

    const result = await getAgentCrmDashboard({ actor: agentActor }, repo, {
      now: () => '2026-05-12T08:00:00.000Z',
    });

    expect(result).toEqual({
      success: true,
      dashboard: {
        closedWonDealsCount: 2,
        contactedLeadsCount: 4,
        dueFollowUps: [],
        newLeadsCount: 3,
        paidCommissionTotal: 123.45,
      },
    });
    expect(repo.readAgentDashboard).toHaveBeenCalledWith({
      actor: agentActor,
      limit: AGENT_CRM_DASHBOARD_MAX_DUE_FOLLOW_UPS,
      now: '2026-05-12T08:00:00.000Z',
    });
  });

  it('maps only due open follow-ups into the dashboard DTO', async () => {
    const repo = repository({
      dueFollowUps: [
        {
          activityId: 'activity-due',
          agentId: 'agent-1',
          branchId: 'branch-1',
          completedAt: null,
          companyName: null,
          createdAt: '2026-05-11T08:00:00.000Z',
          fullName: 'Lead One',
          leadId: 'lead-1',
          scheduledAt: '2026-05-11T09:00:00.000Z',
          subject: 'Call back',
          tenantId: 'tenant-1',
          type: 'follow_up',
        },
        {
          activityId: 'activity-future',
          agentId: 'agent-1',
          branchId: 'branch-1',
          completedAt: null,
          companyName: 'Future Co',
          createdAt: '2026-05-11T08:00:00.000Z',
          fullName: null,
          leadId: 'lead-2',
          scheduledAt: '2026-05-13T09:00:00.000Z',
          subject: 'Later',
          tenantId: 'tenant-1',
          type: 'follow_up',
        },
      ],
    });

    const result = await getAgentCrmDashboard({ actor: agentActor }, repo, {
      now: () => '2026-05-12T08:00:00.000Z',
    });

    expect(result.success && result.dashboard.dueFollowUps).toEqual([
      {
        activityId: 'activity-due',
        leadId: 'lead-1',
        leadName: 'Lead One',
        scheduledAt: '2026-05-11T09:00:00.000Z',
        subject: 'Call back',
      },
    ]);
  });

  it('exposes explicit authorization reasons for direct guard tests', () => {
    expect(authorizeAgentCrmDashboardRead(agentActor)).toBeNull();
    expect(authorizeAgentCrmDashboardRead({ ...agentActor, role: 'member' })).toBe('role_scope');
    expect(
      authorizeAgentCrmDashboardRead({
        ...agentActor,
        scope: { ...agentActor.scope, agentId: 'agent-2' },
      })
    ).toBe('agent_scope');
    expect(
      authorizeAgentCrmDashboardRead({
        ...agentActor,
        scope: { ...agentActor.scope, branchId: undefined },
      })
    ).toBe('branch_scope');
  });
});
