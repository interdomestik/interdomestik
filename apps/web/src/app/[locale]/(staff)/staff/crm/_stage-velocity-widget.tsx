import { Info } from 'lucide-react';
import { Suspense, type ReactNode } from 'react';
import {
  buildStageVelocityScreenReaderSummary,
  type StageVelocityChartRow,
} from '@/components/crm/charts/chart-projections';
import { StageVelocityChartBoundary } from '@/components/crm/charts/reporting-chart-boundary';
import {
  STAFF_CRM_REPORTING_MARKER_PREFIX,
  type StaffCrmStageVelocityRow,
  type StaffCrmStageVelocityWidget,
} from './_core';
import type { Formatter, Translations } from './page';

export function formatCount(format: Formatter, value: number): string {
  return format.number(value, { maximumFractionDigits: 0 });
}

export function formatDays(format: Formatter, value: number): string {
  return format.number(value, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

export function toStaffStageVelocityChartRows(
  format: Formatter,
  rows: readonly StaffCrmStageVelocityRow[],
  t: Translations
): StageVelocityChartRow[] {
  return rows.map(row => ({
    averageDays: row.averageDays,
    averageFormatted: t('durationDays', { days: formatDays(format, row.averageDays) }),
    id: `${row.pipelineId}-${row.stageId}`,
    label: `${row.stageLabel} / ${row.pipelineLabel}`,
    medianDays: row.medianDays,
    medianFormatted: t('durationDays', { days: formatDays(format, row.medianDays) }),
  }));
}

export function StaffReportPanel({
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

export function WidgetStateMessage({
  kind,
  message,
}: Readonly<{ kind: 'empty' | 'error'; message: string }>) {
  const className =
    kind === 'error'
      ? 'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950'
      : 'text-sm text-muted-foreground';

  return <p className={className}>{message}</p>;
}

export function InlineCountNote({
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

export function StageVelocityWidget({
  format,
  locale,
  stageVelocity,
  t,
}: Readonly<{
  format: Formatter;
  locale: string;
  stageVelocity: StaffCrmStageVelocityWidget;
  t: Translations;
}>) {
  const chartRows =
    stageVelocity.state === 'data'
      ? toStaffStageVelocityChartRows(format, stageVelocity.summary.rows, t)
      : [];
  const chartSummary =
    chartRows.length > 0
      ? buildStageVelocityScreenReaderSummary(chartRows, {
          average: t('charts.stageVelocity.average'),
          hiddenItems: count => t('charts.hiddenItems', { count }),
          intro: t('charts.stageVelocity.summaryIntro'),
          median: t('charts.stageVelocity.median'),
        })
      : '';

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
      {chartRows.length > 0 ? (
        <Suspense fallback={null}>
          <StageVelocityChartBoundary
            description={t('charts.stageVelocity.description')}
            locale={locale}
            rows={chartRows}
            summary={chartSummary}
            text={{
              average: t('charts.stageVelocity.average'),
              median: t('charts.stageVelocity.median'),
            }}
            title={t('charts.stageVelocity.title')}
          />
        </Suspense>
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
