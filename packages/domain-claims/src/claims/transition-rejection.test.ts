import type { ClaimStatus } from '@interdomestik/database/constants';
import { describe, expect, it } from 'vitest';

import { transitionClaimStatusInTransaction, type TransitionTx } from './transition';

type FakeTxCalls = {
  historyValues?: unknown;
  updateValues?: Record<string, unknown>;
};

const selectStep = { from: () => selectFromStep };
const selectFromStep = { where: () => selectWhereStep };
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
      paymentAuthorizationState: 'authorized',
      tenantId: 'tenant-1',
      toStatus: 'resolved',
    });

    expect(result).toEqual({ success: false, error: 'transition_rejected' });
    expect(calls.updateValues).toBeUndefined();
    expect(calls.historyValues).toBeUndefined();
  });
});
