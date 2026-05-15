import { describe, expect, it } from 'vitest';

import {
  CRM_REPORTING_CHART_A11Y_SUMMARY_MAX_ITEMS,
  CRM_REPORTING_CHART_MAX_CATEGORIES,
} from './chart-contract';
import {
  buildFunnelMovementScreenReaderSummary,
  buildPipelineAmountScreenReaderSummary,
  buildStageVelocityScreenReaderSummary,
  groupPipelineAmountRowsByCurrency,
  projectFunnelMovementRows,
  projectStageVelocityRows,
  truncateChartLabel,
  type FunnelMovementChartRow,
  type PipelineAmountChartRow,
  type StageVelocityChartRow,
} from './chart-projections';

function pipelineRow(overrides: Partial<PipelineAmountChartRow>): PipelineAmountChartRow {
  const currencyCode = overrides.currencyCode ?? 'EUR';
  const weightedAmountMinor = overrides.weightedAmountMinor ?? 1000;
  const totalAmountMinor = overrides.totalAmountMinor ?? weightedAmountMinor;
  return {
    currencyCode,
    id: overrides.id ?? `${currencyCode}-${weightedAmountMinor}`,
    label: overrides.label ?? `Pipeline ${weightedAmountMinor}`,
    totalAmountMinor,
    totalFormatted: overrides.totalFormatted ?? `${totalAmountMinor / 100} ${currencyCode}`,
    weightedAmountMinor,
    weightedFormatted:
      overrides.weightedFormatted ?? `${weightedAmountMinor / 100} ${currencyCode}`,
  };
}

describe('CRM reporting chart projections', () => {
  it('caps pipeline amount rows per currency panel after deterministic weighted sorting', () => {
    const rows = [
      ...Array.from({ length: CRM_REPORTING_CHART_MAX_CATEGORIES + 2 }, (_, index) =>
        pipelineRow({
          currencyCode: 'EUR',
          id: `eur-${index}`,
          label: `EUR row ${index}`,
          totalAmountMinor: index * 1000,
          weightedAmountMinor: index * 1000,
        })
      ),
      pipelineRow({
        currencyCode: 'USD',
        id: 'usd-1',
        label: 'USD row',
        totalAmountMinor: 900,
        weightedAmountMinor: 900,
      }),
    ];

    const groups = groupPipelineAmountRowsByCurrency(rows);

    expect(groups).toHaveLength(2);
    expect(groups[0].currencyCode).toBe('EUR');
    expect(groups[0].rows).toHaveLength(CRM_REPORTING_CHART_MAX_CATEGORIES);
    expect(groups[0].hiddenCount).toBe(2);
    expect(groups[0].rows[0].label).toBe('EUR row 13');
    expect(groups[1].currencyCode).toBe('USD');
    expect(groups[1].rows).toHaveLength(1);
  });

  it('builds deterministic bounded screen-reader summaries for pipeline amount rows', () => {
    const rows = Array.from(
      { length: CRM_REPORTING_CHART_A11Y_SUMMARY_MAX_ITEMS + 1 },
      (_, index) =>
        pipelineRow({
          id: `pipeline-${index}`,
          label: `Pipeline ${index}`,
          totalAmountMinor: index * 100,
          totalFormatted: `${index} EUR`,
          weightedAmountMinor: index * 100,
          weightedFormatted: `${index} EUR`,
        })
    );

    const summary = buildPipelineAmountScreenReaderSummary(rows, {
      hiddenItems: count => `${count} hidden`,
      intro: 'Pipeline summary',
      total: 'Total',
      weighted: 'Weighted',
    });

    expect(summary).toContain('Pipeline 5');
    expect(summary).not.toContain('Pipeline 0');
    expect(summary).toContain('1 hidden');
  });

  it('sorts and caps funnel rows by entered count', () => {
    const rows: FunnelMovementChartRow[] = Array.from(
      { length: CRM_REPORTING_CHART_MAX_CATEGORIES + 1 },
      (_, index) => ({
        enteredCount: index,
        enteredFormatted: String(index),
        exitedCount: 0,
        exitedFormatted: '0',
        id: `stage-${index}`,
        label: `Stage ${index}`,
        lostCount: 0,
        lostFormatted: '0',
        wonCount: 0,
        wonFormatted: '0',
      })
    );

    const projected = projectFunnelMovementRows(rows);

    expect(projected).toHaveLength(CRM_REPORTING_CHART_MAX_CATEGORIES);
    expect(projected[0].label).toBe('Stage 12');
    expect(projected.at(-1)?.label).toBe('Stage 1');
  });

  it('sorts and caps stage velocity rows by median days', () => {
    const rows: StageVelocityChartRow[] = Array.from(
      { length: CRM_REPORTING_CHART_MAX_CATEGORIES + 1 },
      (_, index) => ({
        averageDays: index,
        averageFormatted: `${index} days`,
        id: `stage-${index}`,
        label: `Stage ${index}`,
        medianDays: index,
        medianFormatted: `${index} days`,
      })
    );

    const projected = projectStageVelocityRows(rows);

    expect(projected).toHaveLength(CRM_REPORTING_CHART_MAX_CATEGORIES);
    expect(projected[0].label).toBe('Stage 12');
    expect(projected.at(-1)?.label).toBe('Stage 1');
  });

  it('keeps funnel and velocity summaries deterministic', () => {
    const funnelSummary = buildFunnelMovementScreenReaderSummary(
      [
        {
          enteredCount: 1,
          enteredFormatted: '1',
          exitedCount: 0,
          exitedFormatted: '0',
          id: 'a',
          label: 'A',
          lostCount: 0,
          lostFormatted: '0',
          wonCount: 0,
          wonFormatted: '0',
        },
        {
          enteredCount: 3,
          enteredFormatted: '3',
          exitedCount: 1,
          exitedFormatted: '1',
          id: 'b',
          label: 'B',
          lostCount: 1,
          lostFormatted: '1',
          wonCount: 1,
          wonFormatted: '1',
        },
      ],
      {
        entered: 'Entered',
        exited: 'Exited',
        hiddenItems: count => `${count} hidden`,
        intro: 'Funnel',
        lost: 'Lost',
        won: 'Won',
      }
    );
    const velocitySummary = buildStageVelocityScreenReaderSummary(
      [
        {
          averageDays: 1,
          averageFormatted: '1 day',
          id: 'a',
          label: 'A',
          medianDays: 1,
          medianFormatted: '1 day',
        },
        {
          averageDays: 4,
          averageFormatted: '4 days',
          id: 'b',
          label: 'B',
          medianDays: 5,
          medianFormatted: '5 days',
        },
      ],
      {
        average: 'Average',
        hiddenItems: count => `${count} hidden`,
        intro: 'Velocity',
        median: 'Median',
      }
    );

    expect(funnelSummary.indexOf('B')).toBeLessThan(funnelSummary.indexOf('A'));
    expect(velocitySummary.indexOf('B')).toBeLessThan(velocitySummary.indexOf('A'));
  });

  it('truncates long axis labels for visible chart labels only', () => {
    expect(truncateChartLabel('short')).toBe('short');
    expect(truncateChartLabel('012345678901234567890')).toBe('0123456789012345678…');
  });
});
