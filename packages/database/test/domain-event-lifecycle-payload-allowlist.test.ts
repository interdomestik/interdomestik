import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent } from '../src/domain-events';
import { makeEventTx } from './domain-event-test-utils';

function makeLifecycleEvent(overrides: Partial<Parameters<typeof appendEvent>[1]> = {}) {
  return {
    actor: { id: 'staff-1', role: 'staff' },
    aggregateVersion: 7,
    correlationId: 'corr-1',
    entity: { id: 'claim-1', type: 'case' },
    eventName: 'case.lifecycle_changed',
    eventVersion: 1,
    id: 'event-1',
    payload: {
      fromState: 'evaluation',
      fromStatus: 'evaluation',
      toState: 'recovery',
      toStatus: 'negotiation',
    },
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('appendEvent lifecycle payload allowlist', () => {
  it('rejects extra case lifecycle fields before inserting', async () => {
    const { capture, tx } = makeEventTx();
    await assert.rejects(
      () =>
        appendEvent(
          tx,
          makeLifecycleEvent({
            payload: {
              fromState: 'evaluation',
              fromStatus: 'evaluation',
              memberEmail: 'member@example.invalid',
              toState: 'recovery',
              toStatus: 'negotiation',
            },
          })
        ),
      /memberEmail is not allowlisted/
    );
    assert.equal(capture.row, undefined);
  });

  it('rejects invalid recovery lifecycle states before inserting', async () => {
    const { capture, tx } = makeEventTx();
    await assert.rejects(
      () =>
        appendEvent(
          tx,
          makeLifecycleEvent({
            entity: { id: 'claim-1', type: 'recovery' },
            eventName: 'recovery.lifecycle_changed',
            payload: {
              fromState: 'evaluation',
              fromStatus: 'evaluation',
              toState: 'recovery',
              toStatus: 'negotiation',
            },
          })
        ),
      /payload\.fromState to be a recovery lifecycle state/
    );
    assert.equal(capture.row, undefined);
  });

  it('allows sanitized case lifecycle event payload fields', async () => {
    const { capture, tx } = makeEventTx();
    await appendEvent(tx, makeLifecycleEvent());
    assert.deepEqual(capture.row?.payload, {
      fromState: 'evaluation',
      fromStatus: 'evaluation',
      toState: 'recovery',
      toStatus: 'negotiation',
    });
  });
});
