import { describe, expect, it, vi } from 'vitest';
import {
  getPaymentUpdateUrlCore,
  hoisted,
  TRUSTED_LINK,
  TRANSACTION_ID,
  VALID_SUB,
  VALID_TRANSACTION,
  session,
  setupPaymentUpdateUrlHarness,
} from './__tests__/get-payment-update-url-harness';

const TRUSTED_ORIGIN = 'https://pay.ks.example.test';
const OTHER_ORIGIN = 'https://attacker.example.test';

describe('getPaymentUpdateUrlCore', () => {
  setupPaymentUpdateUrlHarness();

  it('denies when the provider transaction targets a different subscription', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      subscriptionId: 'sub_' + 'z'.repeat(26),
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({
      error: 'Payment update transaction did not match this subscription',
      url: undefined,
    });
  });

  it('denies when the provider transaction targets a different customer', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      customerId: 'ctm_' + 'y'.repeat(26),
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({
      error: 'Payment update transaction did not match this member',
      url: undefined,
    });
  });

  it('denies when the transaction is not on automatic collection', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      collectionMode: 'manual',
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({
      error: 'Payment update is only available for automatic billing',
      url: undefined,
    });
  });

  it.each(['draft', 'ready', 'billed', 'paid', 'completed', 'canceled', '', null])(
    'denies transactions in a non-recoverable status (%s)',
    async status => {
      hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
      hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
        ...VALID_TRANSACTION,
        status,
      });

      const result = await getPaymentUpdateUrlCore({
        session,
        subscriptionId: VALID_SUB.id,
      });

      expect(result).toEqual({
        error: 'Payment update transaction is not in a usable state',
        url: undefined,
      });
    }
  );

  it('rejects a provider-returned transaction id that is not a valid Paddle id', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      id: 'not-a-real-txn-id',
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a checkout url on an untrusted origin', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: { url: `${OTHER_ORIGIN}/checkout/default?_ptxn=${TRANSACTION_ID}` },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a checkout url on the trusted origin but the wrong path', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: { url: `${TRUSTED_ORIGIN}/attacker/redirect?_ptxn=${TRANSACTION_ID}` },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a checkout url whose _ptxn does not match the verified transaction id', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: { url: `${TRUSTED_LINK}?_ptxn=txn_${'d'.repeat(26)}` },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a checkout url with a duplicated _ptxn parameter', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: { url: `${TRUSTED_LINK}?_ptxn=${TRANSACTION_ID}&_ptxn=${TRANSACTION_ID}` },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });

  it('rejects a checkout url carrying an extra ambiguous query parameter', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(VALID_SUB);
    hoisted.paddle.subscriptions.getPaymentMethodChangeTransaction.mockResolvedValue({
      ...VALID_TRANSACTION,
      checkout: {
        url: `${TRUSTED_LINK}?_ptxn=${TRANSACTION_ID}&redirect=https://evil.example`,
      },
    });

    const result = await getPaymentUpdateUrlCore({
      session,
      subscriptionId: VALID_SUB.id,
    });

    expect(result).toEqual({ error: 'No checkout URL generated', url: undefined });
  });
});
