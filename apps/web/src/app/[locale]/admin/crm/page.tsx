import type { CrmActorContext } from '@interdomestik/domain-crm/context';
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
  ADMIN_CRM_REPORTING_MARKER_PREFIX,
  AdminCrmReportingAccessDeniedError,
  getAdminCrmReportingCore,
  type AdminCrmBranchPipelineRow,
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
    reporting = await getAdminCrmReportingCore({ actor: resolvedActor.actor });
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
