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

function makeCaseCreatedEvent(overrides: Partial<Parameters<typeof appendEvent>[1]> = {}) {
  return makeEvent({
    actor: { id: 'member-1', role: 'member' },
    aggregateVersion: 1,
    entity: { id: 'claim-1', type: 'case' },
    eventName: 'case.created',
    payload: {
      hasDocuments: true,
      initialStatus: 'submitted',
    },
    ...overrides,
  });
}

describe('appendEvent payload allowlist', () => {
  for (const [name, event, error] of [
    [
      'extra claim.status_changed fields',
      makeEvent({
        payload: {
          fromStatus: 'evaluation',
          memberEmail: 'member@example.invalid',
          toStatus: 'negotiation',
        },
      }),
      /memberEmail is not allowlisted/,
    ],
    [
      'unsupported event names',
      makeEvent({ eventName: 'claim.note_added' }),
      /claim\.note_added@1/,
    ],
    ['unsupported versions', makeEvent({ eventVersion: 2 }), /claim\.status_changed@2/],
    ['missing required fields', makeEvent({ payload: { fromStatus: 'evaluation' } }), /toStatus/],
    [
      'non-status values',
      makeEvent({ payload: { fromStatus: 'evaluation', toStatus: 'Ada Lovelace' } }),
      /payload\.toStatus to be a claim status/,
    ],
    [
      'extra case.created fields',
      makeCaseCreatedEvent({
        payload: {
          companyName: 'Airline Co',
          hasDocuments: true,
          initialStatus: 'submitted',
        },
      }),
      /companyName is not allowlisted/,
    ],
  ] as const) {
    it(`rejects ${name} before inserting`, async () => {
      const { capture, tx } = makeEventTx();

      await assert.rejects(() => appendEvent(tx, event), error);
      assert.equal(capture.row, undefined);
    });
  }

  it('inserts a sanitized plain payload instead of caller serialization hooks', async () => {
    const { capture, tx } = makeEventTx();
    const payloadWithSerializationHook = Object.assign(
      Object.create({
        toJSON: () => ({ fromStatus: 'evaluation', memberEmail: 'member@example.invalid' }),
      }),
      {
        fromStatus: 'evaluation',
        toStatus: 'negotiation',
      }
    );

    await appendEvent(tx, makeEvent({ payload: payloadWithSerializationHook }));

    assert.deepEqual(capture.row?.payload, { fromStatus: 'evaluation', toStatus: 'negotiation' });
  });

  it('allows sanitized case.created payload fields', async () => {
    const { capture, tx } = makeEventTx();

    await appendEvent(tx, makeCaseCreatedEvent());

    assert.deepEqual(capture.row?.payload, {
      hasDocuments: true,
      initialStatus: 'submitted',
    });
  });
});
