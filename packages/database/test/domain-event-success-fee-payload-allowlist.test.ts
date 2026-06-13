import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent } from '../src/domain-events';
import { makeEventTx } from './domain-event-test-utils';

function makeSuccessFeeEvent(overrides: Partial<Parameters<typeof appendEvent>[1]> = {}) {
  return {
    actor: { id: 'staff-1', role: 'staff' },
    aggregateVersion: 0,
    correlationId: 'corr-1',
    entity: { id: 'claim-1', type: 'claim' },
    eventName: 'recovery.success_fee_collected',
    eventVersion: 1,
    id: 'event-1',
    payload: {
      collectionMethod: 'deduction',
      currencyCode: 'EUR',
      deductionAllowed: true,
      hasInvoiceDueDate: false,
      hasStoredPaymentMethod: false,
      paymentAuthorizationState: 'authorized',
    },
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('appendEvent success-fee collection payload allowlist', () => {
  for (const [name, payload, error] of [
    ['recovered amount', { recoveredAmount: '100.00' }, /recoveredAmount is not allowlisted/],
    ['fee amount', { feeAmount: '25.00' }, /feeAmount is not allowlisted/],
    ['subscription id', { subscriptionId: 'sub-1' }, /subscriptionId is not allowlisted/],
    ['invoice due date', { invoiceDueAt: '2026-03-19' }, /invoiceDueAt is not allowlisted/],
  ] as const) {
    it(`rejects ${name} before inserting`, async () => {
      const { capture, tx } = makeEventTx();

      await assert.rejects(
        () =>
          appendEvent(
            tx,
            makeSuccessFeeEvent({
              payload: { ...makeSuccessFeeEvent().payload, ...payload },
            })
          ),
        error
      );
      assert.equal(capture.row, undefined);
    });
  }

  it('allows only sanitized success-fee collection fields', async () => {
    const { capture, tx } = makeEventTx();

    await appendEvent(tx, makeSuccessFeeEvent());

    assert.deepEqual(capture.row?.payload, {
      collectionMethod: 'deduction',
      currencyCode: 'EUR',
      deductionAllowed: true,
      hasInvoiceDueDate: false,
      hasStoredPaymentMethod: false,
      paymentAuthorizationState: 'authorized',
    });
  });

  it('rejects invalid collection, authorization, and currency values', async () => {
    const { tx } = makeEventTx();

    await assert.rejects(
      () =>
        appendEvent(
          tx,
          makeSuccessFeeEvent({
            payload: { ...makeSuccessFeeEvent().payload, collectionMethod: 'wire' },
          })
        ),
      /payload\.collectionMethod/
    );
    await assert.rejects(
      () =>
        appendEvent(
          tx,
          makeSuccessFeeEvent({
            payload: { ...makeSuccessFeeEvent().payload, paymentAuthorizationState: 'paid' },
          })
        ),
      /payload\.paymentAuthorizationState/
    );
    await assert.rejects(
      () =>
        appendEvent(
          tx,
          makeSuccessFeeEvent({
            payload: { ...makeSuccessFeeEvent().payload, currencyCode: 'eur' },
          })
        ),
      /payload\.currencyCode/
    );
  });
});
