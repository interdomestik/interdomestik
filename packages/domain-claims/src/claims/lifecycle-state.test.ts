import { claimStageHistory, domainEvents } from '@interdomestik/database';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { describe, expect, it } from 'vitest';

import {
  CLAIM_STATUS_LIFECYCLE_STATE_MAP,
  mapClaimStatusToLifecycleStates,
} from './lifecycle-state';
import { authorizedRecoveryReadRow } from './recovery-evidence-test-support';
import { transitionClaimStatusInTransaction, type TransitionTx } from './transition';

type Row = Record<string, unknown>;
type ClaimState = {
  caseLifecycleState: string | null;
  lifecycleVersion: number;
  recoveryLifecycleState: string | null;
  status: ClaimStatus;
  updateValues?: Row;
};

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
    return [{ id: 'claim-1', ...this.state }];
  }
}

class FakeUpdate {
  private values: Row = {};
  constructor(private readonly state: ClaimState) {}
  set(values: Row): this {
    this.values = values;
    return this;
  }
  where(): this {
    return this;
  }
  async returning(): Promise<Row[]> {
    this.state.updateValues = this.values;
    if (typeof this.values.status === 'string')
      this.state.status = this.values.status as ClaimStatus;
    if (typeof this.values.caseLifecycleState === 'string') {
      this.state.caseLifecycleState = this.values.caseLifecycleState;
    }
    if (typeof this.values.recoveryLifecycleState === 'string') {
      this.state.recoveryLifecycleState = this.values.recoveryLifecycleState;
    }
    if ('lifecycleVersion' in this.values) this.state.lifecycleVersion += 1;
    return [{ id: 'claim-1', lifecycleVersion: this.state.lifecycleVersion }];
  }
}

class FakeInsert {
  constructor(private readonly table: unknown) {}
  values(values: Row) {
    if (this.table !== claimStageHistory && this.table !== domainEvents) {
      throw new Error('unexpected insert table');
    }
    return { returning: async () => [{ id: values.id }] };
  }
}

function makeTx(state: ClaimState): TransitionTx {
  return {
    execute: async () => [authorizedRecoveryReadRow(state)],
    select: () => new FakeSelect(state),
    update: () => new FakeUpdate(state),
    insert: (table: unknown) => new FakeInsert(table),
  } as unknown as TransitionTx;
}
describe('claim lifecycle state mapping', () => {
  it('defines case and recovery states for every current status', () => {
    expect(
      Object.keys(CLAIM_STATUS_LIFECYCLE_STATE_MAP).sort((left, right) => left.localeCompare(right))
    ).toEqual([...CLAIM_STATUSES].sort((left, right) => left.localeCompare(right)));

    expect(mapClaimStatusToLifecycleStates('draft')).toEqual({
      caseLifecycleState: 'draft',
      recoveryLifecycleState: 'not_started',
    });
    expect(mapClaimStatusToLifecycleStates('negotiation')).toEqual({
      caseLifecycleState: 'recovery',
      recoveryLifecycleState: 'negotiation',
    });
    expect(mapClaimStatusToLifecycleStates('court')).toEqual({
      caseLifecycleState: 'recovery',
      recoveryLifecycleState: 'court',
    });
    expect(CLAIM_STATUS_LIFECYCLE_STATE_MAP).toEqual({
      draft: { caseLifecycleState: 'draft', recoveryLifecycleState: 'not_started' },
      submitted: { caseLifecycleState: 'submitted', recoveryLifecycleState: 'not_started' },
      verification: { caseLifecycleState: 'verification', recoveryLifecycleState: 'not_started' },
      evaluation: { caseLifecycleState: 'evaluation', recoveryLifecycleState: 'not_started' },
      negotiation: { caseLifecycleState: 'recovery', recoveryLifecycleState: 'negotiation' },
      court: { caseLifecycleState: 'recovery', recoveryLifecycleState: 'court' },
      resolved: { caseLifecycleState: 'resolved', recoveryLifecycleState: 'resolved' },
      rejected: { caseLifecycleState: 'rejected', recoveryLifecycleState: 'closed' },
    });
  });

  it('persists mapped states during status-changing transitions', async () => {
    const state: ClaimState = {
      caseLifecycleState: null,
      lifecycleVersion: 6,
      recoveryLifecycleState: null,
      status: 'evaluation',
    };

    const result = await transitionClaimStatusInTransaction(makeTx(state), {
      actor: { id: 'staff-1', role: 'staff' },
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      toStatus: 'negotiation',
    });

    expect(result).toMatchObject({ success: true, lifecycleVersion: 7, status: 'negotiation' });
    expect(state.updateValues).toEqual(
      expect.objectContaining({
        caseLifecycleState: 'recovery',
        recoveryLifecycleState: 'negotiation',
        status: 'negotiation',
      })
    );
    expect(state.caseLifecycleState).toBe('recovery');
    expect(state.recoveryLifecycleState).toBe('negotiation');
  });
});
