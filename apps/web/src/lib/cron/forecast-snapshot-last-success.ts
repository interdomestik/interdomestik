import { z } from 'zod';

const completedForecastRun = z.object({
  success: z.literal(true),
  result: z.object({
    completedAt: z.iso.datetime(),
    startedAt: z.iso.datetime(),
    failedWorkItems: z.literal(0),
    versionConflicts: z.literal(0),
    workItemsDeferred: z.literal(0),
    workItemsConsidered: z.int().nonnegative(),
    workItemsSucceeded: z.int().nonnegative(),
  }),
});

/** WP-15 can advance last success only when this response supplies a completed run. */
export function getForecastSnapshotLastSuccess(responseBody: unknown): string | null {
  const parsed = completedForecastRun.safeParse(responseBody);
  if (!parsed.success) return null;

  const run = parsed.data.result;
  if (
    Date.parse(run.completedAt) < Date.parse(run.startedAt) ||
    run.workItemsSucceeded !== run.workItemsConsidered
  ) {
    return null;
  }
  return run.completedAt;
}
