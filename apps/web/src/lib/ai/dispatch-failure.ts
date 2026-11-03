import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { aiRuns } from '@interdomestik/database/schema';
import { and, eq, type SQL } from 'drizzle-orm';

type MarkAiRunDispatchFailedArgs = {
  /** The authority of the tenant-scoped producer that queued the run. */
  authority: TenantAuthority;
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

  const { tenantId } = readTenantAuthority(args.authority);
  await withTenantAuthority(args.authority, async tx => {
    await tx
      .update(aiRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorCode: args.errorCode,
        errorMessage: args.message,
      })
      .where(and(eq(aiRuns.tenantId, tenantId), ...predicates));
  });
}
