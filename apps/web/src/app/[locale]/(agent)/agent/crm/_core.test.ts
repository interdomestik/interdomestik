import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getAgentCrmDashboard: vi.fn(),
  crmDashboardRepository: { readAgentDashboard: vi.fn() },
  crmReportingRepository: {
    listSourceBreakdownRows: vi.fn(),
    listWeightedPipelineRows: vi.fn(),
    listWinRateRows: vi.fn(),
  },
  agentCrmTaskWorkQueueRepository: {
    readAgentCompletedTaskQueue: vi.fn(),
    readAgentTaskWorkQueue: vi.fn(),
  },
}));

vi.mock('@interdomestik/domain-crm/dashboards', () => ({
  getAgentCrmDashboard: hoisted.getAgentCrmDashboard,
}));

vi.mock('@/adapters/crm/dashboard-repository', () => ({
  crmDashboardRepository: hoisted.crmDashboardRepository,
}));

vi.mock('@/adapters/crm/reporting-repository', () => ({
  crmReportingRepository: hoisted.crmReportingRepository,
}));

vi.mock('@/adapters/crm/task-work-queue-repository', () => ({
  agentCrmTaskWorkQueueRepository: hoisted.agentCrmTaskWorkQueueRepository,
}));

import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type {
  CrmSourceBreakdownRow,
  CrmWeightedPipelineRow,
  CrmWinRateRow,
} from '@interdomestik/domain-crm/reporting';

import {
  AgentCrmReportingAccessDeniedError,
  AgentCrmStatsAccessDeniedError,
  createAgentCrmReportingWindow,
  getAgentCrmReportingCore,
  getAgentCrmCompletedTaskQueueCore,
  getAgentCrmStatsCore,
  getAgentCrmTaskQueueCore,
} from './_core';

const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

const weightedRow: CrmWeightedPipelineRow = {
  agentId: 'agent-1',
  branchId: 'branch-1',
  currencyCode: 'EUR',
  currentStageId: 'stage-commit',
  dealId: 'deal-1',
  forecastCategory: 'commit',
  isLostStage: false,
  isWonStage: false,
  pipelineId: 'pipeline-1',
  source: 'website',
  stageProbability: 80,
  tenantId: 'tenant-1',
  valueAmountMinor: 10000,
};

const sourceRow: CrmSourceBreakdownRow = {
  ...weightedRow,
  outcome: 'won',
};

const winRateRow: CrmWinRateRow = {
  agentId: 'agent-1',
  branchId: 'branch-1',
  outcome: 'won',
  pipelineId: 'pipeline-1',
  source: 'website',
  stageId: 'stage-won',
  tenantId: 'tenant-1',
};

