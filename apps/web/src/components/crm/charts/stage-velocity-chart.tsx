'use client';

import {
  CRM_REPORTING_CHART_COLORS,
  CRM_REPORTING_CHART_STAGE_VELOCITY_MARKER,
} from './chart-contract';
import {
  projectStageVelocityRows,
  truncateChartLabel,
  type StageVelocityChartRow,
} from './chart-projections';
import { ReportingBarChart } from './reporting-bar-chart';

export type StageVelocityChartProps = Readonly<{
  description: string;
  locale: string;
  rows: readonly StageVelocityChartRow[];
  summary: string;
  text: {
    average: string;
    median: string;
  };
  title: string;
}>;

function formatDays(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

export function StageVelocityChart({
  description,
  locale,
  rows,
  summary,
  text,
  title,
}: StageVelocityChartProps) {
  const chartRows = projectStageVelocityRows(rows).map(row => ({
    ...row,
    displayLabel: truncateChartLabel(row.label),
  }));
  if (chartRows.length === 0) return null;

  return (
    <ReportingBarChart
      description={description}
      marker={CRM_REPORTING_CHART_STAGE_VELOCITY_MARKER}
      panels={[
        {
          key: CRM_REPORTING_CHART_STAGE_VELOCITY_MARKER,
          rows: chartRows,
          tickFormatter: value => formatDays(value, locale),
        },
      ]}
      series={[
        { color: CRM_REPORTING_CHART_COLORS.median, dataKey: 'medianDays', name: text.median },
        { color: CRM_REPORTING_CHART_COLORS.average, dataKey: 'averageDays', name: text.average },
      ]}
      summary={summary}
      title={title}
    />
  );
}
