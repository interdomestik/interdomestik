import { claimStageHistory } from '@interdomestik/database';
import { z } from 'zod';
import type { CreateClaimValues } from '../validators/claims';
import { recordCaseCreatedEvent } from './case-created-event';
import type { TransitionTx } from './transition-side-effects';

// Validate only the already-declared scalar types at the SQL value boundary.
// No coercion, normalization or container/Date restrictions.
const historyText = z.string({ error: 'Expected primitive string' });
const nullableHistoryText = historyText.nullable();

export type RecordSubmittedClaimLifecycleArgs = {
  changedByRole: string;
  claimId: string;
  createdAt: Date;
  data: Pick<CreateClaimValues, 'files'>;
  hostId?: string | null;
  publicNote: string | null;
  tenantId: string;
  userId: string;
};

export async function recordSubmittedClaimLifecycle(
  tx: TransitionTx,
  args: RecordSubmittedClaimLifecycleArgs
): Promise<void> {
  // db-access-guard: tenant-scoped -- reason: tenant proof is copied from the claim command boundary.
  await tx.insert(claimStageHistory).values({
    id: crypto.randomUUID(),
    tenantId: historyText.parse(args.tenantId),
    claimId: historyText.parse(args.claimId),
    fromStatus: null,
    toStatus: 'submitted',
    changedById: historyText.parse(args.userId),
    changedByRole: historyText.parse(args.changedByRole),
    note: nullableHistoryText.parse(args.publicNote),
    isPublic: true,
    createdAt: args.createdAt,
  });
  await recordCaseCreatedEvent(tx, {
    actor: { id: args.userId, role: args.changedByRole.trim() || 'member' },
    claimId: args.claimId,
    createdAt: args.createdAt,
    hasDocuments: Boolean(args.data.files?.length),
    hostId: args.hostId,
    initialStatus: 'submitted',
    tenantId: args.tenantId,
  });
}
