import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import type { getFormatter, getTranslations } from 'next-intl/server';

export type AdminCrmFormatter = Awaited<ReturnType<typeof getFormatter>>;
export type AdminCrmTranslations = Awaited<ReturnType<typeof getTranslations>>;

export function formatMinorAmount(
  format: AdminCrmFormatter,
  amountMinor: number,
  currencyCode: string
): string {
  return `${format.number(amountMinor / 100, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ${currencyCode}`;
}

export function formatCount(format: AdminCrmFormatter, value: number): string {
  return format.number(value, { maximumFractionDigits: 0 });
}

export function ReportingWidget({
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

export function WidgetError({ message }: Readonly<{ message: string }>) {
  return (
    <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      {message}
    </p>
  );
}

export function WidgetEmpty({ message }: Readonly<{ message: string }>) {
  return <p className="mt-5 text-sm text-muted-foreground">{message}</p>;
}

export function ExcludedRowsNote({
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

type SnapshotMetricRow = {
  branchId?: string | null;
  closedLostAmountMinor: number;
  closedWonAmountMinor: number;
  currencyCode: string;
  freshness: 'delayed' | 'fresh' | 'missing' | 'stale';
  openDealCount: number;
  pipelineId: string;
  snapshotDate: string;
  snapshotVersion: number;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
};

function SnapshotStatus({
  row,
  t,
}: Readonly<{
  row: Pick<SnapshotMetricRow, 'freshness' | 'snapshotVersion'>;
  t: AdminCrmTranslations;
}>) {
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

export function SnapshotRowsList<Row extends SnapshotMetricRow>({
  format,
  getKey,
  rows,
  t,
}: Readonly<{
  format: AdminCrmFormatter;
  getKey: (row: Row) => string;
  rows: readonly Row[];
  t: AdminCrmTranslations;
}>) {
  return (
    <div className="mt-5 space-y-4">
      {rows.map(row => (
        <div key={getKey(row)} className="rounded-md border p-4">
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
  );
}

type PipelineMetricRow = {
  branchId?: string | null;
  branchLabel: string;
  currencyCode: string;
  openDealCount: number;
  pipelineId: string;
  pipelineLabel: string;
  totalPipelineAmountMinor: number;
  weightedPipelineAmountMinor: number;
};

export function PipelineRowsList<Row extends PipelineMetricRow>({
  format,
  getBranchLabel,
  getKey,
  rows,
  t,
}: Readonly<{
  format: AdminCrmFormatter;
  getBranchLabel: (row: Row) => string;
  getKey: (row: Row) => string;
  rows: readonly Row[];
  t: AdminCrmTranslations;
}>) {
  return (
    <div className="mt-5 divide-y">
      {rows.map(row => (
        <div
          key={getKey(row)}
          className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto]"
        >
          <div>
            <p className="font-medium">{getBranchLabel(row)}</p>
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
              <dd>{formatMinorAmount(format, row.totalPipelineAmountMinor, row.currencyCode)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('metrics.openDeals')}</dt>
              <dd>{formatCount(format, row.openDealCount)}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

type SourceMetricRow = {
  branchId?: string | null;
  currencyCode: string;
  dealCount: number;
  sourceLabel: string;
  totalAmountMinor: number;
  weightedAmountMinor: number;
};

export function SourceRowsList<Row extends SourceMetricRow>({
  format,
  getKey,
  rows,
  t,
}: Readonly<{
  format: AdminCrmFormatter;
  getKey: (row: Row) => string;
  rows: readonly Row[];
  t: AdminCrmTranslations;
}>) {
  return (
    <div className="mt-5 divide-y">
      {rows.map(row => (
        <div
          key={getKey(row)}
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
  );
}
