import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { CircleCheck, CircleSlash, Clock3, TriangleAlert } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import {
  buildPipelineAmountScreenReaderSummary,
  type PipelineAmountChartRow,
} from '@/components/crm/charts/chart-projections';
import { PipelineAmountChartBoundary } from '@/components/crm/charts/reporting-chart-boundary';
import { getSessionSafe } from '@/components/shell/session';

import { BranchManagerCrmDashboard } from './_branch-manager-dashboard';
import {
  BranchManagerCrmReportingAccessDeniedError,
  getBranchManagerCrmReportingCore,
  type BranchManagerCrmReportingDashboard,
} from './_branch-manager-core';
import {
  ADMIN_CRM_FORECAST_OBSERVABILITY_BATCHES_MARKER,
  ADMIN_CRM_FORECAST_OBSERVABILITY_COVERAGE_MARKER,
  ADMIN_CRM_FORECAST_OBSERVABILITY_SUMMARY_MARKER,
  ADMIN_CRM_REPORTING_MARKER_PREFIX,
  AdminCrmReportingAccessDeniedError,
  getAdminCrmReportingCore,
  type AdminCrmBranchPipelineRow,
  type AdminCrmForecastObservabilityBatchRow,
  type AdminCrmForecastObservabilityCoverageRow,
  type AdminCrmForecastObservabilitySummary,
  type AdminCrmForecastObservabilityStatus,
  type AdminCrmForecastObservabilityWidget,
  type AdminCrmLatestSnapshotRow,
  type AdminCrmReportingDashboard,
  type AdminCrmSourceBreakdownRow,
  type AdminCrmWidget,
} from './_core';
import {
  ExcludedRowsNote,
  PipelineRowsList,
  ReportingWidget,
  SnapshotRowsList,
  SourceRowsList,
  WidgetEmpty,
  WidgetError,
  formatCount,
  formatMinorAmount,
  type AdminCrmFormatter,
  type AdminCrmTranslations,
} from './_reporting-dashboard-primitives';

type Formatter = AdminCrmFormatter;
type Translations = AdminCrmTranslations;

const ADMIN_CRM_SESSION_ROLES = new Set(['admin', 'super_admin', 'tenant_admin']);
const BRANCH_MANAGER_SESSION_ROLE = 'branch_manager';

