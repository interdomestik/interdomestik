import { describe, expect, it } from 'vitest';

import type { CrmActorContext } from '../context';
import {
  authorizeCrmReportingRead,
  deriveCrmAgentLeaderboard,
  deriveCrmForecastSnapshot,
  deriveCrmFunnelConversion,
  deriveCrmSourceBreakdown,
  deriveCrmStageVelocity,
  deriveCrmWeightedPipeline,
  deriveCrmWinRate,
} from './index';
import type {
  CrmAgentLeaderboardRow,
  CrmFunnelConversionRow,
  CrmSourceBreakdownRow,
  CrmStageVelocityRow,
  CrmWeightedPipelineRow,
  CrmWinRateRow,
} from './types';

const window = {
  from: '2026-05-01T00:00:00.000Z',
  to: '2026-05-31T00:00:00.000Z',
};

const adminActor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: {},
  tenantId: 'tenant-1',
};

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

const branchManagerActor: CrmActorContext = {
  actorId: 'manager-1',
  role: 'branch_manager',
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function weightedRow(overrides: Partial<CrmWeightedPipelineRow> = {}): CrmWeightedPipelineRow {
  return {
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
    ...overrides,
  };
}

describe('CRM reporting domain', () => {
  it('authorizes reporting reads by role, branch, agent, and window scope', () => {
    expect(authorizeCrmReportingRead({ actor: adminActor, window })).toBeNull();
    expect(
      authorizeCrmReportingRead({
        actor: { ...adminActor, role: 'member' },
        window,
      })
    ).toBe('role_scope');
    expect(
      authorizeCrmReportingRead({
        actor: { ...adminActor, role: 'branch_manager', scope: {} },
        window,
      })
    ).toBe('branch_scope');
    expect(authorizeCrmReportingRead({ actor: branchManagerActor, window })).toBeNull();
    expect(
      authorizeCrmReportingRead({
        actor: agentActor,
        grouping: 'leaderboard',
        window,
      })
    ).toBe('agent_scope');
    expect(
      authorizeCrmReportingRead({
        actor: adminActor,
        window: { from: '2026-01-01T00:00:00.000Z', to: '2027-06-01T00:00:00.000Z' },
      })
    ).toBe('window_scope');
  });

  it('derives period-entry funnel conversion with deterministic basis-point math', () => {
    const rows: CrmFunnelConversionRow[] = [
      {
        dealId: 'deal-1',
        enteredAt: '2026-05-02T00:00:00.000Z',
        exitedAt: '2026-05-03T00:00:00.000Z',
        kind: 'stage_changed',
        pipelineId: 'pipeline-1',
        stageId: 'stage-qualified',
        tenantId: 'tenant-1',
      },
      {
        dealId: 'deal-2',
        enteredAt: '2026-05-04T00:00:00.000Z',
        kind: 'won',
        pipelineId: 'pipeline-1',
        stageId: 'stage-won',
        stageIsWon: true,
        tenantId: 'tenant-1',
      },
      {
        dealId: 'deal-3',
        enteredAt: '2026-06-01T00:00:00.000Z',
        kind: 'lost',
        pipelineId: 'pipeline-1',
        stageId: 'stage-lost',
        stageIsLost: true,
        tenantId: 'tenant-1',
      },
    ];

    expect(deriveCrmFunnelConversion(rows, { actor: adminActor, window }).stages).toEqual([
      expect.objectContaining({
        conversionRateBps: 0,
        enteredCount: 1,
        pipelineId: 'pipeline-1',
        stageId: 'stage-qualified',
      }),
      expect.objectContaining({
        conversionRateBps: 10000,
        enteredCount: 1,
        stageId: 'stage-won',
        wonCount: 1,
      }),
    ]);
  });

  it('computes stage velocity from stage-history intervals and excludes open intervals by default', () => {
    const rows: CrmStageVelocityRow[] = [
      {
        dealId: 'deal-1',
        enteredAt: '2026-05-01T00:00:00.000Z',
        exitedAt: '2026-05-04T00:00:00.000Z',
        kind: 'created',
        pipelineId: 'pipeline-1',
        stageId: 'stage-qualified',
        tenantId: 'tenant-1',
      },
      {
        dealId: 'deal-2',
        enteredAt: '2026-05-02T00:00:00.000Z',
        exitedAt: '2026-05-06T00:00:00.000Z',
        kind: 'stage_changed',
        pipelineId: 'pipeline-1',
        stageId: 'stage-qualified',
        tenantId: 'tenant-1',
      },
      {
        dealId: 'deal-3',
        enteredAt: '2026-05-03T00:00:00.000Z',
        kind: 'stage_changed',
        pipelineId: 'pipeline-1',
        stageId: 'stage-qualified',
        tenantId: 'tenant-1',
      },
    ];

    expect(deriveCrmStageVelocity(rows, { actor: adminActor, window })).toEqual({
      excludedOpenIntervalCount: 1,
      stages: [
        {
          averageDays: 3.5,
          maximumDays: 4,
          medianDays: 3,
          minimumDays: 3,
          pipelineId: 'pipeline-1',
          sampleCount: 2,
          stageId: 'stage-qualified',
        },
      ],
      window,
    });
    expect(
      deriveCrmStageVelocity(rows, {
        actor: adminActor,
        includeOpenIntervals: true,
        now: '2026-05-08T00:00:00.000Z',
        window,
      }).stages[0]
    ).toMatchObject({ maximumDays: 5, medianDays: 4, sampleCount: 3 });
  });

  it('derives weighted pipeline using current stage probability and exclusion counters', () => {
    const report = deriveCrmWeightedPipeline(
      [
        weightedRow(),
        weightedRow({ currencyCode: 'USD', dealId: 'deal-2', forecastCategory: 'best' }),
        weightedRow({ currentStageId: null, dealId: 'deal-3' }),
        weightedRow({
          dealId: 'deal-4',
          forecastCategory: 'closed',
          isLostStage: false,
          isWonStage: false,
        }),
        weightedRow({ dealId: 'deal-5', isWonStage: true, valueAmountMinor: 30000 }),
      ],
      { actor: adminActor, window }
    );

    expect(report.excludedMissingStageCount).toBe(1);
    expect(report.excludedInconsistentForecastCount).toBe(1);
    expect(report.groups).toEqual([
      expect.objectContaining({
        closedWonAmountMinor: 30000,
        currencyCode: 'EUR',
        forecastCommitAmountMinor: 8000,
        openDealCount: 1,
        rawValueAmountMinor: 10000,
        weightedValueAmountMinor: 8000,
      }),
      expect.objectContaining({
        currencyCode: 'USD',
        forecastBestAmountMinor: 8000,
        openDealCount: 1,
      }),
    ]);

    expect(
      deriveCrmWeightedPipeline(
        [
          weightedRow({ agentId: 'agent-a', currentStageId: 'stage-a' }),
          weightedRow({ agentId: 'agent-b', currentStageId: 'stage-b', dealId: 'deal-6' }),
        ],
        { actor: adminActor, groupBy: ['branch', 'pipeline'], window }
      ).groups
    ).toEqual([
      expect.objectContaining({
        agentId: null,
        branchId: 'branch-1',
        openDealCount: 2,
        pipelineId: 'pipeline-1',
        stageId: null,
        weightedValueAmountMinor: 16000,
      }),
    ]);
  });

  it('derives forecast snapshot rows from weighted pipeline groups', () => {
    const weighted = deriveCrmWeightedPipeline(
      [
        weightedRow({ currentStageId: 'stage-a' }),
        weightedRow({ currentStageId: 'stage-b', dealId: 'deal-2' }),
      ],
      { actor: adminActor, window }
    );

    expect(
      deriveCrmForecastSnapshot(weighted.groups, {
        createdAt: '2026-05-31T23:59:59.999Z',
        createdById: 'admin-1',
        idempotencyKey: 'snapshot:2026-05-31',
        snapshotDate: '2026-05-31',
        sourceRunId: 'run-1',
      })
    ).toEqual([
      expect.objectContaining({
        createdById: 'admin-1',
        forecastCommitAmountMinor: 16000,
        idempotencyKey: 'snapshot:2026-05-31',
        openDealCount: 2,
        snapshotDate: '2026-05-31',
        sourceRunId: 'run-1',
      }),
    ]);
  });

  it('derives source breakdown, win rate, and leaderboard with stable tie-breaking', () => {
    const sourceRows: CrmSourceBreakdownRow[] = [
      { ...weightedRow(), outcome: 'won', source: 'web', utmSource: 'google' },
      { ...weightedRow({ dealId: 'deal-2' }), outcome: 'lost', source: 'web', utmSource: 'google' },
    ];
    expect(
      deriveCrmSourceBreakdown(sourceRows, { actor: adminActor, window }).groups[0]
    ).toMatchObject({
      dealCount: 2,
      source: 'web',
      winRateBps: 5000,
    });

    const winRows: CrmWinRateRow[] = [
      { agentId: 'agent-1', outcome: 'won', tenantId: 'tenant-1' },
      { agentId: 'agent-1', outcome: 'lost', tenantId: 'tenant-1' },
      { agentId: 'agent-2', outcome: 'open', tenantId: 'tenant-1' },
    ];
    expect(
      deriveCrmWinRate(winRows, { actor: adminActor, groupBy: 'agent', window }).groups
    ).toEqual([
      { groupKey: 'agent-1', lostCount: 1, openCount: 0, winRateBps: 5000, wonCount: 1 },
      { groupKey: 'agent-2', lostCount: 0, openCount: 1, winRateBps: 0, wonCount: 0 },
    ]);

    const leaderboardRows: CrmAgentLeaderboardRow[] = [
      { ...weightedRow({ agentId: 'agent-b', valueAmountMinor: 10000 }), outcome: 'open' },
      {
        ...weightedRow({
          agentId: 'agent-a',
          dealId: 'deal-2',
          isWonStage: true,
          valueAmountMinor: 20000,
        }),
        outcome: 'won',
      },
    ];
    expect(
      deriveCrmAgentLeaderboard(leaderboardRows, { actor: adminActor, window }).entries
    ).toEqual([
      expect.objectContaining({ agentId: 'agent-a', currencyCode: 'EUR', rank: 1 }),
      expect.objectContaining({ agentId: 'agent-b', currencyCode: 'EUR', rank: 2 }),
    ]);

    expect(
      deriveCrmAgentLeaderboard(
        [
          { ...weightedRow({ agentId: 'agent-a', currencyCode: 'EUR' }), outcome: 'open' },
          {
            ...weightedRow({ agentId: 'agent-a', currencyCode: 'USD', dealId: 'deal-3' }),
            outcome: 'open',
          },
        ],
        { actor: adminActor, window }
      ).entries.map(entry => entry.currencyCode)
    ).toEqual(['EUR', 'USD']);
  });

  it('keeps reporting outputs free of PII-shaped keys', () => {
    const piiKeys = new Set(['email', 'phone', 'fullName', 'notes', 'description', 'subject']);
    const outputs = [
      deriveCrmWeightedPipeline([weightedRow()], { actor: adminActor, window }).groups[0],
      deriveCrmSourceBreakdown([{ ...weightedRow(), outcome: 'open' }], {
        actor: adminActor,
        window,
      }).groups[0],
      deriveCrmAgentLeaderboard([{ ...weightedRow(), outcome: 'open' }], {
        actor: adminActor,
        window,
      }).entries[0],
    ];

    for (const output of outputs) {
      expect(Object.keys(output).filter(key => piiKeys.has(key))).toEqual([]);
    }
  });
});