describe('getAgentCrmStatsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getAgentCrmDashboard.mockResolvedValue({
      success: true,
      dashboard: {
        closedWonDealsCount: 0,
        contactedLeadsCount: 0,
        dueFollowUps: [],
        newLeadsCount: 0,
        paidCommissionTotal: 0,
      },
    });
    hoisted.crmReportingRepository.listWeightedPipelineRows.mockResolvedValue([weightedRow]);
    hoisted.crmReportingRepository.listSourceBreakdownRows.mockResolvedValue([sourceRow]);
    hoisted.crmReportingRepository.listWinRateRows.mockResolvedValue([winRateRow]);
    hoisted.agentCrmTaskWorkQueueRepository.readAgentCompletedTaskQueue.mockResolvedValue([]);
    hoisted.agentCrmTaskWorkQueueRepository.readAgentTaskWorkQueue.mockResolvedValue([]);
  });

  it('delegates dashboard reads to the domain CRM dashboard API with actor context', async () => {
    const stats = await getAgentCrmStatsCore({ actor });

    expect(stats).toEqual({
      closedWonDealsCount: 0,
      contactedLeadsCount: 0,
      dueFollowUps: [],
      newLeadsCount: 0,
      paidCommissionTotal: 0,
    });
    expect(hoisted.getAgentCrmDashboard).toHaveBeenCalledWith(
      { actor },
      hoisted.crmDashboardRepository,
      { now: expect.any(Function) }
    );
  });

  it('raises a typed access-denied error when the domain CRM dashboard read is forbidden', async () => {
    hoisted.getAgentCrmDashboard.mockResolvedValueOnce({
      success: false,
      error: 'forbidden',
      reason: 'branch_scope',
    });

    try {
      await getAgentCrmStatsCore({ actor });
      throw new Error('Expected getAgentCrmStatsCore to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AgentCrmStatsAccessDeniedError);
      expect(error).toMatchObject({
        reason: 'branch_scope',
        name: 'AgentCrmStatsAccessDeniedError',
      });
    }
  });

  it('builds CRM12 reporting widgets from the reporting repository and CRM05 derivations', async () => {
    const reporting = await getAgentCrmReportingCore({
      actor,
      now: () => '2026-05-14T12:00:00.000Z',
    });

    const expectedWindow = createAgentCrmReportingWindow('2026-05-14T12:00:00.000Z');
    expect(hoisted.crmReportingRepository.listWeightedPipelineRows).toHaveBeenCalledWith({
      actor,
      window: expectedWindow,
    });
    expect(hoisted.crmReportingRepository.listSourceBreakdownRows).toHaveBeenCalledWith({
      actor,
      window: expectedWindow,
    });
    expect(hoisted.crmReportingRepository.listWinRateRows).toHaveBeenCalledWith({
      actor,
      window: expectedWindow,
    });
    expect(reporting).toMatchObject({
      sourceBreakdown: {
        groups: [
          {
            currencyCode: 'EUR',
            dealCount: 1,
            source: 'website',
            weightedValueAmountMinor: 8000,
            winRateBps: 10000,
          },
        ],
      },
      weightedPipeline: {
        currencySummaries: [
          {
            currencyCode: 'EUR',
            forecastCommitAmountMinor: 8000,
            openDealCount: 1,
            rawValueAmountMinor: 10000,
            weightedValueAmountMinor: 8000,
          },
        ],
        excludedRowCount: 0,
      },
      winRateBySource: {
        groups: [
          {
            groupKey: 'website',
            lostCount: 0,
            openCount: 0,
            winRateBps: 10000,
            wonCount: 1,
          },
        ],
      },
      window: expectedWindow,
    });
  });

  it('loads the agent task queue through the task-only queue repository', async () => {
    hoisted.agentCrmTaskWorkQueueRepository.readAgentTaskWorkQueue.mockResolvedValueOnce([
      {
        createReasonCode: 'follow_up',
        displayLabelCode: 'follow_up',
        dueAt: '2026-05-22T12:00:00.000Z',
        dueBucket: 'due_today',
        leadDisplayRef: { id: 'lead-1', label: 'Lead One' },
        lifecycleVersion: 3,
        priority: 'urgent',
        status: 'pending',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: 'task-1',
      },
    ]);

    const queue = await getAgentCrmTaskQueueCore({
      actor,
      now: () => '2026-05-22T08:00:00.000Z',
    });

    expect(hoisted.agentCrmTaskWorkQueueRepository.readAgentTaskWorkQueue).toHaveBeenCalledWith({
      actor,
      now: '2026-05-22T08:00:00.000Z',
    });
    expect(queue).toEqual([
      expect.objectContaining({
        href: '/agent/leads/lead-1',
        taskId: 'task-1',
      }),
    ]);
  });

  it('loads the agent completed task queue through the completed queue repository', async () => {
    hoisted.agentCrmTaskWorkQueueRepository.readAgentCompletedTaskQueue.mockResolvedValueOnce([
      {
        completedAt: '2026-05-22T14:00:00.000Z',
        completionReasonCode: 'resolved',
        dueAt: null,
        leadDisplayRef: { id: 'lead-1', label: 'Lead One' },
        lifecycleVersion: 6,
        priority: 'normal',
        status: 'completed',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: 'task-6',
      },
    ]);

    const queue = await getAgentCrmCompletedTaskQueueCore({
      actor,
      now: () => '2026-05-22T15:00:00.000Z',
    });

    expect(
      hoisted.agentCrmTaskWorkQueueRepository.readAgentCompletedTaskQueue
    ).toHaveBeenCalledWith({
      actor,
      now: '2026-05-22T15:00:00.000Z',
    });
    expect(queue).toEqual([
      expect.objectContaining({
        href: '/agent/leads/lead-1',
        status: 'completed',
        taskId: 'task-6',
      }),
    ]);
  });

  it('fails closed before reporting repository reads when reporting scope is invalid', async () => {
    await expect(
      getAgentCrmReportingCore({
        actor: {
          ...actor,
          scope: { agentId: 'other-agent', branchId: 'branch-1' },
        },
      })
    ).rejects.toMatchObject({
      name: 'AgentCrmReportingAccessDeniedError',
      reason: 'agent_scope',
    } satisfies Partial<AgentCrmReportingAccessDeniedError>);

    expect(hoisted.crmReportingRepository.listWeightedPipelineRows).not.toHaveBeenCalled();
    expect(hoisted.crmReportingRepository.listSourceBreakdownRows).not.toHaveBeenCalled();
    expect(hoisted.crmReportingRepository.listWinRateRows).not.toHaveBeenCalled();
  });
});
