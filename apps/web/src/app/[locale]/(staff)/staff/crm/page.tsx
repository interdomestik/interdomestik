import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import {
  buildFunnelMovementScreenReaderSummary,
  buildPipelineAmountScreenReaderSummary,
  type FunnelMovementChartRow,
  type PipelineAmountChartRow,
} from '@/components/crm/charts/chart-projections';
import {
  FunnelMovementChartBoundary,
  PipelineAmountChartBoundary,
} from '@/components/crm/charts/reporting-chart-boundary';
import { getSessionSafe } from '@/components/shell/session';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

import {
  STAFF_CRM_REPORTING_MARKER_PREFIX,
  StaffCrmReportingAccessDeniedError,
  getStaffCrmReportingCore,
  type StaffCrmFunnelMovementRow,
  type StaffCrmPipelineWorkloadRow,
  type StaffCrmReportingDashboard,
  type StaffCrmWidget,
} from './_core';
import {
  formatCount,
  StaffReportPanel,
  WidgetStateMessage,
  InlineCountNote,
  StageVelocityWidget,
} from './_stage-velocity-widget';

export type Formatter = Awaited<ReturnType<typeof getFormatter>>;
export type Translations = Awaited<ReturnType<typeof getTranslations>>;

function formatMinorAmount(format: Formatter, amountMinor: number, currencyCode: string): string {
  return `${format.number(amountMinor / 100, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ${currencyCode}`;
}

function formatBasisPoints(format: Formatter, value: number): string {
  return `${format.number(value / 100, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}%`;
}

