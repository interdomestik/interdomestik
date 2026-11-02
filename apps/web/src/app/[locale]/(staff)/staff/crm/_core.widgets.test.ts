import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEST_AUTHORITY,
  actor,
  createRepository,
  funnelRow,
  velocityRow,
} from './_core.test-support';
import {
  STAFF_CRM_FORBIDDEN_PII_KEYS,
  STAFF_CRM_FUNNEL_MAX_STAGES,
  STAFF_CRM_STAGE_VELOCITY_MIN_SAMPLE_COUNT,
  getStaffCrmReportingCore,
} from './_core';

describe('staff CRM reporting core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      { authority: TEST_AUTHORITY, actor },
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
      { authority: TEST_AUTHORITY, actor },
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
      { authority: TEST_AUTHORITY, actor },
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
      { authority: TEST_AUTHORITY, actor },
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
      { authority: TEST_AUTHORITY, actor },
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
