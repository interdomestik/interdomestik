import { describe, expect, it, vi } from 'vitest';

import { createPaddleSuccessFeeTransaction } from './paddle-success-fee-charge';
import {
  paddleMock,
  paymentMethodSnapshot,
  SUCCESS_FEE_IDEMPOTENCY_KEY,
} from './paddle-success-fee-test-helpers';

describe('createPaddleSuccessFeeTransaction edge cases', () => {
  it('rounds decimal amounts without floating point drift', async () => {
    const createOneTimeCharge = vi.fn().mockResolvedValue({ id: 'sub_123' });

    await createPaddleSuccessFeeTransaction({
      idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY,
      paddle: paddleMock({ createOneTimeCharge }),
      snapshot: paymentMethodSnapshot({ feeAmount: '2.675' }),
    });

    expect(createOneTimeCharge).toHaveBeenCalledWith(
      'sub_123',
      expect.objectContaining({
        items: [
          expect.objectContaining({
            price: expect.objectContaining({
              unitPrice: { amount: '268', currencyCode: 'EUR' },
            }),
          }),
        ],
      })
    );
  });

  it('rejects missing Paddle transaction ids', async () => {
    await expect(
      createPaddleSuccessFeeTransaction({
        idempotencyKey: 'key-1',
        paddle: paddleMock({ create: vi.fn().mockResolvedValue({}) }),
        snapshot: paymentMethodSnapshot({
          collectionMethod: 'invoice',
          invoiceDueAt: new Date('2026-07-01'),
        }),
      })
    ).rejects.toThrow(/requires a Paddle transaction id/);
  });

  it('does not reuse an idempotency match from another tenant', async () => {
    const createOneTimeCharge = vi.fn().mockResolvedValue({ id: 'sub_123' });

    await expect(
      createPaddleSuccessFeeTransaction({
        idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY,
        paddle: paddleMock({
          createOneTimeCharge,
          rows: [
            {
              customData: { idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY, tenantId: 'other' },
              id: 'txn_other_tenant',
            },
          ],
        }),
        snapshot: paymentMethodSnapshot(),
      })
    ).resolves.toEqual({
      providerSubscriptionId: 'sub_123',
      status: 'paddle_subscription_charge_created',
    });
    expect(createOneTimeCharge).toHaveBeenCalledTimes(1);
  });

  it('reuses a one-time charge transaction by price idempotency metadata', async () => {
    await expect(
      createPaddleSuccessFeeTransaction({
        idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY,
        paddle: paddleMock({
          createOneTimeCharge: vi.fn(),
          rows: [
            {
              id: 'txn_existing_charge',
              items: [
                {
                  price: {
                    customData: {
                      idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY,
                      tenantId: 'tenant_ks',
                    },
                  },
                },
              ],
            },
          ],
        }),
        snapshot: paymentMethodSnapshot(),
      })
    ).resolves.toEqual({
      providerTransactionId: 'txn_existing_charge',
      status: 'paddle_transaction_reused',
    });
  });

  it('reuses a later iterable transaction from Paddle list pagination', async () => {
    const rows = Array.from({ length: 55 }, (_, index) => ({
      customData: { idempotencyKey: `old-${index}`, tenantId: 'tenant_ks' },
      id: `txn_${index}`,
    }));
    rows.push({
      customData: { idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY, tenantId: 'tenant_ks' },
      id: 'txn_existing',
    });

    await expect(
      createPaddleSuccessFeeTransaction({
        idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY,
        paddle: paddleMock({ create: vi.fn(), rows }),
        snapshot: paymentMethodSnapshot(),
      })
    ).resolves.toEqual({
      providerTransactionId: 'txn_existing',
      status: 'paddle_transaction_reused',
    });
  });

  it('uses manual collection mode for invoice billing', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'txn_invoice' });

    await createPaddleSuccessFeeTransaction({
      idempotencyKey: 'key-1',
      paddle: paddleMock({ create }),
      snapshot: paymentMethodSnapshot({
        collectionMethod: 'invoice',
        invoiceDueAt: new Date('2026-07-01'),
      }),
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ collectionMode: 'manual', status: 'billed' })
    );
  });

  it('rejects pending payment method charges before calling Paddle create', async () => {
    await expect(
      createPaddleSuccessFeeTransaction({
        idempotencyKey: 'key-1',
        paddle: paddleMock(),
        snapshot: paymentMethodSnapshot({ paymentAuthorizationState: 'pending' }),
      })
    ).rejects.toThrow(/requires authorized payment collection/);
  });
});
