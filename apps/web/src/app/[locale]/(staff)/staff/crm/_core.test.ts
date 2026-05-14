import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type {
  CrmFunnelConversionRow,
  CrmStageVelocityRow,
  CrmWeightedPipelineRow,
} from '@interdomestik/domain-crm/reporting';
import type { CrmReportingRepository } from '@interdomestik/domain-crm/reporting/repository';

import {
  STAFF_CRM_FORBIDDEN_PII_KEYS,
  STAFF_CRM_FUNNEL_MAX_STAGES,
  STAFF_CRM_PIPELINE_MAX_ROWS,
  STAFF_CRM_STAGE_VELOCITY_MIN_SAMPLE_COUNT,
  StaffCrmReportingAccessDeniedError,
  createStaffCrmReportingWindow,
  getStaffCrmReportingCore,
} from './_core';

const actor: CrmActorContext = {
  actorId: 'staff-1',
  role: 'staff',
  scope: { branchId: null, staffId: 'staff-1' },
  tenantId: 'tenant-1',
};

function weightedRow(overrides: Partial<CrmWeightedPipelineRow> = {}): CrmWeightedPipelineRow {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    currencyCode: 'EUR',
    currentStageId: 'stage-open',
    dealId: overrides.dealId ?? 'deal-1',
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

function funnelRow(overrides: Partial<CrmFunnelConversionRow> = {}): CrmFunnelConversionRow {
  return {
    branchId: 'branch-1',
    dealId: overrides.dealId ?? 'deal-1',
    enteredAt: '2026-05-01T00:00:00.000Z',
    exitedAt: '2026-05-02T00:00:00.000Z',
    kind: 'stage_changed',
    lossReasonId: null,
    pipelineId: 'pipeline-1',
    stageId: 'stage-qualified',
    stageIsLost: false,
    stageIsWon: false,
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function velocityRow(overrides: Partial<CrmStageVelocityRow> = {}): CrmStageVelocityRow {
  return {
    branchId: 'branch-1',
    dealId: overrides.dealId ?? 'deal-1',
    enteredAt: '2026-05-01T00:00:00.000Z',
    exitedAt: '2026-05-04T00:00:00.000Z',
    kind: 'stage_changed',
    pipelineId: 'pipeline-1',
    stageId: 'stage-qualified',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function createRepository() {
  const repository = {
    listAgentLeaderboardRows: vi.fn(),
    listFunnelConversionRows: vi.fn(),
    listSourceBreakdownRows: vi.fn(),
    listStageVelocityRows: vi.fn(),
    listWeightedPipelineRows: vi.fn(),
    listWinRateRows: vi.fn(),
  } satisfies CrmReportingRepository;

  repository.listWeightedPipelineRows.mockResolvedValue([weightedRow()]);
  repository.listFunnelConversionRows.mockResolvedValue([funnelRow()]);
  repository.listStageVelocityRows.mockResolvedValue([
    velocityRow({ dealId: 'velocity-1', exitedAt: '2026-05-03T00:00:00.000Z' }),
    velocityRow({ dealId: 'velocity-2', exitedAt: '2026-05-04T00:00:00.000Z' }),
    velocityRow({ dealId: 'velocity-3', exitedAt: '2026-05-05T00:00:00.000Z' }),
  ]);

  return repository;
}

describe('staff CRM reporting core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds CRM15 widgets from CRM05 reporting repositories with one frozen window', async () => {
    const repository = createRepository();
    const now = '2026-05-14T12:00:00.000Z';

    const dashboard = await getStaffCrmReportingCore(
      { actor },
      {
        labels: { noBranch: 'No branch label' },
        now: () => now,
        reportingRepository: repository,
      }
    );

    const window = createStaffCrmReportingWindow(now);
    expect(repository.listWeightedPipelineRows).toHaveBeenCalledWith({ actor, window });
    expect(repository.listFunnelConversionRows).toHaveBeenCalledWith({ actor, window });
    expect(repository.listStageVelocityRows).toHaveBeenCalledWith({ actor, window });
    expect(dashboard.window).toEqual(window);
    expect(dashboard.pipelineWorkload).toMatchObject({
      rows: [
        {
          branchId: 'branch-1',
          branchLabel: 'branch-1',
          currencyCode: 'EUR',
          forecastCommitAmountMinor: 8000,
          openDealCount: 1,
          pipelineId: 'pipeline-1',
          totalPipelineAmountMinor: 10000,
          weightedPipelineAmountMinor: 8000,
        },
      ],
      state: 'data',
    });
    expect(dashboard.funnelMovement).toMatchObject({
      rows: [{ enteredCount: 1, pipelineId: 'pipeline-1', stageId: 'stage-qualified' }],
      state: 'data',
    });
    expect(dashboard.stageVelocity).toMatchObject({
      state: 'data',
      summary: {
        rows: [{ medianDays: 3, sampleCount: 3, stageId: 'stage-qualified' }],
      },
    });
  });

  it('fails closed for non-staff and tenantless actors before repository reads', async () => {
    for (const deniedActor of [
      { ...actor, role: 'branch_manager' as const },
      { ...actor, role: 'admin' as const },
      { ...actor, role: 'agent' as const },
      { ...actor, role: 'member' as const },
      { ...actor, tenantId: '' },
    ]) {
      const repository = createRepository();

      await expect(
        getStaffCrmReportingCore({ actor: deniedActor }, { reportingRepository: repository })
      ).rejects.toMatchObject({
        name: 'StaffCrmReportingAccessDeniedError',
      } satisfies Partial<StaffCrmReportingAccessDeniedError>);

      expect(repository.listWeightedPipelineRows).not.toHaveBeenCalled();
      expect(repository.listFunnelConversionRows).not.toHaveBeenCalled();
      expect(repository.listStageVelocityRows).not.toHaveBeenCalled();
    }
  });

  it('sorts and caps pipeline workload rows after branch, pipeline, and currency grouping', async () => {
    const repository = createRepository();
    repository.listWeightedPipelineRows.mockResolvedValue([
      ...Array.from({ length: STAFF_CRM_PIPELINE_MAX_ROWS + 2 }, (_, index) =>
        weightedRow({
          branchId: index % 2 === 0 ? null : `branch-${index}`,
          currencyCode: index % 2 === 0 ? 'USD' : 'EUR',
          dealId: `deal-${index}`,
          pipelineId: `pipeline-${String(index).padStart(2, '0')}`,
          valueAmountMinor: 1000 + index,
        })
      ),
      weightedRow({
        branchId: 'branch-top',
        dealId: 'deal-top-1',
        pipelineId: 'pipeline-top',
        valueAmountMinor: 50000,
      }),
      weightedRow({
        branchId: 'branch-top',
        dealId: 'deal-top-2',
        forecastCategory: 'best',
        pipelineId: 'pipeline-top',
        valueAmountMinor: 40000,
      }),
    ]);

    const dashboard = await getStaffCrmReportingCore(
      { actor },
      {
        labels: { noBranch: 'No branch' },
        now: () => '2026-05-14T12:00:00.000Z',
        reportingRepository: repository,
      }
    );

    expect(dashboard.pipelineWorkload.rows).toHaveLength(STAFF_CRM_PIPELINE_MAX_ROWS);
    expect(dashboard.pipelineWorkload.rows[0]).toMatchObject({
      branchLabel: 'branch-top',
      currencyCode: 'EUR',
      forecastBestAmountMinor: 32000,
      forecastCommitAmountMinor: 40000,
      openDealCount: 2,
      pipelineId: 'pipeline-top',
      weightedPipelineAmountMinor: 72000,
    });
    expect(dashboard.pipelineWorkload.rows.some(row => row.branchLabel === 'No branch')).toBe(true);
  });

  it('selects staff pipeline workload top rows after aggregating beyond the domain stable-key cap', async () => {
    const repository = createRepository();
    repository.listWeightedPipelineRows.mockResolvedValue([
      ...Array.from({ length: 260 }, (_, index) =>
        weightedRow({
          branchId: `branch-${String(index).padStart(3, '0')}`,
          dealId: `low-${index}`,
          pipelineId: `pipeline-${String(index).padStart(3, '0')}`,
          valueAmountMinor: 1000,
        })
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        weightedRow({
          branchId: 'zz-top-branch',
          dealId: `top-${index}`,
          pipelineId: 'zz-top-pipeline',
          valueAmountMinor: 20000,
        })
      ),
    ]);

    const dashboard = await getStaffCrmReportingCore(
      { actor },
      { now: () => '2026-05-14T12:00:00.000Z', reportingRepository: repository }
    );

    expect(dashboard.pipelineWorkload.rows[0]).toMatchObject({
      branchId: 'zz-top-branch',
      openDealCount: 4,
      pipelineId: 'zz-top-pipeline',
      weightedPipelineAmountMinor: 64000,
    });
  });

  it('deduplicates funnel movement by stage, recomputes rates, sorts by entries, and caps rows', async () => {
    const repository = createRepository();
    repository.listFunnelConversionRows.mockResolvedValue([
      funnelRow({ dealId: 'a-1', pipelineId: 'pipeline-a', stageId: 'stage-a', stageIsWon: true }),
      funnelRow({ dealId: 'a-2', pipelineId: 'pipeline-a', stageId: 'stage-a', stageIsLost: true }),
      funnelRow({ dealId: 'a-3', pipelineId: 'pipeline-a', stageId: 'stage-a' }),
      ...Array.from({ length: STAFF_CRM_FUNNEL_MAX_STAGES + 1 }, (_, index) =>
        funnelRow({
          dealId: `b-${index}`,
          pipelineId: `pipeline-${String(index).padStart(2, '0')}`,
          stageId: `stage-${String(index).padStart(2, '0')}`,
        })
      ),
    ]);

    const dashboard = await getStaffCrmReportingCore(
      { actor },
      { now: () => '2026-05-14T12:00:00.000Z', reportingRepository: repository }
    );

    expect(dashboard.funnelMovement.rows).toHaveLength(STAFF_CRM_FUNNEL_MAX_STAGES);
    expect(dashboard.funnelMovement.rows[0]).toMatchObject({
      conversionRateBps: 3333,
      dropOffRateBps: 3333,
      enteredCount: 3,
      lostCount: 1,
      pipelineId: 'pipeline-a',
      stageId: 'stage-a',
      wonCount: 1,
    });
  });

  it('filters low-sample stage velocity rows and sorts slowest stages first', async () => {
    const repository = createRepository();
    repository.listStageVelocityRows.mockResolvedValue([
      velocityRow({ dealId: 'slow-1', exitedAt: '2026-05-11T00:00:00.000Z', stageId: 'slow' }),
      velocityRow({ dealId: 'slow-2', exitedAt: '2026-05-12T00:00:00.000Z', stageId: 'slow' }),
      velocityRow({ dealId: 'slow-3', exitedAt: '2026-05-13T00:00:00.000Z', stageId: 'slow' }),
      velocityRow({ dealId: 'fast-1', exitedAt: '2026-05-02T00:00:00.000Z', stageId: 'fast' }),
      velocityRow({ dealId: 'fast-2', exitedAt: '2026-05-03T00:00:00.000Z', stageId: 'fast' }),
      velocityRow({ dealId: 'fast-3', exitedAt: '2026-05-04T00:00:00.000Z', stageId: 'fast' }),
      velocityRow({ dealId: 'low-1', stageId: 'low-sample' }),
      velocityRow({ dealId: 'low-2', stageId: 'low-sample' }),
      velocityRow({ dealId: 'open-1', exitedAt: null, stageId: 'open-stage' }),
    ]);

    const dashboard = await getStaffCrmReportingCore(
      { actor },
      { now: () => '2026-05-14T12:00:00.000Z', reportingRepository: repository }
    );

    expect(dashboard.stageVelocity.summary.excludedOpenIntervalCount).toBe(1);
    expect(dashboard.stageVelocity.summary.rows.map(row => row.stageId)).toEqual(['slow', 'fast']);
    expect(
      dashboard.stageVelocity.summary.rows.every(
        row => row.sampleCount >= STAFF_CRM_STAGE_VELOCITY_MIN_SAMPLE_COUNT
      )
    ).toBe(true);
  });

  it('returns empty widgets when CRM05 repositories return no aggregate rows', async () => {
    const repository = createRepository();
    repository.listWeightedPipelineRows.mockResolvedValue([]);
    repository.listFunnelConversionRows.mockResolvedValue([]);
    repository.listStageVelocityRows.mockResolvedValue([]);

    const dashboard = await getStaffCrmReportingCore(
      { actor },
      { now: () => '2026-05-14T12:00:00.000Z', reportingRepository: repository }
    );

    expect(dashboard.pipelineWorkload.state).toBe('empty');
    expect(dashboard.funnelMovement.state).toBe('empty');
    expect(dashboard.stageVelocity.state).toBe('empty');
  });

  it('maps reporting denials and repository failures to staff-safe widget errors', async () => {
    const repository = createRepository();
    const logger = { error: vi.fn() };
    repository.listFunnelConversionRows.mockRejectedValueOnce(
      new Error('CRM reporting read denied: branch_scope')
    );
    repository.listStageVelocityRows.mockRejectedValueOnce(
      new Error('database details with sensitive context')
    );

    const dashboard = await getStaffCrmReportingCore(
      { actor },
      {
        logger,
        now: () => '2026-05-14T12:00:00.000Z',
        reportingRepository: repository,
      }
    );

    expect(dashboard.funnelMovement).toEqual({
      excludedRowCount: 0,
      messageKey: 'error.branch',
      rows: [],
      state: 'error',
    });
    expect(dashboard.stageVelocity).toEqual({
      excludedRowCount: 0,
      messageKey: 'error.generic',
      state: 'error',
      summary: { excludedOpenIntervalCount: 0, rows: [] },
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('keeps output row shapes aggregate-only and PII-free', async () => {
    const repository = createRepository();
    const dashboard = await getStaffCrmReportingCore(
      { actor },
      { now: () => '2026-05-14T12:00:00.000Z', reportingRepository: repository }
    );

    const rowKeys = [
      ...Object.keys(dashboard.pipelineWorkload.rows[0] ?? {}),
      ...Object.keys(dashboard.funnelMovement.rows[0] ?? {}),
      ...Object.keys(dashboard.stageVelocity.summary.rows[0] ?? {}),
    ];

    for (const forbiddenKey of STAFF_CRM_FORBIDDEN_PII_KEYS) {
      expect(rowKeys).not.toContain(forbiddenKey);
    }
  });
});
