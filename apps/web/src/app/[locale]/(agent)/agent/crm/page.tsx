import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth'; // server-side auth
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { Button } from '@interdomestik/ui';
import { ArrowRight } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import {
  buildPipelineAmountScreenReaderSummary,
  type PipelineAmountChartRow,
} from '@/components/crm/charts/chart-projections';
import { PipelineAmountChartBoundary } from '@/components/crm/charts/reporting-chart-boundary';
import {
  AgentCrmReportingAccessDeniedError,
  AgentCrmStatsAccessDeniedError,
  getAgentCrmCompletedTaskQueueCore,
  getAgentCrmReportingCore,
  getAgentCrmStatsCore,
  getAgentCrmTaskQueueCore,
  type AgentCrmCompletedTaskQueueItem,
  type AgentCrmPipelineCurrencySummary,
  type AgentCrmReportingDashboard,
  type AgentCrmSourceBreakdownSummary,
  type AgentCrmTaskQueueItem,
  type AgentCrmWinRateSummary,
} from './_core';
import { TaskQueueControls } from './task-queue-controls';
import { TaskQueueReopenControls } from './task-queue-reopen-controls';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

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

function sourceLabel(source: AgentCrmSourceBreakdownSummary | AgentCrmWinRateSummary): string {
  if ('source' in source) {
    return source.source ?? source.utmSource ?? 'unknown';
  }
  return source.groupKey === 'unknown' ? 'unknown' : source.groupKey;
}

function toAgentPipelineAmountChartRows(
  format: Formatter,
  summaries: readonly AgentCrmPipelineCurrencySummary[]
): PipelineAmountChartRow[] {
  return summaries.map(summary => ({
    currencyCode: summary.currencyCode,
    id: summary.currencyCode,
    label: summary.currencyCode,
    totalAmountMinor: summary.rawValueAmountMinor,
    totalFormatted: formatMinorAmount(format, summary.rawValueAmountMinor, summary.currencyCode),
    weightedAmountMinor: summary.weightedValueAmountMinor,
    weightedFormatted: formatMinorAmount(
      format,
      summary.weightedValueAmountMinor,
      summary.currencyCode
    ),
  }));
}

function ReportingCard({
  children,
  description,
  testId,
  title,
}: Readonly<{
  children: ReactNode;
  description: string;
  testId: string;
  title: string;
}>) {
  return (
    <section className="rounded-lg border bg-white p-6 shadow-sm" data-testid={testId}>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function WeightedPipelineWidget({
  format,
  locale,
  reporting,
  t,
}: Readonly<{
  format: Formatter;
  locale: string;
  reporting: AgentCrmReportingDashboard['weightedPipeline'];
  t: Awaited<ReturnType<typeof getTranslations>>;
}>) {
  const chartRows = toAgentPipelineAmountChartRows(format, reporting.currencySummaries);
  const chartSummary =
    chartRows.length > 0
      ? buildPipelineAmountScreenReaderSummary(chartRows, {
          hiddenItems: count => t('reporting.charts.hiddenItems', { count }),
          intro: t('reporting.charts.pipelineAmount.summaryIntro'),
          total: t('reporting.charts.pipelineAmount.total'),
          weighted: t('reporting.charts.pipelineAmount.weighted'),
        })
      : '';

  return (
    <ReportingCard
      title={t('reporting.weightedPipeline.title')}
      description={t('reporting.weightedPipeline.description')}
      testId="agent-crm-reporting-weighted-pipeline"
    >
      {reporting.currencySummaries.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {t('reporting.weightedPipeline.empty')}
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {reporting.currencySummaries.map(summary => (
            <WeightedPipelineCurrencyRow
              key={summary.currencyCode}
              format={format}
              summary={summary}
              t={t}
            />
          ))}
        </div>
      )}
      {chartRows.length > 0 ? (
        <Suspense fallback={null}>
          <PipelineAmountChartBoundary
            description={t('reporting.charts.pipelineAmount.description')}
            locale={locale}
            rows={chartRows}
            summary={chartSummary}
            text={{
              total: t('reporting.charts.pipelineAmount.total'),
              weighted: t('reporting.charts.pipelineAmount.weighted'),
            }}
            title={t('reporting.charts.pipelineAmount.title')}
          />
        </Suspense>
      ) : null}
      {reporting.excludedRowCount > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          {t('reporting.weightedPipeline.excludedRows', {
            count: reporting.excludedRowCount,
          })}
        </p>
      )}
    </ReportingCard>
  );
}

