import { inspect } from 'node:util';
import { domainEvents } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { describe, expect, it } from 'vitest';

import {
  ClaimTransitionConflictError,
  transitionClaimStatusInTransaction,
  type TransitionClaimStatusParams,
  type TransitionTx,
} from './transition';

type UpdatedRows = Array<{ id: string; lifecycleVersion: number }>;
type Params = TransitionClaimStatusParams;
function makeParams(overrides: Partial<Params> = {}): Params {
  return {
    actor: { id: 'staff-1', role: 'staff' },
    claimId: 'claim-1',
    paymentAuthorizationState: 'authorized',
    tenantId: 'tenant-1',
    toStatus: 'negotiation',
    ...overrides,
  };
}
function makeTx(options: {
  current?: { id: string; lifecycleVersion: number; status: ClaimStatus | null };
  updated?: UpdatedRows | (() => UpdatedRows);
}) {
  const calls: {
    eventValues?: unknown;
    historyValues?: unknown;
    updateValues?: Record<string, unknown>;
    whereConditions: unknown[];
  } = { whereConditions: [] };
  const tx = {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          calls.whereConditions.push(condition);
          return {
            limit: async () => (options.current ? [options.current] : []),
          };
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        calls.updateValues = values;
        return {
          where: (condition: unknown) => {
            calls.whereConditions.push(condition);
            return {
              returning: async () =>
                typeof options.updated === 'function' ? options.updated() : (options.updated ?? []),
            };
          },
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === domainEvents) calls.eventValues = values;
        else calls.historyValues = values;
        return { returning: async () => [{ id: values.id }] };
      },
    }),
  };
  return { calls, tx: tx as unknown as TransitionTx };
}
describe('transitionClaimStatusInTransaction', () => {
  it('updates status with a lifecycle-version compare-and-set and appends history', async () => {
    const { calls, tx } = makeTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    const result = await transitionClaimStatusInTransaction(tx, makeParams());

    expect(result).toEqual({
      success: true,
      fromStatus: 'evaluation',
      lifecycleVersion: 7,
      status: 'negotiation',
    });
    expect(calls.updateValues).toEqual(
      expect.objectContaining({
        status: 'negotiation',
        statusUpdatedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
    );
    const updateWhere = inspect(calls.whereConditions.at(-1), { depth: 20 });
    expect(updateWhere).toContain('lifecycle_version');
    expect(updateWhere).toContain('status');
    expect(calls.historyValues).toEqual(
      expect.objectContaining({
        changedById: 'staff-1',
        changedByRole: 'staff',
        claimId: 'claim-1',
        fromStatus: 'evaluation',
        tenantId: 'tenant-1',
        toStatus: 'negotiation',
      })
    );
  });
  it('throws a typed conflict when the lifecycle version is stale', async () => {
    const { tx } = makeTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      updated: [],
    });

    const transition = transitionClaimStatusInTransaction(tx, makeParams());
    await expect(transition).rejects.toThrow(ClaimTransitionConflictError);
  });
  it('lets exactly one same-version transition win', async () => {
    let claimed = false;
    const { tx } = makeTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      updated: () => {
        if (claimed) return [];
        claimed = true;
        return [{ id: 'claim-1', lifecycleVersion: 7 }];
      },
    });

    const results = await Promise.allSettled([
      transitionClaimStatusInTransaction(tx, makeParams()),
      transitionClaimStatusInTransaction(tx, makeParams()),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toEqual(
      expect.objectContaining({ reason: expect.any(ClaimTransitionConflictError) })
    );
  });

  it('rejects payment-gated transitions before updating', async () => {
    const { calls, tx } = makeTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      updated: [{ id: 'claim-1', lifecycleVersion: 7 }],
    });

    const result = await transitionClaimStatusInTransaction(
      tx,
      makeParams({ paymentAuthorizationState: 'pending' })
    );

    expect(result).toEqual({ success: false, error: 'transition_rejected' });
    expect(calls.updateValues).toBeUndefined();
    expect(calls.historyValues).toBeUndefined();
  });

  it('keeps same-status history behind the lifecycle-version compare-and-set', async () => {
    const { calls, tx } = makeTx({
      current: { id: 'claim-1', lifecycleVersion: 6, status: 'evaluation' },
      updated: [{ id: 'claim-1', lifecycleVersion: 6 }],
    });

    const result = await transitionClaimStatusInTransaction(
      tx,
      makeParams({ toStatus: 'evaluation' })
    );

    expect(result).toEqual({
      success: true,
      fromStatus: 'evaluation',
      lifecycleVersion: 6,
      status: 'evaluation',
    });
    expect(calls.updateValues).toEqual({ updatedAt: expect.any(Date) });
    const updateWhere = inspect(calls.whereConditions.at(-1), { depth: 20 });
    expect(updateWhere).toContain('lifecycle_version');
    expect(updateWhere).toContain('status');
    expect(calls.historyValues).toEqual(
      expect.objectContaining({
        fromStatus: 'evaluation',
        toStatus: 'evaluation',
      })
    );
    expect(calls.eventValues).toBeUndefined();
  });
});
