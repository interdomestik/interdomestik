import { withTenantContext } from '@interdomestik/database';
import { aiRuns } from '@interdomestik/database/schema';
import { and, eq, type SQL } from 'drizzle-orm';

type MarkAiRunDispatchFailedArgs = {
  /** Tenant of the tenant-scoped producer that queued the run. */
  tenantId: string;
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

  // db-access-guard: tenant-scoped -- reason: tenantId comes from the tenant-scoped producer that queued this run
  await withTenantContext({ tenantId: args.tenantId, role: 'system' }, async tx => {
    await tx
      .update(aiRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorCode: args.errorCode,
        errorMessage: args.message,
      })
      .where(and(eq(aiRuns.tenantId, args.tenantId), ...predicates));
  });
}
