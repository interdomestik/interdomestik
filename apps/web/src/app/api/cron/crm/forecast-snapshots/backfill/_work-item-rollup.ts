import type { CrmForecastSnapshotWorkItem } from '@/adapters/crm/forecast-snapshot-work-items';

import { isCrmForecastSnapshotSoftTimeoutError } from '../_shared';
import type { BoundedWorkItemPoolOutcome } from './_bounded-work-item-pool';
import type { CrmForecastSnapshotBackfillDateResult } from './_core';

type WorkItemOutcome = BoundedWorkItemPoolOutcome<
  CrmForecastSnapshotWorkItem,
  number | 'version_conflict'
>;

export function rollUpCrmForecastSnapshotBackfillWorkItemOutcomes(args: {
  dryRun: boolean;
  logFailure: (workItem: CrmForecastSnapshotWorkItem, error: unknown) => void;
  outcomes: readonly WorkItemOutcome[];
  result: CrmForecastSnapshotBackfillDateResult;
}): void {
  let softTimeoutFailures = 0;
  for (const outcome of args.outcomes) {
    if (outcome.status === 'fulfilled') {
      rollUpFulfilledOutcome(args.result, outcome.value, args.dryRun);
      continue;
    }

    const softTimeout = isCrmForecastSnapshotSoftTimeoutError(outcome.error);
    const deferTimedOutWorkItem = softTimeout && softTimeoutFailures > 0;
    if (softTimeout) softTimeoutFailures += 1;

    args.logFailure(outcome.item, outcome.error);
    if (deferTimedOutWorkItem) {
      args.result.workItemsDeferred += 1;
    } else {
      args.result.failedWorkItems += 1;
    }
  }
}

function rollUpFulfilledOutcome(
  result: CrmForecastSnapshotBackfillDateResult,
  value: number | 'version_conflict',
  dryRun: boolean
): void {
  if (value === 'version_conflict') {
    result.versionConflicts += 1;
    return;
  }

  result.workItemsSucceeded += 1;
  if (!dryRun) result.snapshotsInserted += value;
}
