import type { ClaimStatus } from '@interdomestik/database/constants';
import { sql } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';

import {
  ClaimTransitionAuthorizationError,
  persistAuthorizedTransition,
  transitionClaimStatusInTransaction,
  type TransitionTx,
} from './transition';
import { canTransition } from './transition-guard';

type FakeTxCalls = {
  historyValues?: unknown;
  updateValues?: Record<string, unknown>;
};

const selectStep = { from: () => selectFromStep };
const selectFromStep = { leftJoin: () => selectFromStep, where: () => selectWhereStep };
const selectWhereStep = { limit: limitCurrentClaim };
const updateWhereStep = { returning: returnUpdatedClaim };

function limitCurrentClaim(): Array<{ id: string; lifecycleVersion: number; status: ClaimStatus }> {
  return [{ id: 'claim-1', lifecycleVersion: 1, status: 'draft' }];
}

function returnUpdatedClaim(): Array<{ id: string; lifecycleVersion: number }> {
  return [{ id: 'claim-1', lifecycleVersion: 2 }];
}

class FakeUpdateStep {
  constructor(private readonly calls: FakeTxCalls) {}

  set(values: Record<string, unknown>) {
    this.calls.updateValues = values;
    return { where: () => updateWhereStep };
  }
}

class FakeInsertStep {
  constructor(private readonly calls: FakeTxCalls) {}

  values(values: unknown) {
    this.calls.historyValues = values;
  }
}

class FakeTx {
  constructor(private readonly calls: FakeTxCalls) {}

  select() {
    return selectStep;
  }

  update() {
    return new FakeUpdateStep(this.calls);
  }

  insert() {
    return new FakeInsertStep(this.calls);
  }
}

function makeTx() {
  const calls: FakeTxCalls = {};
  const tx = new FakeTx(calls);
  return { calls, tx: tx as unknown as TransitionTx };
}

describe('transitionClaimStatusInTransaction transition graph rejection', () => {
  it('rejects illegal graph jumps before update or history writes', async () => {
    const { calls, tx } = makeTx();

    const result = await transitionClaimStatusInTransaction(tx, {
      actor: { id: 'staff-1', role: 'staff' },
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      toStatus: 'resolved',
    });

    expect(result).toEqual({ success: false, error: 'transition_rejected' });
    expect(calls.updateValues).toBeUndefined();
    expect(calls.historyValues).toBeUndefined();
  });
});

const actor = { id: 'staff-1', role: 'staff' };
const unreachableTx = new Proxy(
  {},
  {
    get() {
      throw new Error('persistence must not touch the database after a failed re-check');
    },
  }
) as TransitionTx;

function mintProof(from: 'evaluation', to: 'negotiation') {
  const decision = canTransition({
    actor,
    context: { paymentAuthorizationState: 'authorized' },
    from,
    to,
  });
  if (!decision.allowed) throw new Error('expected allowed decision for proof minting');
  return decision.authorization;
}

describe('persistAuthorizedTransition runtime re-check (T-002d)', () => {
  it('rejects a proof minted for a different current status before any write', async () => {
    await expect(
      persistAuthorizedTransition(unreachableTx, {
        actor,
        authorization: mintProof('evaluation', 'negotiation'),
        claimId: 'claim-1',
        current: { lifecycleVersion: 3, status: 'draft' },
        isPublic: true,
        note: null,
        readWhere: sql`tenant_scoped_claim = true`,
        tenantId: 'tenant-1',
      })
    ).rejects.toBeInstanceOf(ClaimTransitionAuthorizationError);
  });

  it('rejects a proof minted for a different actor before any write', async () => {
    await expect(
      persistAuthorizedTransition(unreachableTx, {
        actor: { id: 'someone-else', role: 'staff' },
        authorization: mintProof('evaluation', 'negotiation'),
        claimId: 'claim-1',
        current: { lifecycleVersion: 3, status: 'evaluation' },
        isPublic: true,
        note: null,
        readWhere: sql`tenant_scoped_claim = true`,
        tenantId: 'tenant-1',
      })
    ).rejects.toBeInstanceOf(ClaimTransitionAuthorizationError);
  });
});
