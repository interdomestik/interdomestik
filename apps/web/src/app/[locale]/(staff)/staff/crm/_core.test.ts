import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_AUTHORITY, actor, createRepository, weightedRow } from './_core.test-support';
import {
  STAFF_CRM_PIPELINE_MAX_ROWS,
  StaffCrmReportingAccessDeniedError,
  createStaffCrmReportingWindow,
  getStaffCrmReportingCore,
} from './_core';

describe('staff CRM reporting core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds CRM15 widgets from CRM05 reporting repositories with one frozen window', async () => {
    const repository = createRepository();
    const now = '2026-05-14T12:00:00.000Z';

    const dashboard = await getStaffCrmReportingCore(
      { authority: TEST_AUTHORITY, actor },
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
        getStaffCrmReportingCore(
          { authority: TEST_AUTHORITY, actor: deniedActor },
          { reportingRepository: repository }
        )
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
      { authority: TEST_AUTHORITY, actor },
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
      { authority: TEST_AUTHORITY, actor },
      { now: () => '2026-05-14T12:00:00.000Z', reportingRepository: repository }
    );

    expect(dashboard.pipelineWorkload.rows[0]).toMatchObject({
      branchId: 'zz-top-branch',
      openDealCount: 4,
      pipelineId: 'zz-top-pipeline',
      weightedPipelineAmountMinor: 64000,
    });
  });
});
