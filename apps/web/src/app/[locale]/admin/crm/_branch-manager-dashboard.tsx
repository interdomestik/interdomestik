import { Suspense } from 'react';

import {
  buildPipelineAmountScreenReaderSummary,
  type PipelineAmountChartRow,
} from '@/components/crm/charts/chart-projections';
import { PipelineAmountChartBoundary } from '@/components/crm/charts/reporting-chart-boundary';

import {
  BRANCH_MANAGER_CRM_REPORTING_MARKER_PREFIX,
  type BranchManagerCrmPipelineRow,
  type BranchManagerCrmReportingDashboard,
  type BranchManagerCrmSnapshotRow,
  type BranchManagerCrmSourceBreakdownRow,
  type BranchManagerCrmWidget,
} from './_branch-manager-core';
import {
  ExcludedRowsNote,
  PipelineRowsList,
  ReportingWidget,
  SnapshotRowsList,
  SourceRowsList,
  WidgetEmpty,
  WidgetError,
  formatMinorAmount,
  type AdminCrmFormatter,
  type AdminCrmTranslations,
} from './_reporting-dashboard-primitives';

type Formatter = AdminCrmFormatter;
type Translations = AdminCrmTranslations;

function toBranchManagerPipelineAmountChartRows(
  format: Formatter,
  rows: readonly BranchManagerCrmPipelineRow[]
): PipelineAmountChartRow[] {
  return rows.map(row => {
    const label = `${row.branchLabel} / ${row.pipelineLabel}`;
    return {
      currencyCode: row.currencyCode,
      id: `${row.branchId}-${row.pipelineId}-${row.currencyCode}`,
      label,
      totalAmountMinor: row.totalPipelineAmountMinor,
      totalFormatted: formatMinorAmount(format, row.totalPipelineAmountMinor, row.currencyCode),
      weightedAmountMinor: row.weightedPipelineAmountMinor,
      weightedFormatted: formatMinorAmount(
        format,
        row.weightedPipelineAmountMinor,
        row.currencyCode
      ),
    };
  });
}

function BranchManagerSnapshotWidget({
  format,
  snapshot,
  t,
}: Readonly<{
  format: Formatter;
  snapshot: BranchManagerCrmWidget<BranchManagerCrmSnapshotRow>;
  t: Translations;
}>) {
  return (
    <ReportingWidget
      title={t('branchManager.snapshot.title')}
      description={t('branchManager.snapshot.description')}
      marker={`${BRANCH_MANAGER_CRM_REPORTING_MARKER_PREFIX}snapshot`}
    >
      {snapshot.state === 'error' ? <WidgetError message={t(snapshot.messageKey)} /> : null}
      {snapshot.state === 'empty' ? (
        <WidgetEmpty message={t('branchManager.snapshot.empty')} />
      ) : null}
      {snapshot.state === 'data' && snapshot.rows[0]?.freshness === 'stale' ? (
        <WidgetEmpty message={t('branchManager.snapshot.staleEmpty')} />
      ) : null}
      {snapshot.state === 'data' && snapshot.rows[0]?.freshness !== 'stale' ? (
        <SnapshotRowsList
          format={format}
          getKey={row => `${row.pipelineId}-${row.branchId}-${row.currencyCode}`}
          rows={snapshot.rows}
          t={t}
        />
      ) : null}
    </ReportingWidget>
  );
}

