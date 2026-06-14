import { describe, expect, it } from 'vitest';

import { initialState, runTransaction } from './transition-events-test-support';

describe('transitionClaimStatusInTransaction event atomicity', () => {
  it('commits status, history, and domain events for a successful transition', async () => {
    const state = initialState();

    await expect(runTransaction(state)).resolves.toMatchObject({ success: true });

    expect(state.status).toBe('negotiation');
    expect(state.lifecycleVersion).toBe(7);
    expect(state.histories).toHaveLength(1);
    expect(state.histories[0]).toEqual(
      expect.objectContaining({ isPublic: false, note: 'member-visible status note' })
    );
    expect(state.events).toEqual([
      expect.objectContaining({
        aggregateVersion: 7,
        entityType: 'claim',
        eventName: 'claim.status_changed',
        payload: { fromStatus: 'evaluation', toStatus: 'negotiation' },
      }),
      expect.objectContaining({
        entityType: 'case',
        eventName: 'case.lifecycle_changed',
        payload: {
          fromState: 'evaluation',
          fromStatus: 'evaluation',
          toState: 'recovery',
          toStatus: 'negotiation',
        },
      }),
      expect.objectContaining({
        entityType: 'recovery',
        eventName: 'recovery.lifecycle_changed',
        payload: {
          fromState: 'not_started',
          fromStatus: 'evaluation',
          toState: 'negotiation',
          toStatus: 'negotiation',
        },
      }),
    ]);
    for (const event of state.events) {
      expect(event).toEqual(expect.objectContaining({ actorId: 'staff-1', tenantId: 'tenant-1' }));
      expect(event.payload).not.toHaveProperty('note');
    }
  });

  it('rolls back status and history when event append fails', async () => {
    const state = initialState();

    await expect(runTransaction(state, 'event')).rejects.toThrow('event failed');

    expect(state).toEqual({ events: [], histories: [], lifecycleVersion: 6, status: 'evaluation' });
  });

  it('does not commit status or event when history insert fails', async () => {
    const state = initialState();

    await expect(runTransaction(state, 'history')).rejects.toThrow('history failed');

    expect(state).toEqual({ events: [], histories: [], lifecycleVersion: 6, status: 'evaluation' });
  });
});
