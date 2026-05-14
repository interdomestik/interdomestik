import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { Info } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { getSessionSafe } from '@/components/shell/session';

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

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
type Translations = Awaited<ReturnType<typeof getTranslations>>;

const ADMIN_CRM_SESSION_ROLES = new Set(['admin', 'super_admin', 'tenant_admin']);

function formatMinorAmount(format: Formatter, amountMinor: number, currencyCode: string): string {
  return `${format.number(amountMinor / 100, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ${currencyCode}`;
}

function formatCount(format: Formatter, value: number): string {
  return format.number(value, { maximumFractionDigits: 0 });
}

function ReportingWidget({
  children,
  description,
  marker,
  title,
}: Readonly<{
  children: ReactNode;
  description: string;
  marker: string;
  title: string;
}>) {
  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm" data-testid={marker}>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function WidgetError({ message }: Readonly<{ message: string }>) {
  return (
    <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      {message}
    </p>
  );
}

function WidgetEmpty({ message }: Readonly<{ message: string }>) {
  return <p className="mt-5 text-sm text-muted-foreground">{message}</p>;
}

function ExcludedRowsNote({
  count,
  label,
  title,
}: Readonly<{ count: number; label: string; title: string }>) {
  if (count <= 0) return null;
  return (
    <p className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground" title={title}>
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </p>
  );
}

function SnapshotStatus({ row, t }: Readonly<{ row: AdminCrmLatestSnapshotRow; t: Translations }>) {
  if (row.freshness === 'fresh') {
    return (
      <span className="text-xs text-muted-foreground" title={t('snapshot.versionLabel')}>
        {t('snapshot.fresh')}
      </span>
    );
  }
  if (row.freshness === 'delayed') {
    return (
      <span
        className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900"
        title={`${t('snapshot.versionLabel')}: ${row.snapshotVersion}`}
      >
        {t('snapshot.delayed')}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
      {t('snapshot.stale')}
    </span>
  );
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
        <div className="mt-5 space-y-4">
          {snapshot.rows.map(row => (
            <div
              key={`${row.pipelineId}-${row.branchId ?? 'tenant'}-${row.currencyCode}`}
              className="rounded-md border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{row.currencyCode}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('snapshot.date', { date: row.snapshotDate })}
                  </p>
                </div>
                <SnapshotStatus row={row} t={t} />
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.totalPipeline')}</dt>
                  <dd className="font-semibold">
                    {formatMinorAmount(format, row.totalPipelineAmountMinor, row.currencyCode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.weighted')}</dt>
                  <dd className="font-semibold">
                    {formatMinorAmount(format, row.weightedPipelineAmountMinor, row.currencyCode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.openDeals')}</dt>
                  <dd>{formatCount(format, row.openDealCount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.closedWon')}</dt>
                  <dd>{formatMinorAmount(format, row.closedWonAmountMinor, row.currencyCode)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.closedLost')}</dt>
                  <dd>{formatMinorAmount(format, row.closedLostAmountMinor, row.currencyCode)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      ) : null}
    </ReportingWidget>
  );
}

function BranchPipelineWidget({
  branchPipeline,
  format,
  t,
}: Readonly<{
  branchPipeline: AdminCrmWidget<AdminCrmBranchPipelineRow>;
  format: Formatter;
  t: Translations;
}>) {
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
        <div className="mt-5 divide-y">
          {branchPipeline.rows.map(row => (
            <div
              key={`${row.branchId ?? 'tenant'}-${row.pipelineId}-${row.currencyCode}`}
              className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto]"
            >
              <div>
                <p className="font-medium">
                  {row.branchLabel === 'tenant' ? t('labels.tenantWide') : row.branchLabel}
                </p>
                <p className="text-sm text-muted-foreground">{row.pipelineLabel}</p>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-3 md:text-right">
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.weighted')}</dt>
                  <dd className="font-semibold">
                    {formatMinorAmount(format, row.weightedPipelineAmountMinor, row.currencyCode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.totalPipeline')}</dt>
                  <dd>
                    {formatMinorAmount(format, row.totalPipelineAmountMinor, row.currencyCode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.openDeals')}</dt>
                  <dd>{formatCount(format, row.openDealCount)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
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
        <div className="mt-5 divide-y">
          {sourceBreakdown.rows.map(row => (
            <div
              key={`${row.sourceLabel}-${row.currencyCode}`}
              className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto]"
            >
              <div>
                <p className="font-medium">
                  {row.sourceLabel === 'unknown' ? t('labels.unknownSource') : row.sourceLabel}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('sourceBreakdown.deals', { count: row.dealCount })}
                </p>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2 md:text-right">
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.weighted')}</dt>
                  <dd className="font-semibold">
                    {formatMinorAmount(format, row.weightedAmountMinor, row.currencyCode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.totalPipeline')}</dt>
                  <dd>{formatMinorAmount(format, row.totalAmountMinor, row.currencyCode)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      ) : null}
      <ExcludedRowsNote
        count={sourceBreakdown.excludedRowCount}
        label={t('excludedRows', { count: sourceBreakdown.excludedRowCount })}
        title={t('excludedRowsHelp')}
      />
    </ReportingWidget>
  );
}

function buildAdminCrmActor(session: {
  user?: {
    branchId?: string | null;
    id?: string;
    role?: string | null;
    tenantId?: string | null;
  } | null;
}): CrmActorContext | null {
  const role = session.user?.role;
  const actorId = session.user?.id;
  const tenantId = session.user?.tenantId;
  if (!role || !actorId || !tenantId || !ADMIN_CRM_SESSION_ROLES.has(role)) return null;
  return {
    actorId,
    role: 'admin',
    scope: {
      branchId: session.user?.branchId ?? null,
    },
    tenantId,
  };
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

  const actor = buildAdminCrmActor(session);
  if (!actor) notFound();

  let reporting: AdminCrmReportingDashboard;
  try {
    reporting = await getAdminCrmReportingCore({ actor });
  } catch (error) {
    if (error instanceof AdminCrmReportingAccessDeniedError) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="space-y-6" data-testid="admin-crm-page-ready">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        <SnapshotWidget format={format} snapshot={reporting.snapshot} t={t} />
        <div className="xl:col-span-2">
          <BranchPipelineWidget branchPipeline={reporting.branchPipeline} format={format} t={t} />
        </div>
      </div>

      <SourceBreakdownWidget format={format} sourceBreakdown={reporting.sourceBreakdown} t={t} />
    </div>
  );
}