function toStaffPipelineAmountChartRows(
  format: Formatter,
  rows: readonly StaffCrmPipelineWorkloadRow[]
): PipelineAmountChartRow[] {
  return rows.map(row => {
    const label = `${row.branchLabel} / ${row.pipelineLabel}`;
    return {
      currencyCode: row.currencyCode,
      id: `${row.branchId ?? 'no-branch'}-${row.pipelineId}-${row.currencyCode}`,
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

function toStaffFunnelMovementChartRows(
  format: Formatter,
  rows: readonly StaffCrmFunnelMovementRow[]
): FunnelMovementChartRow[] {
  return rows.map(row => ({
    enteredCount: row.enteredCount,
    enteredFormatted: formatCount(format, row.enteredCount),
    exitedCount: row.exitedCount,
    exitedFormatted: formatCount(format, row.exitedCount),
    id: `${row.pipelineId}-${row.stageId}`,
    label: `${row.stageLabel} / ${row.pipelineLabel}`,
    lostCount: row.lostCount,
    lostFormatted: formatCount(format, row.lostCount),
    wonCount: row.wonCount,
    wonFormatted: formatCount(format, row.wonCount),
  }));
}

function PipelineWorkloadWidget({
  format,
  locale,
  pipelineWorkload,
  t,
}: Readonly<{
  format: Formatter;
  locale: string;
  pipelineWorkload: StaffCrmWidget<StaffCrmPipelineWorkloadRow>;
  t: Translations;
}>) {
  const chartRows =
    pipelineWorkload.state === 'data'
      ? toStaffPipelineAmountChartRows(format, pipelineWorkload.rows)
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
    <StaffReportPanel
      title={t('pipelineWorkload.title')}
      description={t('pipelineWorkload.description')}
      marker={`${STAFF_CRM_REPORTING_MARKER_PREFIX}pipeline-workload`}
    >
      {pipelineWorkload.state === 'error' ? (
        <WidgetStateMessage kind="error" message={t(pipelineWorkload.messageKey)} />
      ) : null}
      {pipelineWorkload.state === 'empty' ? (
        <WidgetStateMessage kind="empty" message={t('pipelineWorkload.empty')} />
      ) : null}
      {pipelineWorkload.state === 'data' ? (
        <div className="divide-y">
          {pipelineWorkload.rows.map(row => (
            <div
              key={`${row.branchId ?? 'no-branch'}-${row.pipelineId}-${row.currencyCode}`}
              className="grid gap-3 py-4 first:pt-0 last:pb-0 xl:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div>
                <p className="font-medium">{row.branchLabel}</p>
                <p className="text-sm text-muted-foreground">
                  {row.pipelineLabel} · {row.currencyCode}
                </p>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5 xl:text-right">
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.openDeals')}</dt>
                  <dd>{formatCount(format, row.openDealCount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.totalPipeline')}</dt>
                  <dd>
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
                  <dt className="text-xs text-muted-foreground">{t('metrics.commit')}</dt>
                  <dd>
                    {formatMinorAmount(format, row.forecastCommitAmountMinor, row.currencyCode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.bestCase')}</dt>
                  <dd>
                    {formatMinorAmount(format, row.forecastBestAmountMinor, row.currencyCode)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
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
      <InlineCountNote
        count={pipelineWorkload.excludedRowCount}
        label={t('excludedRows', { count: pipelineWorkload.excludedRowCount })}
        title={t('excludedRowsHelp')}
      />
    </StaffReportPanel>
  );
}

function FunnelMovementWidget({
  format,
  funnelMovement,
  locale,
  t,
}: Readonly<{
  format: Formatter;
  funnelMovement: StaffCrmWidget<StaffCrmFunnelMovementRow>;
  locale: string;
  t: Translations;
}>) {
  const chartRows =
    funnelMovement.state === 'data'
      ? toStaffFunnelMovementChartRows(format, funnelMovement.rows)
      : [];
  const chartSummary =
    chartRows.length > 0
      ? buildFunnelMovementScreenReaderSummary(chartRows, {
          entered: t('charts.funnelMovement.entered'),
          exited: t('charts.funnelMovement.exited'),
          hiddenItems: count => t('charts.hiddenItems', { count }),
          intro: t('charts.funnelMovement.summaryIntro'),
          lost: t('charts.funnelMovement.lost'),
          won: t('charts.funnelMovement.won'),
        })
      : '';

  return (
    <StaffReportPanel
      title={t('funnelMovement.title')}
      description={t('funnelMovement.description')}
      marker={`${STAFF_CRM_REPORTING_MARKER_PREFIX}funnel-movement`}
    >
      {funnelMovement.state === 'error' ? (
        <WidgetStateMessage kind="error" message={t(funnelMovement.messageKey)} />
      ) : null}
      {funnelMovement.state === 'empty' ? (
        <WidgetStateMessage kind="empty" message={t('funnelMovement.empty')} />
      ) : null}
      {funnelMovement.state === 'data' ? (
        <div className="divide-y">
          {funnelMovement.rows.map(row => (
            <div
              key={`${row.pipelineId}-${row.stageId}`}
              className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div>
                <p className="font-medium">{row.stageLabel}</p>
                <p className="text-sm text-muted-foreground">{row.pipelineLabel}</p>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-3 md:text-right">
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.entered')}</dt>
                  <dd>{formatCount(format, row.enteredCount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.exited')}</dt>
                  <dd>{formatCount(format, row.exitedCount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.wonLost')}</dt>
                  <dd>
                    {formatCount(format, row.wonCount)} / {formatCount(format, row.lostCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.conversion')}</dt>
                  <dd className="font-semibold">
                    {formatBasisPoints(format, row.conversionRateBps)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.dropOff')}</dt>
                  <dd>{formatBasisPoints(format, row.dropOffRateBps)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      ) : null}
      {chartRows.length > 0 ? (
        <Suspense fallback={null}>
          <FunnelMovementChartBoundary
            description={t('charts.funnelMovement.description')}
            locale={locale}
            rows={chartRows}
            summary={chartSummary}
            text={{
              entered: t('charts.funnelMovement.entered'),
              exited: t('charts.funnelMovement.exited'),
              lost: t('charts.funnelMovement.lost'),
              won: t('charts.funnelMovement.won'),
            }}
            title={t('charts.funnelMovement.title')}
          />
        </Suspense>
      ) : null}
    </StaffReportPanel>
  );
}

function buildStaffCrmActor(session: {
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
  if (role !== 'staff' || !actorId || !tenantId) return null;
  return {
    actorId,
    role: 'staff',
    scope: {
      branchId: session.user?.branchId ?? null,
      staffId: actorId,
    },
    tenantId,
  };
}

export default async function StaffCrmPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('staff-crm');
  const format = await getFormatter();
  const session = await getSessionSafe('StaffCrmPage');
  if (!session) notFound();

  const actor = buildStaffCrmActor(session);
  if (!actor) notFound();
  const authorized = await authorizeSessionTenant(await headers());
  if (!authorized) notFound();
  const { authority } = authorized;

  let reporting: StaffCrmReportingDashboard;
  try {
    reporting = await getStaffCrmReportingCore(
      {
        actor,
        authority,
      },
      {
        labels: {
          noBranch: t('label.no-branch'),
        },
      }
    );
  } catch (error) {
    if (error instanceof StaffCrmReportingAccessDeniedError) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="space-y-6" data-testid="staff-crm-page-ready">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </header>

      <PipelineWorkloadWidget
        format={format}
        locale={locale}
        pipelineWorkload={reporting.pipelineWorkload}
        t={t}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <FunnelMovementWidget
          format={format}
          funnelMovement={reporting.funnelMovement}
          locale={locale}
          t={t}
        />
        <StageVelocityWidget
          format={format}
          locale={locale}
          stageVelocity={reporting.stageVelocity}
          t={t}
        />
      </div>
    </div>
  );
}
