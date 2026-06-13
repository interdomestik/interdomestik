import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent } from '../src/domain-events';
import { makeEventTx } from './domain-event-test-utils';

function makeEscalationEvent(overrides: Partial<Parameters<typeof appendEvent>[1]> = {}) {
  return {
    actor: { id: 'staff-1', role: 'staff' },
    aggregateVersion: 0,
    correlationId: 'corr-1',
    entity: { id: 'claim-1', type: 'claim' },
    eventName: 'recovery.escalation_agreement_recorded',
    eventVersion: 1,
    id: 'event-1',
    payload: {
      decisionNextStatus: 'negotiation',
      feePercentage: 15,
      hasDecisionReason: true,
      hasLegalActionCap: true,
      hasMinimumFee: true,
      paymentAuthorizationState: 'authorized',
    },
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('appendEvent escalation agreement payload allowlist', () => {
  for (const [name, payload, error] of [
    [
      'decision reason text',
      { decisionReason: 'Member accepted specific terms.' },
      /decisionReason is not allowlisted/,
    ],
    ['minimum fee amount', { minimumFee: '25.00' }, /minimumFee is not allowlisted/],
    ['terms version', { termsVersion: '2026-03-v1' }, /termsVersion is not allowlisted/],
    ['member id', { memberId: 'member-1' }, /memberId is not allowlisted/],
  ] as const) {
    it(`rejects ${name} before inserting`, async () => {
      const { capture, tx } = makeEventTx();

      await assert.rejects(
        () =>
          appendEvent(
            tx,
            makeEscalationEvent({ payload: { ...makeEscalationEvent().payload, ...payload } })
          ),
        error
      );
      assert.equal(capture.row, undefined);
    });
  }

  it('allows only sanitized escalation agreement fields', async () => {
    const { capture, tx } = makeEventTx();

    await appendEvent(tx, makeEscalationEvent());

    assert.deepEqual(capture.row?.payload, {
      decisionNextStatus: 'negotiation',
      feePercentage: 15,
      hasDecisionReason: true,
      hasLegalActionCap: true,
      hasMinimumFee: true,
      paymentAuthorizationState: 'authorized',
    });
  });

  it('rejects invalid escalation statuses and payment states', async () => {
    const { tx } = makeEventTx();

    await assert.rejects(
      () =>
        appendEvent(
          tx,
          makeEscalationEvent({
            payload: { ...makeEscalationEvent().payload, decisionNextStatus: 'settlement' },
          })
        ),
      /decisionNextStatus/
    );
    await assert.rejects(
      () =>
        appendEvent(
          tx,
          makeEscalationEvent({
            payload: { ...makeEscalationEvent().payload, paymentAuthorizationState: 'paid' },
          })
        ),
      /paymentAuthorizationState/
    );
  });
});
