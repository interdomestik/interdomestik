'use client';

import {
  CRM_REPORTING_CHART_COLORS,
  CRM_REPORTING_CHART_PIPELINE_AMOUNT_MARKER,
} from './chart-contract';
import {
  groupPipelineAmountRowsByCurrency,
  truncateChartLabel,
  type PipelineAmountChartRow,
} from './chart-projections';
import { ReportingBarChart } from './reporting-bar-chart';

export type PipelineAmountChartProps = Readonly<{
  description: string;
  locale: string;
  rows: readonly PipelineAmountChartRow[];
  summary: string;
  text: {
    total: string;
    weighted: string;
  };
  title: string;
}>;

function formatAmount(value: number, locale: string, currencyCode: string): string {
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value)} ${currencyCode}`;
}

export function PipelineAmountChart({
  description,
  locale,
  rows,
  summary,
  text,
  title,
}: PipelineAmountChartProps) {
  const groups = groupPipelineAmountRowsByCurrency(rows);
  if (groups.length === 0) return null;

  return (
    <ReportingBarChart
      description={description}
      marker={CRM_REPORTING_CHART_PIPELINE_AMOUNT_MARKER}
      panels={groups.map(group => ({
        chartMinHeight: 220,
        chartRowHeight: 38,
        key: group.currencyCode,
        label: group.currencyCode,
        rows: group.rows.map(row => ({
          ...row,
          displayLabel: truncateChartLabel(row.label),
          totalAmount: row.totalAmountMinor / 100,
          weightedAmount: row.weightedAmountMinor / 100,
        })),
        tickFormatter: value => formatAmount(value, locale, group.currencyCode),
        yAxisWidth: 96,
      }))}
      series={[
        { color: CRM_REPORTING_CHART_COLORS.total, dataKey: 'totalAmount', name: text.total },
        {
          color: CRM_REPORTING_CHART_COLORS.weighted,
          dataKey: 'weightedAmount',
          name: text.weighted,
        },
      ]}
      summary={summary}
      title={title}
    />
  );
}
