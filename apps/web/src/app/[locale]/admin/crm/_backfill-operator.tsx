'use client';

import { AlertTriangle, CheckCircle2, Play, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { triggerCrmForecastSnapshotBackfill } from './_backfill-action';
import {
  ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MARKER_PREFIX,
  type AdminCrmForecastBackfillOperatorActionResult,
  type AdminCrmForecastBackfillOperatorErrorCode,
  type AdminCrmForecastBackfillOperatorRequest,
  type AdminCrmForecastBackfillOperatorResult,
} from './_backfill-types';

export interface AdminCrmForecastBackfillOperatorCopy {
  confirmInvalidates: string;
  confirmWarning: string;
  dateRowsTitle: string;
  dryRunButton: string;
  dryRunHelp: string;
  error: Record<AdminCrmForecastBackfillOperatorErrorCode, string>;
  fields: {
    fromDate: string;
    maxWorkItemsPerDate: string;
    tenantId: string;
    toDate: string;
  };
  help: string;
  noDateRows: string;
  pendingDryRun: string;
  pendingWrite: string;
  resultSummary: string;
  runWriteButton: string;
  status: {
    completed: string;
    deferred: string;
    failed: string;
    partial: string;
  };
  summary: {
    datesCompleted: string;
    datesConsidered: string;
    datesDeferred: string;
    datesFailed: string;
    datesPartial: string;
    generatedAt: string;
    snapshotsInserted: string;
    sourceRunId: string;
    versionConflicts: string;
    workItemsConsidered: string;
    workItemsDeferred: string;
    workItemsFailed: string;
    workItemsSucceeded: string;
  };
  table: {
    date: string;
    failed: string;
    inserted: string;
    status: string;
    succeeded: string;
    workItems: string;
  };
}

export function AdminCrmForecastBackfillOperator({
  copy,
  defaultFromDate,
  defaultTenantId,
  defaultToDate,
  locale,
  maxWorkItemsPerDate,
}: Readonly<{
  copy: AdminCrmForecastBackfillOperatorCopy;
  defaultFromDate: string;
  defaultTenantId: string;
  defaultToDate: string;
  locale: string;
  maxWorkItemsPerDate: number;
}>) {
  const [form, setForm] = useState({
    fromDate: defaultFromDate,
    maxWorkItemsPerDate: '',
    tenantId: defaultTenantId,
    toDate: defaultToDate,
  });
  const [result, setResult] = useState<AdminCrmForecastBackfillOperatorResult | null>(null);
  const [errorCode, setErrorCode] = useState<AdminCrmForecastBackfillOperatorErrorCode | null>(
    null
  );
  const [isPending, startTransition] = useTransition();
  const resultRef = useRef<HTMLDivElement | null>(null);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const pendingMode = isPending && result?.confirmationToken ? 'write' : 'dry_run';
  const canConfirm = Boolean(result?.confirmationToken) && !isPending;

  useEffect(() => {
    if (result || errorCode) resultRef.current?.focus();
  }, [errorCode, result]);

  function updateField(field: keyof typeof form, value: string): void {
    setForm(current => ({ ...current, [field]: value }));
    if (result?.confirmationToken) {
      setResult(null);
      setErrorCode(null);
    }
  }

  function buildRequest(): AdminCrmForecastBackfillOperatorRequest {
    const parsedMax = Number.parseInt(form.maxWorkItemsPerDate, 10);
    return {
      fromDate: form.fromDate,
      maxWorkItemsPerDate:
        form.maxWorkItemsPerDate.trim().length > 0 && Number.isFinite(parsedMax)
          ? parsedMax
          : undefined,
      tenantId: form.tenantId,
      toDate: form.toDate,
    };
  }

  function applyActionResult(actionResult: AdminCrmForecastBackfillOperatorActionResult): void {
    setResult(actionResult.result ?? null);
    setErrorCode(actionResult.success ? null : actionResult.errorCode);
  }

  function submitDryRun(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    startTransition(async () => {
      applyActionResult(
        await triggerCrmForecastSnapshotBackfill({
          mode: 'dry_run',
          request: buildRequest(),
        })
      );
    });
  }

  function submitWrite(): void {
    const confirmationToken = result?.confirmationToken;
    if (!confirmationToken) return;
    startTransition(async () => {
      applyActionResult(
        await triggerCrmForecastSnapshotBackfill({
          confirmationToken,
          mode: 'write',
          request: buildRequest(),
        })
      );
    });
  }

  return (
    <div className="mt-5 space-y-5">
      <p className="text-sm text-muted-foreground">{copy.help}</p>
      <form
        className="grid gap-3 md:grid-cols-[minmax(10rem,1fr)_repeat(3,minmax(9rem,11rem))_minmax(8rem,10rem)]"
        onSubmit={submitDryRun}
      >
        <label className="space-y-1 text-sm font-medium">
          <span>{copy.fields.tenantId}</span>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            name="tenantId"
            onChange={event => updateField('tenantId', event.target.value)}
            required
            value={form.tenantId}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>{copy.fields.fromDate}</span>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            name="fromDate"
            onChange={event => updateField('fromDate', event.target.value)}
            required
            type="date"
            value={form.fromDate}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>{copy.fields.toDate}</span>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            name="toDate"
            onChange={event => updateField('toDate', event.target.value)}
            required
            type="date"
            value={form.toDate}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>{copy.fields.maxWorkItemsPerDate}</span>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            max={maxWorkItemsPerDate}
            min={1}
            name="maxWorkItemsPerDate"
            onChange={event => updateField('maxWorkItemsPerDate', event.target.value)}
            placeholder={numberFormatter.format(maxWorkItemsPerDate)}
            type="number"
            value={form.maxWorkItemsPerDate}
          />
        </label>
        <button
          className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-md border bg-foreground px-3 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MARKER_PREFIX}dry-run`}
          disabled={isPending}
          type="submit"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          {isPending && pendingMode === 'dry_run' ? copy.pendingDryRun : copy.dryRunButton}
        </button>
      </form>
      <p className="text-xs text-muted-foreground">{copy.dryRunHelp}</p>

      {result?.confirmationToken ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {copy.confirmWarning} {copy.confirmInvalidates}
              </span>
            </p>
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`${ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MARKER_PREFIX}confirm-write`}
              disabled={!canConfirm}
              onClick={submitWrite}
              type="button"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {isPending && pendingMode === 'write' ? copy.pendingWrite : copy.runWriteButton}
            </button>
          </div>
        </div>
      ) : null}

      {result || errorCode ? (
        <div
          className="rounded-md border p-4"
          data-testid={`${ADMIN_CRM_FORECAST_BACKFILL_OPERATOR_MARKER_PREFIX}result`}
          ref={resultRef}
          tabIndex={-1}
        >
          {errorCode ? (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {copy.error[errorCode]}
            </p>
          ) : null}
          {result ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {copy.resultSummary}
                </p>
                <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">
                  {copy.status[result.status]}
                </span>
              </div>
              <ResultSummary copy={copy} format={numberFormatter} result={result} />
              <DateRows copy={copy} format={numberFormatter} result={result} />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ResultSummary({
  copy,
  format,
  result,
}: Readonly<{
  copy: AdminCrmForecastBackfillOperatorCopy;
  format: Intl.NumberFormat;
  result: AdminCrmForecastBackfillOperatorResult;
}>) {
  const metrics = [
    ['datesConsidered', result.datesConsidered],
    ['datesCompleted', result.datesCompleted],
    ['datesPartial', result.datesPartial],
    ['datesDeferred', result.datesDeferred],
    ['datesFailed', result.datesFailed],
    ['workItemsConsidered', result.workItemsConsidered],
    ['workItemsSucceeded', result.workItemsSucceeded],
    ['workItemsDeferred', result.workItemsDeferred],
    ['workItemsFailed', result.workItemsFailed],
    ['snapshotsInserted', result.snapshotsInserted],
    ['versionConflicts', result.snapshotVersionConflicts],
  ] as const;

  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map(([key, value]) => (
        <div key={key} className="rounded-md border p-3">
          <dt className="text-xs text-muted-foreground">{copy.summary[key]}</dt>
          <dd className="font-semibold">{format.format(value)}</dd>
        </div>
      ))}
      <div className="rounded-md border p-3 sm:col-span-2">
        <dt className="text-xs text-muted-foreground">{copy.summary.generatedAt}</dt>
        <dd className="break-all text-sm font-semibold">{result.generatedAt}</dd>
      </div>
      <div className="rounded-md border p-3 sm:col-span-2">
        <dt className="text-xs text-muted-foreground">{copy.summary.sourceRunId}</dt>
        <dd className="break-all text-sm font-semibold">{result.sourceRunId ?? '-'}</dd>
      </div>
    </dl>
  );
}

function DateRows({
  copy,
  format,
  result,
}: Readonly<{
  copy: AdminCrmForecastBackfillOperatorCopy;
  format: Intl.NumberFormat;
  result: AdminCrmForecastBackfillOperatorResult;
}>) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold">{copy.dateRowsTitle}</h3>
      {result.dateRows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{copy.noDateRows}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">{copy.table.date}</th>
                <th className="py-2 pr-3 font-medium">{copy.table.status}</th>
                <th className="py-2 pr-3 font-medium">{copy.table.workItems}</th>
                <th className="py-2 pr-3 font-medium">{copy.table.succeeded}</th>
                <th className="py-2 pr-3 font-medium">{copy.table.failed}</th>
                <th className="py-2 font-medium">{copy.table.inserted}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {result.dateRows.map(row => (
                <tr key={row.snapshotDate}>
                  <td className="py-3 pr-3">{row.snapshotDate}</td>
                  <td className="py-3 pr-3">{copy.status[row.status]}</td>
                  <td className="py-3 pr-3">{format.format(row.workItemsConsidered)}</td>
                  <td className="py-3 pr-3">{format.format(row.workItemsSucceeded)}</td>
                  <td className="py-3 pr-3">{format.format(row.failedWorkItems)}</td>
                  <td className="py-3">{format.format(row.snapshotsInserted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
