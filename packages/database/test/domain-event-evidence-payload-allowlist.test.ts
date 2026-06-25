import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent } from '../src/domain-events';
import { makeEventTx } from './domain-event-test-utils';

function makeEvent(overrides: Partial<Parameters<typeof appendEvent>[1]> = {}) {
  return {
    actor: { id: 'staff-1', role: 'staff' },
    aggregateVersion: 7,
    correlationId: 'corr-1',
    entity: { id: 'claim-1', type: 'claim' },
    eventName: 'claim.status_changed',
    eventVersion: 1,
    id: 'event-1',
    payload: { fromStatus: 'evaluation', toStatus: 'negotiation' },
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('appendEvent transition evidence payload allowlist', () => {
  it('allows evidence ids and counts without raw evidence content', async () => {
    const { capture, tx } = makeEventTx();

    await appendEvent(
      tx,
      makeEvent({
        payload: {
          evidenceCount: 2,
          evidenceIds: ['assignment-1', 'consent-1'],
          fromStatus: 'evaluation',
          toStatus: 'submitted_to_airline',
        },
      })
    );

    assert.deepEqual(capture.row?.payload, {
      evidenceCount: 2,
      evidenceIds: ['assignment-1', 'consent-1'],
      fromStatus: 'evaluation',
      toStatus: 'submitted_to_airline',
    });
  });

  it('rejects mismatched evidence count references before inserting', async () => {
    const { capture, tx } = makeEventTx();

    await assert.rejects(
      () =>
        appendEvent(
          tx,
          makeEvent({
            payload: {
              evidenceCount: 3,
              evidenceIds: ['assignment-1', 'consent-1'],
              fromStatus: 'evaluation',
              toStatus: 'submitted_to_airline',
            },
          })
        ),
      /evidenceCount to match payload\.evidenceIds/
    );
    assert.equal(capture.row, undefined);
  });
});
