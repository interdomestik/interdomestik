'use client';

import { CRM_REPORTING_CHART_COLORS } from './chart-contract';

type ReportingBarSeries = Readonly<{
  color: string;
  dataKey: string;
  name: string;
}>;

type ReportingBarPanel<Row extends { displayLabel: string }> = Readonly<{
  chartMinHeight?: number;
  chartRowHeight?: number;
  key: string;
  label?: string;
  rows: readonly Row[];
  tickFormatter: (value: number) => string;
  yAxisWidth?: number;
}>;

export type ReportingBarChartProps<Row extends { displayLabel: string }> = Readonly<{
  description: string;
  marker: string;
  panels: readonly ReportingBarPanel<Row>[];
  series: readonly ReportingBarSeries[];
  summary: string;
  title: string;
}>;

const CHART_WIDTH = 720;
const PLOT_LEFT = 88;
const PLOT_RIGHT = 24;
const PLOT_TOP = 44;
const PLOT_BOTTOM = 74;
const MAX_BAR_WIDTH = 18;
const MIN_BAR_HEIGHT = 2;

function chartHeight<Row extends { displayLabel: string }>(panel: ReportingBarPanel<Row>): number {
  return Math.max(
    panel.chartMinHeight ?? 240,
    panel.rows.length * (panel.chartRowHeight ?? 38) + 112
  );
}

function numericValue<Row extends { displayLabel: string }>(row: Row, dataKey: string): number {
  const value = row[dataKey as keyof Row];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function maxPanelValue<Row extends { displayLabel: string }>(
  rows: readonly Row[],
  series: readonly ReportingBarSeries[]
): number {
  return Math.max(1, ...rows.flatMap(row => series.map(item => numericValue(row, item.dataKey))));
}

function tickValues(maxValue: number): number[] {
  return [0, maxValue / 2, maxValue];
}

export function ReportingBarChart<Row extends { displayLabel: string }>({
  description,
  marker,
  panels,
  series,
  summary,
  title,
}: ReportingBarChartProps<Row>) {
  if (panels.length === 0) return null;

  return (
    <section
      aria-labelledby={`${marker}-title`}
      className="mt-5 border-t pt-5"
      data-testid={marker}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground" id={`${marker}-title`}>
          {title}
        </h3>
        <p className="text-xs text-muted-foreground">{description}</p>
        <p className="sr-only">{summary}</p>
      </div>
      <div className="mt-4 space-y-5">
        {panels.map(panel => {
          const shouldRotateLabels = panel.rows.length >= 6;
          const height = chartHeight(panel);
          const plotWidth = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT;
          const plotHeight = height - PLOT_TOP - PLOT_BOTTOM;
          const groupWidth = plotWidth / Math.max(1, panel.rows.length);
          const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, groupWidth / (series.length + 1)));
          const maxValue = maxPanelValue(panel.rows, series);

          return (
            <div key={panel.key} className="space-y-2">
              {panel.label ? (
                <p className="text-xs font-medium text-muted-foreground">{panel.label}</p>
              ) : null}
              <div aria-hidden="true" className="w-full overflow-x-auto">
                <svg
                  className="block"
                  data-chart-animation="false"
                  height={height}
                  role="img"
                  viewBox={`0 0 ${CHART_WIDTH} ${height}`}
                  width={CHART_WIDTH}
                >
                  {series.map((item, index) => (
                    <g key={item.dataKey}>
                      <rect
                        fill={item.color}
                        height="8"
                        rx="2"
                        width="8"
                        x={PLOT_LEFT + index * 120}
                        y="12"
                      />
                      <text
                        fill={CRM_REPORTING_CHART_COLORS.tick}
                        fontSize="12"
                        x={PLOT_LEFT + index * 120 + 14}
                        y="20"
                      >
                        {item.name}
                      </text>
                    </g>
                  ))}
                  {tickValues(maxValue).map(value => {
                    const y = PLOT_TOP + plotHeight - (value / maxValue) * plotHeight;

                    return (
                      <g key={value}>
                        <line
                          stroke={CRM_REPORTING_CHART_COLORS.grid}
                          x1={PLOT_LEFT}
                          x2={CHART_WIDTH - PLOT_RIGHT}
                          y1={y}
                          y2={y}
                        />
                        <text
                          fill={CRM_REPORTING_CHART_COLORS.tick}
                          fontSize="12"
                          textAnchor="end"
                          x={PLOT_LEFT - 10}
                          y={y + 4}
                        >
                          {panel.tickFormatter(value)}
                        </text>
                      </g>
                    );
                  })}
                  <line
                    stroke={CRM_REPORTING_CHART_COLORS.tick}
                    x1={PLOT_LEFT}
                    x2={PLOT_LEFT}
                    y1={PLOT_TOP}
                    y2={PLOT_TOP + plotHeight}
                  />
                  <line
                    stroke={CRM_REPORTING_CHART_COLORS.tick}
                    x1={PLOT_LEFT}
                    x2={CHART_WIDTH - PLOT_RIGHT}
                    y1={PLOT_TOP + plotHeight}
                    y2={PLOT_TOP + plotHeight}
                  />
                  {panel.rows.map((row, rowIndex) => {
                    const groupX = PLOT_LEFT + rowIndex * groupWidth + groupWidth / 2;
                    const labelY = PLOT_TOP + plotHeight + 24;
                    const labelProps = shouldRotateLabels
                      ? {
                          textAnchor: 'end' as const,
                          transform: `rotate(-30 ${groupX} ${labelY})`,
                        }
                      : { textAnchor: 'middle' as const };

                    return (
                      <g key={`${panel.key}-${row.displayLabel}`}>
                        {series.map((item, seriesIndex) => {
                          const value = numericValue(row, item.dataKey);
                          const scaledHeight = Math.max(
                            value > 0 ? MIN_BAR_HEIGHT : 0,
                            (value / maxValue) * plotHeight
                          );
                          const x =
                            groupX -
                            (series.length * barWidth) / 2 +
                            seriesIndex * barWidth +
                            seriesIndex * 2;
                          const y = PLOT_TOP + plotHeight - scaledHeight;

                          return (
                            <rect
                              data-animation="false"
                              data-fill={item.color}
                              data-testid={`crm-chart-bar-${item.dataKey}`}
                              fill={item.color}
                              height={scaledHeight}
                              key={item.dataKey}
                              rx="3"
                              width={barWidth}
                              x={x}
                              y={y}
                            />
                          );
                        })}
                        <text
                          fill={CRM_REPORTING_CHART_COLORS.tick}
                          fontSize="12"
                          x={groupX}
                          y={labelY}
                          {...labelProps}
                        >
                          {row.displayLabel}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