function toAdminPipelineAmountChartRows(
  format: Formatter,
  rows: readonly AdminCrmBranchPipelineRow[],
  t: Translations
): PipelineAmountChartRow[] {
  return rows.map(row => {
    const branch = row.branchLabel === 'tenant' ? t('labels.tenantWide') : row.branchLabel;
    const label = `${branch} / ${row.pipelineLabel}`;
    return {
      currencyCode: row.currencyCode,
      id: `${row.branchId ?? 'tenant'}-${row.pipelineId}-${row.currencyCode}`,
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

function SnapshotWidget({
  format,
  snapshot,
  t,
}: Readonly<{
  format: Formatter;
  snapshot: AdminCrmWidget<AdminCrmLatestSnapshotRow>;
  t: Translations;
}>) {
  return (
    <ReportingWidget
      title={t('snapshot.title')}
      description={t('snapshot.description')}
      marker={`${ADMIN_CRM_REPORTING_MARKER_PREFIX}snapshot`}
    >
      {snapshot.state === 'error' ? <WidgetError message={t(snapshot.messageKey)} /> : null}
      {snapshot.state === 'empty' ? <WidgetEmpty message={t('snapshot.empty')} /> : null}
      {snapshot.state === 'data' && snapshot.rows[0]?.freshness === 'stale' ? (
        <WidgetEmpty message={t('snapshot.staleEmpty')} />
      ) : null}
      {snapshot.state === 'data' && snapshot.rows[0]?.freshness !== 'stale' ? (
        <SnapshotRowsList
          format={format}
          getKey={row => `${row.pipelineId}-${row.branchId ?? 'tenant'}-${row.currencyCode}`}
          rows={snapshot.rows}
          t={t}
        />
      ) : null}
    </ReportingWidget>
  );
}

function BranchPipelineWidget({
  branchPipeline,
  format,
  locale,
  t,
}: Readonly<{
  branchPipeline: AdminCrmWidget<AdminCrmBranchPipelineRow>;
  format: Formatter;
  locale: string;
  t: Translations;
}>) {
  const chartRows =
    branchPipeline.state === 'data'
      ? toAdminPipelineAmountChartRows(format, branchPipeline.rows, t)
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
      title={t('branchPipeline.title')}
      description={t('branchPipeline.description')}
      marker={`${ADMIN_CRM_REPORTING_MARKER_PREFIX}branch-pipeline`}
    >
      {branchPipeline.state === 'error' ? (
        <WidgetError message={t(branchPipeline.messageKey)} />
      ) : null}
      {branchPipeline.state === 'empty' ? (
        <WidgetEmpty message={t('branchPipeline.empty')} />
      ) : null}
      {branchPipeline.state === 'data' ? (
        <PipelineRowsList
          format={format}
          getBranchLabel={row =>
            row.branchLabel === 'tenant' ? t('labels.tenantWide') : row.branchLabel
          }
          getKey={row => `${row.branchId ?? 'tenant'}-${row.pipelineId}-${row.currencyCode}`}
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

function SourceBreakdownWidget({
  format,
  sourceBreakdown,
  t,
}: Readonly<{
  format: Formatter;
  sourceBreakdown: AdminCrmWidget<AdminCrmSourceBreakdownRow>;
  t: Translations;
}>) {
  return (
    <ReportingWidget
      title={t('sourceBreakdown.title')}
      description={t('sourceBreakdown.description')}
      marker={`${ADMIN_CRM_REPORTING_MARKER_PREFIX}source-breakdown`}
    >
      {sourceBreakdown.state === 'error' ? (
        <WidgetError message={t(sourceBreakdown.messageKey)} />
      ) : null}
      {sourceBreakdown.state === 'empty' ? (
        <WidgetEmpty message={t('sourceBreakdown.empty')} />
      ) : null}
      {sourceBreakdown.state === 'data' ? (
        <SourceRowsList
          format={format}
          getKey={row => `${row.sourceLabel}-${row.currencyCode}`}
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

function ForecastObservabilityStatusBadge({
  status,
  t,
}: Readonly<{
  status: AdminCrmForecastObservabilityStatus;
  t: Translations;
}>) {
  const Icon =
    status === 'fresh'
      ? CircleCheck
      : status === 'delayed'
        ? Clock3
        : status === 'stale'
          ? TriangleAlert
          : CircleSlash;
  const className =
    status === 'fresh'
      ? 'bg-emerald-50 text-emerald-900'
      : status === 'delayed'
        ? 'bg-amber-50 text-amber-900'
        : status === 'stale'
          ? 'bg-red-50 text-red-900'
          : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {t(`forecastObservability.status.${status}`)}
    </span>
  );
}

function ForecastObservabilitySummaryTile({
  label,
  value,
}: Readonly<{
  label: string;
  value: ReactNode;
}>) {
  return (
    <div className="rounded-md border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function ForecastObservabilitySummaryGrid({
  format,
  summary,
  t,
}: Readonly<{
  format: Formatter;
  summary: AdminCrmForecastObservabilitySummary;
  t: Translations;
}>) {
  const metrics: Array<{ key: string; label: string; value: ReactNode }> = [
    {
      key: 'expected',
      label: t('forecastObservability.summary.expected'),
      value: formatCount(format, summary.expectedWorkItems),
    },
    {
      key: 'observed',
      label: t('forecastObservability.summary.observed'),
      value: formatCount(format, summary.observedWorkItems),
    },
    {
      key: 'missing',
      label: t('forecastObservability.summary.missing'),
      value: formatCount(format, summary.missingWorkItems),
    },
    {
      key: 'unexpected',
      label: t('forecastObservability.summary.unexpected'),
      value: formatCount(format, summary.unexpectedObservedWorkItems),
    },
    {
      key: 'delayed',
      label: t('forecastObservability.summary.delayed'),
      value: formatCount(format, summary.delayedWorkItems),
    },
    {
      key: 'stale',
      label: t('forecastObservability.summary.stale'),
      value: formatCount(format, summary.staleWorkItems),
    },
    {
      key: 'deferred',
      label: t('forecastObservability.summary.deferred'),
      value: formatCount(format, summary.expectedWorkItemsDeferred),
    },
    {
      key: 'latestRun',
      label: t('forecastObservability.summary.latestRun'),
      value: (
        <span className="break-all text-sm font-medium">
          {summary.latestSourceRunId ?? t('forecastObservability.labels.none')}
        </span>
      ),
    },
  ];

  return (
    <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map(metric => (
        <ForecastObservabilitySummaryTile
          key={metric.key}
          label={metric.label}
          value={metric.value}
        />
      ))}
    </dl>
  );
}

function ForecastObservabilityTable<T>({
  columns,
  getKey,
  rows,
}: Readonly<{
  columns: Array<{
    header: string;
    id: string;
    render: (row: T) => ReactNode;
    cellClassName?: string;
  }>;
  getKey: (row: T) => string;
  rows: readonly T[];
}>) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            {columns.map((column, index) => (
              <th
                key={column.id}
                className={`${index === columns.length - 1 ? 'py-2' : 'py-2 pr-3'} font-medium`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(row => (
            <tr key={getKey(row)}>
              {columns.map((column, index) => (
                <td
                  key={column.id}
                  className={
                    column.cellClassName ?? (index === columns.length - 1 ? 'py-3' : 'py-3 pr-3')
                  }
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ForecastObservabilityCoverageTable({
  rows,
  t,
}: Readonly<{
  rows: readonly AdminCrmForecastObservabilityCoverageRow[];
  t: Translations;
}>) {
  const noneLabel = t('forecastObservability.labels.none');
  return (
    <ForecastObservabilityTable
      columns={[
        {
          header: t('forecastObservability.coverage.branch'),
          id: 'branch',
          render: row => row.branchLabel,
        },
        {
          header: t('forecastObservability.coverage.pipeline'),
          id: 'pipeline',
          render: row => row.pipelineLabel,
        },
        {
          header: t('forecastObservability.coverage.currency'),
          id: 'currency',
          render: row => row.currencyCode,
        },
        {
          header: t('forecastObservability.coverage.status'),
          id: 'status',
          render: row => <ForecastObservabilityStatusBadge status={row.status} t={t} />,
        },
        {
          header: t('forecastObservability.coverage.version'),
          id: 'version',
          render: row => row.snapshotVersion ?? noneLabel,
        },
        {
          header: t('forecastObservability.coverage.latestCreated'),
          id: 'latestCreated',
          render: row => row.latestSnapshotCreatedAt ?? noneLabel,
        },
      ]}
      getKey={row => `${row.branchId ?? 'none'}-${row.pipelineId}-${row.currencyCode}`}
      rows={rows}
    />
  );
}

function ForecastObservabilityBatchTable({
  format,
  rows,
  t,
}: Readonly<{
  format: Formatter;
  rows: readonly AdminCrmForecastObservabilityBatchRow[];
  t: Translations;
}>) {
  return (
    <ForecastObservabilityTable
      columns={[
        {
          cellClassName: 'break-all py-3 pr-3',
          header: t('forecastObservability.batches.sourceRun'),
          id: 'sourceRun',
          render: row => row.sourceRunId,
        },
        {
          header: t('forecastObservability.batches.observed'),
          id: 'observed',
          render: row => formatCount(format, row.observedWorkItems),
        },
        {
          header: t('forecastObservability.batches.branches'),
          id: 'branches',
          render: row => formatCount(format, row.branchCount),
        },
        {
          header: t('forecastObservability.batches.pipelines'),
          id: 'pipelines',
          render: row => formatCount(format, row.pipelineCount),
        },
        {
          header: t('forecastObservability.batches.currencies'),
          id: 'currencies',
          render: row => formatCount(format, row.currencyCount),
        },
        {
          header: t('forecastObservability.batches.lastCreated'),
          id: 'lastCreated',
          render: row => row.lastSnapshotCreatedAt,
        },
      ]}
      getKey={row => row.sourceRunId}
      rows={rows}
    />
  );
}

function ForecastObservabilityWidget({
  forecastObservability,
  format,
  t,
}: Readonly<{
  forecastObservability: AdminCrmForecastObservabilityWidget;
  format: Formatter;
  t: Translations;
}>) {
  const summary = forecastObservability.summary;

  return (
    <ReportingWidget
      title={t('forecastObservability.title')}
      description={t('forecastObservability.description')}
      marker={ADMIN_CRM_FORECAST_OBSERVABILITY_SUMMARY_MARKER}
    >
      {forecastObservability.state === 'error' ? (
        <WidgetError message={t(forecastObservability.messageKey)} />
      ) : null}
      {summary ? (
        <ForecastObservabilitySummaryGrid format={format} summary={summary} t={t} />
      ) : null}

      {forecastObservability.state === 'empty' ? (
        <WidgetEmpty message={t('forecastObservability.empty')} />
      ) : null}

      {forecastObservability.state !== 'error' ? (
        <div className="mt-6 space-y-5">
          <div data-testid={ADMIN_CRM_FORECAST_OBSERVABILITY_COVERAGE_MARKER}>
            <h3 className="text-sm font-semibold">{t('forecastObservability.coverage.title')}</h3>
            {forecastObservability.coverageRows.length === 0 ? (
              <WidgetEmpty message={t('forecastObservability.coverage.empty')} />
            ) : (
              <ForecastObservabilityCoverageTable rows={forecastObservability.coverageRows} t={t} />
            )}
            <ExcludedRowsNote
              count={forecastObservability.hiddenCoverageRowCount}
              label={t('forecastObservability.coverage.hidden', {
                count: forecastObservability.hiddenCoverageRowCount,
              })}
              title={t('forecastObservability.coverage.hiddenHelp')}
            />
          </div>

          <div data-testid={ADMIN_CRM_FORECAST_OBSERVABILITY_BATCHES_MARKER}>
            <h3 className="text-sm font-semibold">{t('forecastObservability.batches.title')}</h3>
            {forecastObservability.batchRows.length === 0 ? (
              <WidgetEmpty message={t('forecastObservability.batches.empty')} />
            ) : (
              <ForecastObservabilityBatchTable
                format={format}
                rows={forecastObservability.batchRows}
                t={t}
              />
            )}
          </div>
        </div>
      ) : null}
    </ReportingWidget>
  );
}

function AdminCrmDashboard({
  format,
  locale,
  reporting,
  t,
}: Readonly<{
  format: Formatter;
  locale: string;
  reporting: AdminCrmReportingDashboard;
  t: Translations;
}>) {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-3">
        <SnapshotWidget format={format} snapshot={reporting.snapshot} t={t} />
        <div className="xl:col-span-2">
          <BranchPipelineWidget
            branchPipeline={reporting.branchPipeline}
            format={format}
            locale={locale}
            t={t}
          />
        </div>
      </div>

      <SourceBreakdownWidget format={format} sourceBreakdown={reporting.sourceBreakdown} t={t} />
      <ForecastObservabilityWidget
        forecastObservability={reporting.forecastObservability}
        format={format}
        t={t}
      />
    </>
  );
}

type AdminCrmResolvedActor =
  | { kind: 'admin'; actor: CrmActorContext }
  | { kind: 'branch_manager'; actor: CrmActorContext; branchLabel: string };

function buildAdminCrmActor(session: {
  user?: {
    branchId?: string | null;
    id?: string;
    role?: string | null;
    tenantId?: string | null;
  } | null;
}): AdminCrmResolvedActor | null {
  const role = session.user?.role;
  const actorId = session.user?.id;
  const tenantId = session.user?.tenantId;
  if (!role || !actorId || !tenantId) return null;
  if (role === BRANCH_MANAGER_SESSION_ROLE) {
    const branchId = session.user?.branchId;
    if (!branchId) return null;
    return {
      actor: {
        actorId,
        role: 'branch_manager',
        scope: { branchId },
        tenantId,
      },
      branchLabel: branchId,
      kind: 'branch_manager',
    };
  }
  if (!ADMIN_CRM_SESSION_ROLES.has(role)) return null;
  return {
    actor: {
      actorId,
      role: 'admin',
      scope: {
        branchId: session.user?.branchId ?? null,
      },
      tenantId,
    },
    kind: 'admin',
  };
}

function AdminCrmPageFrame({
  children,
  description,
  title,
}: Readonly<{
  children: ReactNode;
  description: string;
  title: string;
}>) {
  return (
    <div className="space-y-6" data-testid="admin-crm-page-ready">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      {children}
    </div>
  );
}

export default async function AdminCrmPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin-crm');
  const format = await getFormatter();
  const session = await getSessionSafe('AdminCrmPage');
  if (!session) notFound();

  const resolvedActor = buildAdminCrmActor(session);
  if (!resolvedActor) notFound();

  if (resolvedActor.kind === 'branch_manager') {
    let reporting: BranchManagerCrmReportingDashboard;
    try {
      reporting = await getBranchManagerCrmReportingCore(
        { actor: resolvedActor.actor },
        { branchLabel: resolvedActor.branchLabel }
      );
    } catch (error) {
      if (error instanceof BranchManagerCrmReportingAccessDeniedError) {
        notFound();
      }
      throw error;
    }

    return (
      <AdminCrmPageFrame
        description={t('branchManager.description')}
        title={t('branchManager.title')}
      >
        <BranchManagerCrmDashboard format={format} locale={locale} reporting={reporting} t={t} />
      </AdminCrmPageFrame>
    );
  }

  let reporting: AdminCrmReportingDashboard;
  try {
    reporting = await getAdminCrmReportingCore(
      { actor: resolvedActor.actor },
      { labels: { noBranch: t('labels.noBranch') } }
    );
  } catch (error) {
    if (error instanceof AdminCrmReportingAccessDeniedError) {
      notFound();
    }
    throw error;
  }

  return (
    <AdminCrmPageFrame description={t('description')} title={t('title')}>
      <AdminCrmDashboard format={format} locale={locale} reporting={reporting} t={t} />
    </AdminCrmPageFrame>
  );
}
