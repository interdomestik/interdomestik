import { claimStageHistory, domainEvents } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { describe, expect, it } from 'vitest';

import { transitionClaimStatusInTransaction, type TransitionTx } from './transition';

type Row = Record<string, unknown>;
type ClaimState = {
  events: Row[];
  histories: Row[];
  lifecycleVersion: number;
  status: ClaimStatus;
};
type FailOn = 'history' | 'event';

class FakeSelect {
  constructor(private readonly state: ClaimState) {}
  from(): this {
    return this;
  }
  where(): this {
    return this;
  }
  async limit(): Promise<Row[]> {
    return [{ ...this.state, id: 'claim-1' }];
  }
}

class FakeUpdate {
  private values: Row = {};
  constructor(private readonly staged: ClaimState) {}
  set(values: Row): this {
    this.values = values;
    return this;
  }
  where(): this {
    return this;
  }
  async returning(): Promise<Row[]> {
    if (typeof this.values.status === 'string')
      this.staged.status = this.values.status as ClaimStatus;
    if ('lifecycleVersion' in this.values) this.staged.lifecycleVersion += 1;
    return [{ id: 'claim-1', lifecycleVersion: this.staged.lifecycleVersion }];
  }
}

class FakeInsert {
  constructor(
    private readonly staged: ClaimState,
    private readonly table: unknown,
    private readonly failOn?: FailOn
  ) {}
  values(values: Row) {
    if (this.table === claimStageHistory) {
      if (this.failOn === 'history') throw new Error('history failed');
      this.staged.histories.push(values);
    }
    if (this.table === domainEvents) {
      if (this.failOn === 'event') throw new Error('event failed');
      this.staged.events.push(values);
    }
    return { returning: async () => [{ id: values.id }] };
  }
}

function makeParams() {
  return {
    actor: { id: 'staff-1', role: 'staff' },
    claimId: 'claim-1',
    correlationId: 'corr-1',
    paymentAuthorizationState: 'authorized' as const,
    tenantId: 'tenant-1',
    toStatus: 'negotiation' as const,
  };
}

function makeTx(state: ClaimState, failOn?: FailOn) {
  const staged = { ...state, events: [...state.events], histories: [...state.histories] };
  const tx = {
    select: () => new FakeSelect(state),
    update: () => new FakeUpdate(staged),
    insert: (table: unknown) => new FakeInsert(staged, table, failOn),
  };
  return { commit: () => Object.assign(state, staged), tx: tx as unknown as TransitionTx };
}

async function runTransaction(state: ClaimState, failOn?: 'history' | 'event') {
  const { commit, tx } = makeTx(state, failOn);
  const result = await transitionClaimStatusInTransaction(tx, makeParams());
  commit();
  return result;
}

describe('transitionClaimStatusInTransaction event atomicity', () => {
  it('commits status, history, and exactly one event for a successful transition', async () => {
    const state: ClaimState = {
      events: [],
      histories: [],
      lifecycleVersion: 6,
      status: 'evaluation',
    };

    await expect(runTransaction(state)).resolves.toMatchObject({ success: true });

    expect(state.status).toBe('negotiation');
    expect(state.lifecycleVersion).toBe(7);
    expect(state.histories).toHaveLength(1);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toEqual(
      expect.objectContaining({
        aggregateVersion: 7,
        actorId: 'staff-1',
        correlationId: 'corr-1',
        entityId: 'claim-1',
        entityType: 'claim',
        eventName: 'claim.status_changed',
        eventVersion: 1,
        payload: { fromStatus: 'evaluation', toStatus: 'negotiation' },
        tenantId: 'tenant-1',
      })
    );
  });

  it('rolls back status and history when event append fails', async () => {
    const state: ClaimState = {
      events: [],
      histories: [],
      lifecycleVersion: 6,
      status: 'evaluation',
    };

    await expect(runTransaction(state, 'event')).rejects.toThrow('event failed');

    expect(state).toEqual({ events: [], histories: [], lifecycleVersion: 6, status: 'evaluation' });
  });

  it('does not commit status or event when history insert fails', async () => {
    const state: ClaimState = {
      events: [],
      histories: [],
      lifecycleVersion: 6,
      status: 'evaluation',
    };

    await expect(runTransaction(state, 'history')).rejects.toThrow('history failed');

    expect(state).toEqual({ events: [], histories: [], lifecycleVersion: 6, status: 'evaluation' });
  });
});
