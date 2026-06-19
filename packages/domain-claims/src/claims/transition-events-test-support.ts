import { claimStageHistory, domainEvents } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';

import { authorizedRecoveryReadRow } from './recovery-evidence-test-support';
import { transitionClaimStatusInTransaction, type TransitionTx } from './transition';

type Row = Record<string, unknown>;
export type ClaimState = {
  events: Row[];
  histories: Row[];
  lifecycleVersion: number;
  status: ClaimStatus;
};
type FailOn = 'history' | 'event';

export const initialState = (): ClaimState => ({
  events: [],
  histories: [],
  lifecycleVersion: 6,
  status: 'evaluation',
});

class FakeSelect {
  private joined = false;
  constructor(private readonly state: ClaimState) {}
  from(): this {
    return this;
  }
  leftJoin(): this {
    this.joined = true;
    return this;
  }
  where(): this {
    return this;
  }
  async limit(): Promise<Row[]> {
    if (this.joined) {
      return [authorizedRecoveryReadRow(this.state)];
    }
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
    isPublic: false,
    note: 'member-visible status note',
    tenantId: 'tenant-1',
    toStatus: 'negotiation' as const,
  };
}

function makeTx(state: ClaimState, failOn?: FailOn) {
  const staged = { ...state, events: [...state.events], histories: [...state.histories] };
  const tx = {
    execute: async () => [authorizedRecoveryReadRow(state)],
    select: () => new FakeSelect(state),
    update: () => new FakeUpdate(staged),
    insert: (table: unknown) => new FakeInsert(staged, table, failOn),
  };
  return { commit: () => Object.assign(state, staged), tx: tx as unknown as TransitionTx };
}

export async function runTransaction(state: ClaimState, failOn?: FailOn) {
  const { commit, tx } = makeTx(state, failOn);
  const result = await transitionClaimStatusInTransaction(tx, makeParams());
  commit();
  return result;
}
