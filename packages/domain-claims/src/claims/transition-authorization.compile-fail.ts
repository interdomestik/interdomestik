// T-002d compile-fail fixture: every @ts-expect-error below must stay a type
// error. Deliberate `as AuthorizedTransition` casts are policy/review-covered.
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { SQLWrapper } from 'drizzle-orm';
import type { AuthorizedTransition } from './transition-guard';
import { persistAuthorizedTransition } from './transition';
import type { TransitionTx } from './transition-side-effects';

declare const tx: TransitionTx;
declare const from: ClaimStatus;
declare const scopedReadWhere: SQLWrapper;
declare const to: ClaimStatus;

// @ts-expect-error T-002d: structural construction must fail.
const forgedProof: AuthorizedTransition = { actorId: 'actor-1', from, to };

export async function rawPersistenceCallMustFail(): Promise<void> {
  await persistAuthorizedTransition(tx, {
    actor: { id: 'actor-1', role: 'staff' },
    // @ts-expect-error T-002d: unbranded object is not proof.
    authorization: { actorId: 'actor-1', from, to },
    claimId: 'claim-1',
    current: { lifecycleVersion: 1, status: from },
    isPublic: true,
    note: null,
    readWhere: scopedReadWhere,
    tenantId: 'tenant-1',
  });
}

export async function rawStatusOverloadMustNotExist(): Promise<void> {
  await persistAuthorizedTransition(tx, {
    actor: { id: 'actor-1', role: 'staff' },
    // @ts-expect-error T-002d: bare status cannot replace proof.
    authorization: to,
    claimId: 'claim-1',
    current: { lifecycleVersion: 1, status: from },
    isPublic: true,
    note: null,
    readWhere: scopedReadWhere,
    tenantId: 'tenant-1',
  });
}

export async function scopedWhereMustBeProvided(): Promise<void> {
  const proof = {} as AuthorizedTransition;
  await persistAuthorizedTransition(tx, {
    actor: { id: 'actor-1', role: 'staff' },
    authorization: proof,
    claimId: 'claim-1',
    current: { lifecycleVersion: 1, status: from },
    isPublic: true,
    note: null,
    // @ts-expect-error T-002d: scoped predicate is required.
    readWhere: undefined,
    tenantId: 'tenant-1',
  });
}

void forgedProof;
