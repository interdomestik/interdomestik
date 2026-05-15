import {
  CRM_REPORTING_CHART_A11Y_SUMMARY_MAX_ITEMS,
  CRM_REPORTING_CHART_AXIS_LABEL_MAX_LENGTH,
  CRM_REPORTING_CHART_MAX_CATEGORIES,
} from './chart-contract';

export type PipelineAmountChartRow = Readonly<{
  currencyCode: string;
  id: string;
  label: string;
  totalAmountMinor: number;
  totalFormatted: string;
  weightedAmountMinor: number;
  weightedFormatted: string;
}>;

export type FunnelMovementChartRow = Readonly<{
  enteredCount: number;
  enteredFormatted: string;
  exitedCount: number;
  exitedFormatted: string;
  id: string;
  label: string;
  lostCount: number;
  lostFormatted: string;
  wonCount: number;
  wonFormatted: string;
}>;

export type StageVelocityChartRow = Readonly<{
  averageDays: number;
  averageFormatted: string;
  id: string;
  label: string;
  medianDays: number;
  medianFormatted: string;
}>;

export type CurrencyPipelineAmountChartGroup = Readonly<{
  currencyCode: string;
  hiddenCount: number;
  rows: PipelineAmountChartRow[];
}>;

export function truncateChartLabel(label: string): string {
  if (label.length <= CRM_REPORTING_CHART_AXIS_LABEL_MAX_LENGTH) return label;
  return `${label.slice(0, CRM_REPORTING_CHART_AXIS_LABEL_MAX_LENGTH - 1)}…`;
}

function compareLabel(left: string, right: string): number {
  return left.localeCompare(right);
}

function comparePipelineRows(left: PipelineAmountChartRow, right: PipelineAmountChartRow): number {
  if (right.weightedAmountMinor !== left.weightedAmountMinor) {
    return right.weightedAmountMinor - left.weightedAmountMinor;
  }
  if (right.totalAmountMinor !== left.totalAmountMinor) {
    return right.totalAmountMinor - left.totalAmountMinor;
  }
  return compareLabel(left.label, right.label);
}

function compareFunnelRows(left: FunnelMovementChartRow, right: FunnelMovementChartRow): number {
  if (right.enteredCount !== left.enteredCount) return right.enteredCount - left.enteredCount;
  return compareLabel(left.label, right.label);
}

function compareVelocityRows(left: StageVelocityChartRow, right: StageVelocityChartRow): number {
  if (right.medianDays !== left.medianDays) return right.medianDays - left.medianDays;
  if (right.averageDays !== left.averageDays) return right.averageDays - left.averageDays;
  return compareLabel(left.label, right.label);
}

export function groupPipelineAmountRowsByCurrency(
  rows: readonly PipelineAmountChartRow[]
): CurrencyPipelineAmountChartGroup[] {
  const byCurrency = new Map<string, PipelineAmountChartRow[]>();
  for (const row of rows) {
    const currencyRows = byCurrency.get(row.currencyCode) ?? [];
    currencyRows.push(row);
    byCurrency.set(row.currencyCode, currencyRows);
  }

  return [...byCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currencyCode, currencyRows]) => {
      const sortedRows = [...currencyRows].sort(comparePipelineRows);
      return {
        currencyCode,
        hiddenCount: Math.max(0, sortedRows.length - CRM_REPORTING_CHART_MAX_CATEGORIES),
        rows: sortedRows.slice(0, CRM_REPORTING_CHART_MAX_CATEGORIES),
      };
    });
}

export function projectFunnelMovementRows(
  rows: readonly FunnelMovementChartRow[]
): FunnelMovementChartRow[] {
  return [...rows].sort(compareFunnelRows).slice(0, CRM_REPORTING_CHART_MAX_CATEGORIES);
}

export function projectStageVelocityRows(
  rows: readonly StageVelocityChartRow[]
): StageVelocityChartRow[] {
  return [...rows].sort(compareVelocityRows).slice(0, CRM_REPORTING_CHART_MAX_CATEGORIES);
}

export function buildPipelineAmountScreenReaderSummary(
  rows: readonly PipelineAmountChartRow[],
  labels: Readonly<{
    hiddenItems: (count: number) => string;
    intro: string;
    total: string;
    weighted: string;
  }>
): string {
  const sortedRows = [...rows].sort(comparePipelineRows);
  const visibleRows = sortedRows.slice(0, CRM_REPORTING_CHART_A11Y_SUMMARY_MAX_ITEMS);
  const hiddenCount = Math.max(0, sortedRows.length - visibleRows.length);
  const summary = visibleRows.map(
    row =>
      `${row.label} (${row.currencyCode}): ${labels.weighted} ${row.weightedFormatted}, ${labels.total} ${row.totalFormatted}`
  );
  if (hiddenCount > 0) summary.push(labels.hiddenItems(hiddenCount));
  return [labels.intro, ...summary].join('. ');
}

export function buildFunnelMovementScreenReaderSummary(
  rows: readonly FunnelMovementChartRow[],
  labels: Readonly<{
    entered: string;
    exited: string;
    hiddenItems: (count: number) => string;
    intro: string;
    lost: string;
    won: string;
  }>
): string {
  const sortedRows = [...rows].sort(compareFunnelRows);
  const visibleRows = sortedRows.slice(0, CRM_REPORTING_CHART_A11Y_SUMMARY_MAX_ITEMS);
  const hiddenCount = Math.max(0, sortedRows.length - visibleRows.length);
  const summary = visibleRows.map(
    row =>
      `${row.label}: ${labels.entered} ${row.enteredFormatted}, ${labels.exited} ${row.exitedFormatted}, ${labels.won} ${row.wonFormatted}, ${labels.lost} ${row.lostFormatted}`
  );
  if (hiddenCount > 0) summary.push(labels.hiddenItems(hiddenCount));
  return [labels.intro, ...summary].join('. ');
}

export function buildStageVelocityScreenReaderSummary(
  rows: readonly StageVelocityChartRow[],
  labels: Readonly<{
    average: string;
    hiddenItems: (count: number) => string;
    intro: string;
    median: string;
  }>
): string {
  const sortedRows = [...rows].sort(compareVelocityRows);
  const visibleRows = sortedRows.slice(0, CRM_REPORTING_CHART_A11Y_SUMMARY_MAX_ITEMS);
  const hiddenCount = Math.max(0, sortedRows.length - visibleRows.length);
  const summary = visibleRows.map(
    row =>
      `${row.label}: ${labels.median} ${row.medianFormatted}, ${labels.average} ${row.averageFormatted}`
  );
  if (hiddenCount > 0) summary.push(labels.hiddenItems(hiddenCount));
  return [labels.intro, ...summary].join('. ');
}
