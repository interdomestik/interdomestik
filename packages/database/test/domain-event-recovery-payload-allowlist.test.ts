import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent, type DomainEventTx } from '../src/domain-events';

class FakeInsertStep {
  constructor(private readonly capture: { row?: Record<string, unknown> }) {}

  values(row: Record<string, unknown>) {
    this.capture.row = row;
    return { returning: () => [{ id: row.id }] };
  }
}

class FakeTx {
  constructor(private readonly capture: { row?: Record<string, unknown> }) {}

  insert() {
    return new FakeInsertStep(this.capture);
  }
}

function makeTx() {
  const capture: { row?: Record<string, unknown> } = {};
  return { capture, tx: new FakeTx(capture) as unknown as DomainEventTx };
}

function makeRecoveryDecisionEvent(overrides: Partial<Parameters<typeof appendEvent>[1]> = {}) {
  return {
    actor: { id: 'staff-1', role: 'staff' },
    aggregateVersion: 0,
    correlationId: 'corr-1',
    entity: { id: 'claim-1', type: 'claim' },
    eventName: 'recovery.decision_recorded',
    eventVersion: 1,
    id: 'event-1',
    payload: {
      decisionType: 'declined',
      declineReasonCode: 'insufficient_evidence',
      hasExplanation: true,
    },
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('appendEvent recovery decision payload allowlist', () => {
  for (const [name, event, error] of [
    [
      'free-text recovery decision fields',
      makeRecoveryDecisionEvent({
        payload: {
          decisionType: 'declined',
          declineReasonCode: 'insufficient_evidence',
          explanation: 'Free-text staff explanation',
          hasExplanation: true,
        },
      }),
      /explanation is not allowlisted/,
    ],
    [
      'unsupported recovery decision values',
      makeRecoveryDecisionEvent({ payload: { decisionType: 'maybe', hasExplanation: false } }),
      /payload\.decisionType to be a recovery decision type/,
    ],
    [
      'missing recovery decline reason',
      makeRecoveryDecisionEvent({ payload: { decisionType: 'declined', hasExplanation: true } }),
      /payload\.declineReasonCode/,
    ],
    [
      'unsupported recovery decline reason',
      makeRecoveryDecisionEvent({
        payload: {
          decisionType: 'declined',
          declineReasonCode: 'customer_name',
          hasExplanation: true,
        },
      }),
      /payload\.declineReasonCode to be a recovery decline code/,
    ],
  ] as const) {
    it(`rejects ${name} before inserting`, async () => {
      const { capture, tx } = makeTx();
      await assert.rejects(() => appendEvent(tx, event), error);
      assert.equal(capture.row, undefined);
    });
  }

  it('allows sanitized accepted recovery decision payload fields', async () => {
    const { capture, tx } = makeTx();
    await appendEvent(
      tx,
      makeRecoveryDecisionEvent({
        payload: {
          decisionType: 'accepted',
          declineReasonCode: 'insufficient_evidence',
          hasExplanation: false,
        },
      })
    );
    assert.deepEqual(capture.row?.payload, {
      decisionType: 'accepted',
      hasExplanation: false,
    });
  });

  it('allows sanitized declined recovery decision payload fields', async () => {
    const { capture, tx } = makeTx();
    await appendEvent(tx, makeRecoveryDecisionEvent());
    assert.deepEqual(capture.row?.payload, {
      decisionType: 'declined',
      declineReasonCode: 'insufficient_evidence',
      hasExplanation: true,
    });
  });
});
