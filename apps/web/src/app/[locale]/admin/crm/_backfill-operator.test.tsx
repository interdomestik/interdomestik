import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  action: vi.fn(),
}));

vi.mock('./_backfill-action', () => ({
  triggerCrmForecastSnapshotBackfill: hoisted.action,
}));

import { AdminCrmForecastBackfillOperator } from './_backfill-operator';
import type { AdminCrmForecastBackfillOperatorCopy } from './_backfill-operator';

const copy: AdminCrmForecastBackfillOperatorCopy = {
  confirmInvalidates: 'Changing any field requires a new dry-run.',
  confirmWarning: 'Write mode inserts append-only snapshots.',
  dateRowsTitle: 'Date results',
  dryRunButton: 'Dry-run',
  dryRunHelp: 'Dry-run help',
  error: {
    all_dates_failed: 'All dates failed',
    confirmation_expired: 'Confirmation expired',
    confirmation_in_flight: 'Confirmation in flight',
    confirmation_invalid: 'Confirmation invalid',
    date_out_of_bounds: 'Date out of bounds',
    internal_error: 'Internal error',
    invalid_range: 'Invalid range',
    invalid_request: 'Invalid request',
    invalid_tenant: 'Invalid tenant',
    partial_failure: 'Partial failure',
    range_too_large: 'Range too large',
    rate_limited: 'Rate limited',
    unauthorized: 'Unauthorized',
  },
  fields: {
    fromDate: 'From date',
    maxWorkItemsPerDate: 'Max work items',
    tenantId: 'Tenant ID',
    toDate: 'To date',
  },
  help: 'Operator help',
  noDateRows: 'No date rows',
  pendingDryRun: 'Running dry-run',
  pendingWrite: 'Writing snapshots',
  resultSummary: 'Backfill result',
  runWriteButton: 'Confirm write',
  status: {
    completed: 'Completed',
    deferred: 'Deferred',
    failed: 'Failed',
    partial: 'Partial',
  },
  summary: {
    datesCompleted: 'Dates completed',
    datesConsidered: 'Dates considered',
    datesDeferred: 'Dates deferred',
    datesFailed: 'Dates failed',
    datesPartial: 'Dates partial',
    generatedAt: 'Generated at',
    snapshotsInserted: 'Snapshots inserted',
    sourceRunId: 'Source run',
    versionConflicts: 'Version conflicts',
    workItemsConsidered: 'Work items considered',
    workItemsDeferred: 'Work items deferred',
    workItemsFailed: 'Work items failed',
    workItemsSucceeded: 'Work items succeeded',
  },
  table: {
    date: 'Date',
    failed: 'Failed',
    inserted: 'Inserted',
    status: 'Status',
    succeeded: 'Succeeded',
    workItems: 'Work items',
  },
};

function renderOperator() {
  return render(
    <AdminCrmForecastBackfillOperator
      copy={copy}
      defaultFromDate="2026-05-14"
      defaultTenantId="tenant-1"
      defaultToDate="2026-05-14"
      locale="en"
      maxWorkItemsPerDate={250}
    />
  );
}

describe('AdminCrmForecastBackfillOperator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.action.mockResolvedValue({
      result: {
        confirmationToken: 'token-1',
        dateRows: [
          {
            failedWorkItems: 0,
            snapshotDate: '2026-05-14',
            snapshotsInserted: 0,
            status: 'completed',
            versionConflicts: 0,
            workItemsConsidered: 1,
            workItemsDeferred: 0,
            workItemsSucceeded: 1,
          },
        ],
        datesCompleted: 1,
        datesConsidered: 1,
        datesDeferred: 0,
        datesFailed: 0,
        datesPartial: 0,
        fromDate: '2026-05-14',
        generatedAt: '2026-05-15T10:00:00.000Z',
        mode: 'dry_run',
        snapshotVersionConflicts: 0,
        snapshotsInserted: 0,
        sourceRunId: 'run-1',
        status: 'completed',
        tenantId: 'tenant-1',
        toDate: '2026-05-14',
        workItemsConsidered: 1,
        workItemsDeferred: 0,
        workItemsFailed: 0,
        workItemsSucceeded: 1,
      },
      success: true,
    });
  });

  it('submits dry-run first and renders aggregate confirmation state', async () => {
    renderOperator();

    await userEvent.click(screen.getByRole('button', { name: 'Dry-run' }));

    await waitFor(() =>
      expect(hoisted.action).toHaveBeenCalledWith({
        mode: 'dry_run',
        request: {
          fromDate: '2026-05-14',
          maxWorkItemsPerDate: undefined,
          tenantId: 'tenant-1',
          toDate: '2026-05-14',
        },
      })
    );
    expect(screen.getByText('Backfill result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm write' })).toBeEnabled();
    expect(document.body.textContent).not.toContain('token-1');
  });

  it('submits write mode only with the returned confirmation token', async () => {
    renderOperator();

    await userEvent.click(screen.getByRole('button', { name: 'Dry-run' }));
    await screen.findByRole('button', { name: 'Confirm write' });
    hoisted.action.mockResolvedValueOnce({
      result: {
        ...(await hoisted.action.mock.results[0].value).result,
        confirmationToken: null,
        mode: 'write',
        snapshotsInserted: 1,
      },
      success: true,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Confirm write' }));

    await waitFor(() =>
      expect(hoisted.action).toHaveBeenLastCalledWith({
        confirmationToken: 'token-1',
        mode: 'write',
        request: {
          fromDate: '2026-05-14',
          maxWorkItemsPerDate: undefined,
          tenantId: 'tenant-1',
          toDate: '2026-05-14',
        },
      })
    );
  });

  it('clears confirmation state when the request tuple changes', async () => {
    renderOperator();

    await userEvent.click(screen.getByRole('button', { name: 'Dry-run' }));
    await screen.findByRole('button', { name: 'Confirm write' });
    await userEvent.clear(screen.getByLabelText('To date'));
    await userEvent.type(screen.getByLabelText('To date'), '2026-05-13');

    expect(screen.queryByRole('button', { name: 'Confirm write' })).not.toBeInTheDocument();
  });
});