function WeightedPipelineCurrencyRow({
  format,
  summary,
  t,
}: Readonly<{
  format: Formatter;
  summary: AgentCrmPipelineCurrencySummary;
  t: Awaited<ReturnType<typeof getTranslations>>;
}>) {
  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{summary.currencyCode}</p>
        <p className="text-sm text-muted-foreground">
          {t('reporting.weightedPipeline.openDeals', { count: summary.openDealCount })}
        </p>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t('reporting.weightedPipeline.raw')}</dt>
          <dd className="font-semibold">
            {formatMinorAmount(format, summary.rawValueAmountMinor, summary.currencyCode)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {t('reporting.weightedPipeline.weighted')}
          </dt>
          <dd className="font-semibold">
            {formatMinorAmount(format, summary.weightedValueAmountMinor, summary.currencyCode)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {t('reporting.weightedPipeline.commit')}
          </dt>
          <dd>
            {formatMinorAmount(format, summary.forecastCommitAmountMinor, summary.currencyCode)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('reporting.weightedPipeline.best')}</dt>
          <dd>
            {formatMinorAmount(format, summary.forecastBestAmountMinor, summary.currencyCode)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {t('reporting.weightedPipeline.closedWon')}
          </dt>
          <dd>{formatMinorAmount(format, summary.closedWonAmountMinor, summary.currencyCode)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {t('reporting.weightedPipeline.closedLost')}
          </dt>
          <dd>{formatMinorAmount(format, summary.closedLostAmountMinor, summary.currencyCode)}</dd>
        </div>
      </dl>
    </div>
  );
}

function SourceBreakdownWidget({
  format,
  reporting,
  t,
}: Readonly<{
  format: Formatter;
  reporting: AgentCrmReportingDashboard['sourceBreakdown'];
  t: Awaited<ReturnType<typeof getTranslations>>;
}>) {
  return (
    <ReportingCard
      title={t('reporting.sourceBreakdown.title')}
      description={t('reporting.sourceBreakdown.description')}
      testId="agent-crm-reporting-source-breakdown"
    >
      {reporting.groups.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t('reporting.sourceBreakdown.empty')}</p>
      ) : (
        <div className="mt-6 divide-y">
          {reporting.groups.map(group => (
            <div
              key={[
                group.source ?? '',
                group.utmSource ?? '',
                group.utmMedium ?? '',
                group.utmCampaign ?? '',
                group.currencyCode,
              ].join('|')}
              className="grid gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {sourceLabel(group) === 'unknown'
                    ? t('reporting.unknownSource')
                    : sourceLabel(group)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('reporting.sourceBreakdown.deals', { count: group.dealCount })}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>
                  {t('reporting.sourceBreakdown.weighted')}:{' '}
                  {formatMinorAmount(format, group.weightedValueAmountMinor, group.currencyCode)}
                </span>
                <span>
                  {t('reporting.sourceBreakdown.winRate')}:{' '}
                  {formatBasisPoints(format, group.winRateBps)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ReportingCard>
  );
}

function WinRateWidget({
  format,
  reporting,
  t,
}: Readonly<{
  format: Formatter;
  reporting: AgentCrmReportingDashboard['winRateBySource'];
  t: Awaited<ReturnType<typeof getTranslations>>;
}>) {
  return (
    <ReportingCard
      title={t('reporting.winRate.title')}
      description={t('reporting.winRate.description')}
      testId="agent-crm-reporting-win-rate"
    >
      {reporting.groups.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t('reporting.winRate.empty')}</p>
      ) : (
        <div className="mt-6 divide-y">
          {reporting.groups.map(group => (
            <div key={group.groupKey} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {sourceLabel(group) === 'unknown'
                    ? t('reporting.unknownSource')
                    : sourceLabel(group)}
                </p>
                <p className="text-lg font-semibold">
                  {formatBasisPoints(format, group.winRateBps)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('reporting.winRate.counts', {
                  lost: group.lostCount,
                  open: group.openCount,
                  won: group.wonCount,
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </ReportingCard>
  );
}

function TaskQueueWidget({
  dueFormatter,
  queue,
  t,
}: Readonly<{
  dueFormatter: Intl.DateTimeFormat;
  queue: readonly AgentCrmTaskQueueItem[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}>) {
  return (
    <section
      className="rounded-lg border bg-white p-6 shadow-sm"
      data-testid="agent-crm-task-queue-ready"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            className="text-lg font-semibold"
            data-testid="agent-crm-task-queue-title"
            tabIndex={-1}
          >
            {t('crm.taskQueue.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('crm.taskQueue.description')}</p>
        </div>
        <div
          className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800"
          aria-label={t('crm.taskQueue.countLabel', { count: queue.length })}
          data-testid="agent-crm-task-queue-count"
        >
          {t('crm.taskQueue.count', { count: queue.length })}
        </div>
      </div>
      {queue.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t('crm.taskQueue.empty')}</p>
      ) : (
        <div className="mt-6 divide-y">
          {queue.map(item => (
            <div
              key={item.taskId}
              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              data-lead-id={item.subjectReference.id}
              data-task-id={item.taskId}
              data-testid="agent-crm-task-queue-row"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {item.leadDisplayRef.label || t('crm.taskQueue.unknownLead')}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{t(`crm.taskQueue.labels.${item.displayLabelCode}`)}</span>
                  <span>{t(`crm.taskQueue.status.${item.status}`)}</span>
                  <span>{t(`crm.taskQueue.priority.${item.priority}`)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.dueAt
                    ? t('crm.taskQueue.dueWithDate', {
                        bucket: t(`crm.taskQueue.dueBucket.${item.dueBucket}`),
                        date: dueFormatter.format(new Date(item.dueAt)),
                      })
                    : t(`crm.taskQueue.dueBucket.${item.dueBucket}`)}
                </p>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <TaskQueueControls
                  expectedLifecycleVersion={item.lifecycleVersion}
                  rowLabel={item.leadDisplayRef.label || t('crm.taskQueue.unknownLead')}
                  status={item.status}
                  taskId={item.taskId}
                />
                <Button variant="outline" size="sm" asChild>
                  <Link href={item.href} data-testid="agent-crm-task-queue-open">
                    {t('crm.taskQueue.openLead')}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CompletedTaskQueueWidget({
  completedFormatter,
  queue,
  t,
}: Readonly<{
  completedFormatter: Intl.DateTimeFormat;
  queue: readonly AgentCrmCompletedTaskQueueItem[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}>) {
  return (
    <section
      className="rounded-lg border bg-white p-6 shadow-sm"
      data-testid="agent-crm-task-completed-queue-ready"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            className="text-lg font-semibold"
            data-testid="agent-crm-task-completed-queue-title"
            tabIndex={-1}
          >
            {t('crm.taskQueue.completed.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('crm.taskQueue.completed.description')}
          </p>
        </div>
        <div
          className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-900"
          aria-label={t('crm.taskQueue.completed.countLabel', { count: queue.length })}
          data-testid="agent-crm-task-completed-queue-count"
        >
          {t('crm.taskQueue.completed.count', { count: queue.length })}
        </div>
      </div>
      {queue.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t('crm.taskQueue.completed.empty')}</p>
      ) : (
        <div className="mt-6 divide-y">
          {queue.map(item => {
            const rowLabel = item.leadDisplayRef.label || t('crm.taskQueue.unknownLead');
            return (
              <div
                key={item.taskId}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                data-lead-id={item.subjectReference.id}
                data-task-id={item.taskId}
                data-testid="agent-crm-task-completed-queue-row"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{rowLabel}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>{t(`crm.taskQueue.status.${item.status}`)}</span>
                    <span>{t(`crm.taskQueue.priority.${item.priority}`)}</span>
                    {item.completionReasonCode ? (
                      <span>
                        {t(`crm.taskQueue.completionReasons.${item.completionReasonCode}`)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('crm.taskQueue.completed.completedAt', {
                      date: completedFormatter.format(new Date(item.completedAt)),
                    })}
                  </p>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <TaskQueueReopenControls
                    expectedLifecycleVersion={item.lifecycleVersion}
                    rowLabel={rowLabel}
                    taskId={item.taskId}
                  />
                  <Button variant="outline" size="sm" asChild>
                    <Link href={item.href} data-testid="agent-crm-task-completed-queue-open">
                      {t('crm.taskQueue.openLead')}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default async function CRMPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('agent');
  const tCrm = await getTranslations('agent-crm');
  const format = await getFormatter();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const agentId = session.user.id;
  const role = session.user.role;
  const branchId = session.user.branchId ?? null;

  if (role !== 'agent' || !branchId) {
    notFound();
  }

  const tenantId = ensureTenantId(session);
  const actor = {
    actorId: agentId,
    role,
    scope: {
      agentId,
      branchId,
    },
    tenantId,
  } satisfies CrmActorContext;

  let stats;
  let reporting;
  let taskQueue;
  let completedTaskQueue;
  try {
    [stats, reporting, taskQueue, completedTaskQueue] = await Promise.all([
      getAgentCrmStatsCore({ actor }),
      getAgentCrmReportingCore({ actor }),
      getAgentCrmTaskQueueCore({ actor }),
      getAgentCrmCompletedTaskQueueCore({ actor }),
    ]);
  } catch (error) {
    if (
      error instanceof AgentCrmStatsAccessDeniedError ||
      error instanceof AgentCrmReportingAccessDeniedError
    ) {
      notFound();
    }
    throw error;
  }

  const dueFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-6" data-testid="agent-crm-page-ready">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('crm')}</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Stats */}
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('stats.new')}</div>
          <div className="text-2xl font-bold">{stats.newLeadsCount}</div>
        </div>
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('stats.verification')}</div>
          <div className="text-2xl font-bold">{stats.contactedLeadsCount}</div>
        </div>
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('stats.closed')}</div>
          <div className="text-2xl font-bold">{stats.closedWonDealsCount}</div>
        </div>
        <div className="p-6 bg-white rounded-lg border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('commissions.title')}</div>
          <div className="text-2xl font-bold">
            {format.number(stats.paidCommissionTotal, { style: 'currency', currency: 'EUR' })}
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="lg:col-span-3">
          <WeightedPipelineWidget
            format={format}
            locale={locale}
            reporting={reporting.weightedPipeline}
            t={t}
          />
        </div>
        <div className="lg:col-span-2">
          <SourceBreakdownWidget format={format} reporting={reporting.sourceBreakdown} t={t} />
        </div>
        <div className="lg:col-span-2">
          <WinRateWidget format={format} reporting={reporting.winRateBySource} t={t} />
        </div>
      </div>
      <TaskQueueWidget dueFormatter={dueFormatter} queue={taskQueue} t={tCrm} />
      <CompletedTaskQueueWidget
        completedFormatter={dueFormatter}
        queue={completedTaskQueue}
        t={tCrm}
      />
      <section
        className="rounded-lg border bg-white p-6 shadow-sm"
        data-testid="agent-crm-due-follow-ups"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t('followUps.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('followUps.description')}</p>
          </div>
          <div
            className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900"
            data-testid="agent-crm-due-follow-up-count"
          >
            {t('followUps.dueCount', { count: stats.dueFollowUps.length })}
          </div>
        </div>
        {stats.dueFollowUps.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">{t('followUps.empty')}</p>
        ) : (
          <div className="mt-6 divide-y">
            {stats.dueFollowUps.map(followUp => (
              <div
                key={followUp.activityId}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                data-lead-id={followUp.leadId}
                data-testid="agent-crm-due-follow-up-row"
              >
                <div>
                  <p className="font-medium">{followUp.leadName || t('followUps.unknownLead')}</p>
                  <p className="text-sm text-muted-foreground">{followUp.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('followUps.scheduledFor', {
                      date: dueFormatter.format(new Date(followUp.scheduledAt)),
                    })}
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/agent/leads/${followUp.leadId}`}
                    data-testid="agent-crm-due-follow-up-open"
                  >
                    {t('followUps.openLead')}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
