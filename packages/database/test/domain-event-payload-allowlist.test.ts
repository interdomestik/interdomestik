import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent, type DomainEventTx } from '../src/domain-events';

type InsertedRow = Record<string, unknown>;

class FakeInsertStep {
  constructor(private readonly capture: { row?: InsertedRow }) {}

  values(row: InsertedRow) {
    this.capture.row = row;
    return { returning: () => [{ id: row.id }] };
  }
}

class FakeTx {
  constructor(private readonly capture: { row?: InsertedRow }) {}

  insert() {
    return new FakeInsertStep(this.capture);
  }
}

function makeTx() {
  const capture: { row?: InsertedRow } = {};
  return { capture, tx: new FakeTx(capture) as unknown as DomainEventTx };
}

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

describe('appendEvent payload allowlist', () => {
  it('rejects extra claim.status_changed payload fields before inserting', async () => {
    const { capture, tx } = makeTx();

    await assert.rejects(
      () =>
        appendEvent(
          tx,
          makeEvent({
            payload: {
              fromStatus: 'evaluation',
              memberEmail: 'member@example.invalid',
              toStatus: 'negotiation',
            },
          })
        ),
      /memberEmail is not allowlisted/
    );
    assert.equal(capture.row, undefined);
  });

  it('rejects unsupported event names before inserting', async () => {
    const { capture, tx } = makeTx();

    await assert.rejects(
      () => appendEvent(tx, makeEvent({ eventName: 'claim.note_added' })),
      /allowlist missing for claim\.note_added@1/
    );
    assert.equal(capture.row, undefined);
  });

  it('rejects unsupported event versions before inserting', async () => {
    const { capture, tx } = makeTx();

    await assert.rejects(
      () => appendEvent(tx, makeEvent({ eventVersion: 2 })),
      /allowlist missing for claim\.status_changed@2/
    );
    assert.equal(capture.row, undefined);
  });

  it('rejects missing required allowlisted fields before inserting', async () => {
    const { capture, tx } = makeTx();

    await assert.rejects(
      () => appendEvent(tx, makeEvent({ payload: { fromStatus: 'evaluation' } })),
      /requires payload\.toStatus/
    );
    assert.equal(capture.row, undefined);
  });

  it('rejects non-status values for allowed status fields before inserting', async () => {
    const { capture, tx } = makeTx();

    await assert.rejects(
      () =>
        appendEvent(
          tx,
          makeEvent({ payload: { fromStatus: 'evaluation', toStatus: 'Ada Lovelace' } })
        ),
      /payload\.toStatus to be a claim status/
    );
    assert.equal(capture.row, undefined);
  });

  it('inserts a sanitized plain payload instead of caller serialization hooks', async () => {
    const { capture, tx } = makeTx();
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
});
