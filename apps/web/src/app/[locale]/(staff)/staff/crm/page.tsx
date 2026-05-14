import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { Info } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { getSessionSafe } from '@/components/shell/session';

import {
  STAFF_CRM_REPORTING_MARKER_PREFIX,
  StaffCrmReportingAccessDeniedError,
  getStaffCrmReportingCore,
  type StaffCrmFunnelMovementRow,
  type StaffCrmPipelineWorkloadRow,
  type StaffCrmReportingDashboard,
  type StaffCrmStageVelocityRow,
  type StaffCrmStageVelocityWidget,
  type StaffCrmWidget,
} from './_core';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
type Translations = Awaited<ReturnType<typeof getTranslations>>;

function formatMinorAmount(format: Formatter, amountMinor: number, currencyCode: string): string {
  return `${format.number(amountMinor / 100, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ${currencyCode}`;
}

function formatCount(format: Formatter, value: number): string {
  return format.number(value, { maximumFractionDigits: 0 });
}

function formatBasisPoints(format: Formatter, value: number): string {
  return `${format.number(value / 100, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}%`;
}

function formatDays(format: Formatter, value: number): string {
  return format.number(value, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function StaffReportPanel({
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
  const headingId = `${marker}-title`;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border bg-white p-5 shadow-sm"
      data-testid={marker}
    >
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-foreground" id={headingId}>
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function WidgetStateMessage({
  kind,
  message,
}: Readonly<{ kind: 'empty' | 'error'; message: string }>) {
  const className =
    kind === 'error'
      ? 'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950'
      : 'text-sm text-muted-foreground';

  return <p className={className}>{message}</p>;
}

function InlineCountNote({
  count,
  label,
  title,
}: Readonly<{ count: number; label: string; title: string }>) {
  return count > 0 ? (
    <p className="inline-flex items-center gap-1 pt-4 text-xs text-muted-foreground" title={title}>
      <Info aria-hidden="true" className="h-3.5 w-3.5" />
      <span>{label}</span>
    </p>
  ) : null;
}

function PipelineWorkloadWidget({
  format,
  pipelineWorkload,
  t,
}: Readonly<{
  format: Formatter;
  pipelineWorkload: StaffCrmWidget<StaffCrmPipelineWorkloadRow>;
  t: Translations;
}>) {
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
  t,
}: Readonly<{
  format: Formatter;
  funnelMovement: StaffCrmWidget<StaffCrmFunnelMovementRow>;
  t: Translations;
}>) {
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
    </StaffReportPanel>
  );
}

function StageVelocityWidget({
  format,
  stageVelocity,
  t,
}: Readonly<{
  format: Formatter;
  stageVelocity: StaffCrmStageVelocityWidget;
  t: Translations;
}>) {
  return (
    <StaffReportPanel
      title={t('stageVelocity.title')}
      description={t('stageVelocity.description')}
      marker={`${STAFF_CRM_REPORTING_MARKER_PREFIX}stage-velocity`}
    >
      {stageVelocity.state === 'error' ? (
        <WidgetStateMessage kind="error" message={t(stageVelocity.messageKey)} />
      ) : null}
      {stageVelocity.state === 'empty' ? (
        <WidgetStateMessage kind="empty" message={t('stageVelocity.empty')} />
      ) : null}
      {stageVelocity.state === 'data' ? (
        <div className="divide-y">
          {stageVelocity.summary.rows.map((row: StaffCrmStageVelocityRow) => (
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
                  <dt className="text-xs text-muted-foreground">{t('metrics.medianDays')}</dt>
                  <dd className="font-semibold">
                    {t('durationDays', { days: formatDays(format, row.medianDays) })}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.averageDays')}</dt>
                  <dd>{t('durationDays', { days: formatDays(format, row.averageDays) })}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.sampleCount')}</dt>
                  <dd>{formatCount(format, row.sampleCount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.minimumDays')}</dt>
                  <dd>{t('durationDays', { days: formatDays(format, row.minimumDays) })}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('metrics.maximumDays')}</dt>
                  <dd>{t('durationDays', { days: formatDays(format, row.maximumDays) })}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      ) : null}
      <InlineCountNote
        count={stageVelocity.summary.excludedOpenIntervalCount}
        label={t('stageVelocity.excludedOpenIntervals', {
          count: stageVelocity.summary.excludedOpenIntervalCount,
        })}
        title={t('stageVelocity.excludedOpenIntervalsHelp')}
      />
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

  let reporting: StaffCrmReportingDashboard;
  try {
    reporting = await getStaffCrmReportingCore(
      {
        actor,
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

      <PipelineWorkloadWidget format={format} pipelineWorkload={reporting.pipelineWorkload} t={t} />

      <div className="grid gap-4 xl:grid-cols-2">
        <FunnelMovementWidget format={format} funnelMovement={reporting.funnelMovement} t={t} />
        <StageVelocityWidget format={format} stageVelocity={reporting.stageVelocity} t={t} />
      </div>
    </div>
  );
}
