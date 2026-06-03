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

function makeTx(state: ClaimState, failOn?: 'history' | 'event') {
  const staged = { ...state, events: [...state.events], histories: [...state.histories] };
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ ...state, id: 'claim-1' }] }) }),
    }),
    update: () => ({
      set: (values: Row) => ({
        where: () => ({
          returning: async () => {
            if (typeof values.status === 'string') staged.status = values.status as ClaimStatus;
            if ('lifecycleVersion' in values) staged.lifecycleVersion += 1;
            return [{ id: 'claim-1', lifecycleVersion: staged.lifecycleVersion }];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Row) => {
        if (table === claimStageHistory) {
          if (failOn === 'history') throw new Error('history failed');
          staged.histories.push(values);
        }
        if (table === domainEvents) {
          if (failOn === 'event') throw new Error('event failed');
          staged.events.push(values);
        }
        return { returning: async () => [{ id: values.id }] };
      },
    }),
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
