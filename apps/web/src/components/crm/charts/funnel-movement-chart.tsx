'use client';

import {
  CRM_REPORTING_CHART_COLORS,
  CRM_REPORTING_CHART_FUNNEL_MOVEMENT_MARKER,
} from './chart-contract';
import {
  projectFunnelMovementRows,
  truncateChartLabel,
  type FunnelMovementChartRow,
} from './chart-projections';
import { ReportingBarChart } from './reporting-bar-chart';

export type FunnelMovementChartProps = Readonly<{
  description: string;
  locale: string;
  rows: readonly FunnelMovementChartRow[];
  summary: string;
  text: {
    entered: string;
    exited: string;
    lost: string;
    won: string;
  };
  title: string;
}>;

function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function FunnelMovementChart({
  description,
  locale,
  rows,
  summary,
  text,
  title,
}: FunnelMovementChartProps) {
  const chartRows = projectFunnelMovementRows(rows).map(row => ({
    ...row,
    displayLabel: truncateChartLabel(row.label),
  }));
  if (chartRows.length === 0) return null;

  return (
    <ReportingBarChart
      description={description}
      marker={CRM_REPORTING_CHART_FUNNEL_MOVEMENT_MARKER}
      panels={[
        {
          key: CRM_REPORTING_CHART_FUNNEL_MOVEMENT_MARKER,
          rows: chartRows,
          tickFormatter: value => formatCount(value, locale),
        },
      ]}
      series={[
        { color: CRM_REPORTING_CHART_COLORS.entered, dataKey: 'enteredCount', name: text.entered },
        { color: CRM_REPORTING_CHART_COLORS.exited, dataKey: 'exitedCount', name: text.exited },
        { color: CRM_REPORTING_CHART_COLORS.won, dataKey: 'wonCount', name: text.won },
        { color: CRM_REPORTING_CHART_COLORS.lost, dataKey: 'lostCount', name: text.lost },
      ]}
      summary={summary}
      title={title}
    />
  );
}
