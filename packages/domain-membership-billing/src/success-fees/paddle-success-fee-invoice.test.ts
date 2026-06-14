import { describe, expect, it, vi } from 'vitest';

import { createPaddleSuccessFeeTransaction } from './paddle-success-fee-charge';
import {
  invoiceSnapshot,
  paddleMock,
  SUCCESS_FEE_IDEMPOTENCY_KEY,
} from './paddle-success-fee-test-helpers';

describe('createPaddleSuccessFeeTransaction invoice fallback', () => {
  it('creates a manual Paddle transaction without a stored customer', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'txn_invoice' });
    const paddle = paddleMock({ create });

    await expect(
      createPaddleSuccessFeeTransaction({
        idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY,
        now: new Date('2026-06-21T00:00:00Z'),
        paddle,
        snapshot: invoiceSnapshot(),
      })
    ).resolves.toEqual({
      providerTransactionId: 'txn_invoice',
      status: 'paddle_invoice_billed',
    });
    expect(paddle.transactions.list).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: '-created_at', perPage: 50 })
    );
    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({ customerId: expect.anything() })
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        billingDetails: { paymentTerms: { frequency: 10, interval: 'day' } },
        collectionMode: 'manual',
        status: 'billed',
      })
    );
  });

  it('reuses a customerless invoice transaction by tenant-scoped idempotency metadata', async () => {
    const paddle = paddleMock({
      create: vi.fn(),
      rows: [
        {
          customData: { idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY, tenantId: 'tenant_ks' },
          id: 'txn_existing',
        },
      ],
    });

    await expect(
      createPaddleSuccessFeeTransaction({
        idempotencyKey: SUCCESS_FEE_IDEMPOTENCY_KEY,
        paddle,
        snapshot: invoiceSnapshot(),
      })
    ).resolves.toEqual({
      providerTransactionId: 'txn_existing',
      status: 'paddle_transaction_reused',
    });
    expect(paddle.transactions.create).not.toHaveBeenCalled();
  });
});
