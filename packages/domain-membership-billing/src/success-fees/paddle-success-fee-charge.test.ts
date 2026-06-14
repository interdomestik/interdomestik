import { describe, expect, it, vi } from 'vitest';

import { createPaddleSuccessFeeTransaction } from './paddle-success-fee-charge';
import {
  paddleMock,
  paymentMethodSnapshot,
  SUCCESS_FEE_IDEMPOTENCY_KEY,
} from './paddle-success-fee-test-helpers';

describe('createPaddleSuccessFeeTransaction', () => {
  it('creates a Paddle transaction with dynamic success-fee amount and idempotency metadata', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'txn_123' });
    const createOneTimeCharge = vi.fn().mockResolvedValue({ id: 'sub_123' });
    const paddle = paddleMock({ create, createOneTimeCharge });

    const result = await createPaddleSuccessFeeTransaction({
      idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY,
      paddle,
      snapshot: paymentMethodSnapshot(),
    });

    expect(result).toEqual({
      providerSubscriptionId: 'sub_123',
      status: 'paddle_subscription_charge_created',
    });
    expect(create).not.toHaveBeenCalled();
    expect(createOneTimeCharge).toHaveBeenCalledWith(
      'sub_123',
      expect.objectContaining({
        effectiveFrom: 'immediately',
        items: [
          expect.objectContaining({
            price: expect.objectContaining({
              customData: expect.objectContaining({
                claimId: 'claim-1',
                idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY,
                originSubscriptionId: 'sub_123',
                tenantId: 'tenant_ks',
              }),
              unitPrice: { amount: '1550', currencyCode: 'EUR' },
            }),
            quantity: 1,
          }),
        ],
        onPaymentFailure: 'prevent_change',
      })
    );
    expect(paddle.transactions.list).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: ['ctm_123'], perPage: 50 })
    );
  });

  it('reuses an existing Paddle transaction with the same idempotency key', async () => {
    const create = vi.fn();

    await expect(
      createPaddleSuccessFeeTransaction({
        idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY,
        paddle: paddleMock({
          create,
          rows: [
            {
              customData: {
                idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY,
                tenantId: 'tenant_ks',
              },
              id: 'txn_existing',
            },
          ],
        }),
        snapshot: paymentMethodSnapshot(),
      })
    ).resolves.toEqual({
      providerTransactionId: 'txn_existing',
      status: 'paddle_transaction_reused',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('does not call Paddle for deduction collection', async () => {
    const create = vi.fn();
    const createOneTimeCharge = vi.fn();

    await expect(
      createPaddleSuccessFeeTransaction({
        idempotencyKey: 'key-1',
        paddle: paddleMock({ create, createOneTimeCharge }),
        snapshot: paymentMethodSnapshot({ collectionMethod: 'deduction' }),
      })
    ).resolves.toEqual({ status: 'skipped_deduction' });
    expect(create).not.toHaveBeenCalled();
    expect(createOneTimeCharge).not.toHaveBeenCalled();
  });

  it('rejects without a Paddle customer so the event remains retryable', async () => {
    const create = vi.fn();

    await expect(
      createPaddleSuccessFeeTransaction({
        idempotencyKey: 'key-1',
        paddle: paddleMock({ create }),
        snapshot: paymentMethodSnapshot({ providerCustomerId: null }),
      })
    ).rejects.toThrow(/requires a Paddle customer/);
    expect(create).not.toHaveBeenCalled();
  });
});