function BranchManagerPipelineWidget({
  branchPipeline,
  format,
  locale,
  t,
}: Readonly<{
  branchPipeline: BranchManagerCrmWidget<BranchManagerCrmPipelineRow>;
  format: Formatter;
  locale: string;
  t: Translations;
}>) {
  const chartRows =
    branchPipeline.state === 'data'
      ? toBranchManagerPipelineAmountChartRows(format, branchPipeline.rows)
      : [];
  const chartSummary =
    chartRows.length > 0
      ? buildPipelineAmountScreenReaderSummary(chartRows, {
          hiddenItems: count => t('charts.hiddenItems', { count }),
          intro: t('charts.pipelineAmount.summaryIntro'),
          total: t('charts.pipelineAmount.total'),
          weighted: t('charts.pipelineAmount.weighted'),
        })
      : '';

  return (
    <ReportingWidget
      title={t('branchManager.branchPipeline.title')}
      description={t('branchManager.branchPipeline.description')}
      marker={`${BRANCH_MANAGER_CRM_REPORTING_MARKER_PREFIX}branch-pipeline`}
    >
      {branchPipeline.state === 'error' ? (
        <WidgetError message={t(branchPipeline.messageKey)} />
      ) : null}
      {branchPipeline.state === 'empty' ? (
        <WidgetEmpty message={t('branchManager.branchPipeline.empty')} />
      ) : null}
      {branchPipeline.state === 'data' ? (
        <PipelineRowsList
          format={format}
          getBranchLabel={row => row.branchLabel}
          getKey={row => `${row.branchId}-${row.pipelineId}-${row.currencyCode}`}
          rows={branchPipeline.rows}
          t={t}
        />
      ) : null}
      {chartRows.length > 0 ? (
        <Suspense fallback={null}>
          <PipelineAmountChartBoundary
            description={t('charts.pipelineAmount.description')}
            locale={locale}
            rows={chartRows}
            summary={chartSummary}
            text={{
              total: t('charts.pipelineAmount.total'),
              weighted: t('charts.pipelineAmount.weighted'),
            }}
            title={t('charts.pipelineAmount.title')}
          />
        </Suspense>
      ) : null}
      <ExcludedRowsNote
        count={branchPipeline.excludedRowCount}
        label={t('excludedRows', { count: branchPipeline.excludedRowCount })}
        title={t('excludedRowsHelp')}
      />
    </ReportingWidget>
  );
}

function BranchManagerSourceBreakdownWidget({
  format,
  sourceBreakdown,
  t,
}: Readonly<{
  format: Formatter;
  sourceBreakdown: BranchManagerCrmWidget<BranchManagerCrmSourceBreakdownRow>;
  t: Translations;
}>) {
  return (
    <ReportingWidget
      title={t('branchManager.sourceBreakdown.title')}
      description={t('branchManager.sourceBreakdown.description')}
      marker={`${BRANCH_MANAGER_CRM_REPORTING_MARKER_PREFIX}source-breakdown`}
    >
      {sourceBreakdown.state === 'error' ? (
        <WidgetError message={t(sourceBreakdown.messageKey)} />
      ) : null}
      {sourceBreakdown.state === 'empty' ? (
        <WidgetEmpty message={t('branchManager.sourceBreakdown.empty')} />
      ) : null}
      {sourceBreakdown.state === 'data' ? (
        <SourceRowsList
          format={format}
          getKey={row => `${row.branchId}-${row.sourceLabel}-${row.currencyCode}`}
          rows={sourceBreakdown.rows}
          t={t}
        />
      ) : null}
      <ExcludedRowsNote
        count={sourceBreakdown.excludedRowCount}
        label={t('excludedRows', { count: sourceBreakdown.excludedRowCount })}
        title={t('excludedRowsHelp')}
      />
    </ReportingWidget>
  );
}

export function BranchManagerCrmDashboard({
  format,
  locale,
  reporting,
  t,
}: Readonly<{
  format: Formatter;
  locale: string;
  reporting: BranchManagerCrmReportingDashboard;
  t: Translations;
}>) {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-3">
        <BranchManagerSnapshotWidget format={format} snapshot={reporting.snapshot} t={t} />
        <div className="xl:col-span-2">
          <BranchManagerPipelineWidget
            branchPipeline={reporting.branchPipeline}
            format={format}
            locale={locale}
            t={t}
          />
        </div>
      </div>

      <BranchManagerSourceBreakdownWidget
        format={format}
        sourceBreakdown={reporting.sourceBreakdown}
        t={t}
      />
    </>
  );
}
