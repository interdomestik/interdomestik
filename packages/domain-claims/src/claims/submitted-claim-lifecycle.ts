import { claimStageHistory } from '@interdomestik/database';
import type { CreateClaimValues } from '../validators/claims';
import { recordCaseCreatedEvent } from './case-created-event';
import type { TransitionTx } from './transition-side-effects';

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
    tenantId: args.tenantId,
    claimId: args.claimId,
    fromStatus: null,
    toStatus: 'submitted',
    changedById: args.userId,
    changedByRole: args.changedByRole,
    note: args.publicNote,
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
