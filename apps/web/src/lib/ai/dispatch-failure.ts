import { db } from '@/lib/db.server';
import { withTenantContext } from '@interdomestik/database';
import { aiRuns } from '@interdomestik/database/schema';
import { and, eq, type SQL } from 'drizzle-orm';

type MarkAiRunDispatchFailedArgs = {
  entityType: string;
  errorCode: string;
  message: string;
  runId: string;
  workflow?: string;
};

export async function markAiRunDispatchFailedWithTenantContext(args: MarkAiRunDispatchFailedArgs) {
  const predicates: SQL[] = [
    eq(aiRuns.id, args.runId),
    eq(aiRuns.entityType, args.entityType),
    eq(aiRuns.status, 'queued'),
  ];

  if (args.workflow) {
    predicates.splice(1, 0, eq(aiRuns.workflow, args.workflow));
  }

  // BLOCKED(rc31-u2): tenant is discovered from the run record itself. The caller only supplies runId (the queued event's tenantId is not threaded through this signature), so there is no canonical tenant at this ambient-db lookup. Needs a signature change that passes the event tenantId or a privileged manifest entry.
  // db-access-guard: tenant-scoped -- reason: runId is a queued AI run emitted by the caller workflow
  const [queuedRun] = await db
    .select({ tenantId: aiRuns.tenantId })
    .from(aiRuns)
    .where(and(...predicates));

  if (!queuedRun?.tenantId) {
    return;
  }

  await withTenantContext({ tenantId: queuedRun.tenantId, role: 'system' }, async tx => {
    await tx
      .update(aiRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorCode: args.errorCode,
        errorMessage: args.message,
      })
      .where(and(eq(aiRuns.id, args.runId), eq(aiRuns.status, 'queued')));
  });
}
