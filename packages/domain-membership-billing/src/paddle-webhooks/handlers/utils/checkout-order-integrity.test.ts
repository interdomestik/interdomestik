import { describe, expect, it } from 'vitest';

import { validateCheckoutOrderIntegrity } from './checkout-order-integrity';

const CUSTOMER_ID = 'ctm_01hrffh7gvp29kc7xahm8wddwa';

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    transactionId: 'txn_1',
    customerId: CUSTOMER_ID,
    currencyCode: 'EUR',
    items: [{ price: { id: 'pri_membership' }, quantity: 1 }],
    ...overrides,
  };
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'txn_1',
    status: 'completed',
    subscriptionId: 'sub_1',
    customerId: CUSTOMER_ID,
    currencyCode: 'EUR',
    details: {
      totals: { total: '2000', currencyCode: 'EUR' },
      lineItems: [
        {
          priceId: 'pri_membership',
          quantity: 1,
          totals: { total: '2000' },
        },
      ],
    },
    ...overrides,
  };
}

describe('validateCheckoutOrderIntegrity', () => {
  it('accepts one completed provider order with matching identity, amount, currency, and items', () => {
    expect(validateCheckoutOrderIntegrity(subscription(), transaction())).toEqual({
      ok: true,
      authority: {
        amount: '2000',
        currencyCode: 'EUR',
        customerId: CUSTOMER_ID,
        transactionId: 'txn_1',
      },
    });
  });

  it('accepts the raw snake-case Paddle payload shape', () => {
    expect(
      validateCheckoutOrderIntegrity(
        subscription({
          transactionId: undefined,
          transaction_id: 'txn_1',
          customerId: undefined,
          customer_id: CUSTOMER_ID,
          currencyCode: undefined,
          currency_code: 'eur',
          items: [{ price: { id: 'pri_membership' }, quantity: 1 }],
        }),
        transaction({
          subscriptionId: undefined,
          subscription_id: 'sub_1',
          customerId: undefined,
          customer_id: CUSTOMER_ID,
          currencyCode: undefined,
          currency_code: 'EUR',
          details: {
            totals: { total: '2000', currency_code: 'EUR' },
            line_items: [
              {
                price_id: 'pri_membership',
                quantity: 1,
                totals: { total: '2000' },
              },
            ],
          },
        })
      )
    ).toMatchObject({ ok: true });
  });

  it('compares opaque item identifiers by exact code units when collation treats them as equal', () => {
    const composedPriceId = 'pri_caf\u00e9';
    const decomposedPriceId = 'pri_cafe\u0301';

    expect(
      validateCheckoutOrderIntegrity(
        subscription({
          items: [
            { price: { id: composedPriceId }, quantity: 1 },
            { price: { id: decomposedPriceId }, quantity: 1 },
          ],
        }),
        transaction({
          details: {
            totals: { total: '2000', currencyCode: 'EUR' },
            lineItems: [
              { priceId: decomposedPriceId, quantity: 1, totals: { total: '1000' } },
              { priceId: composedPriceId, quantity: 1, totals: { total: '1000' } },
            ],
          },
        })
      )
    ).toMatchObject({ ok: true });
  });

  it.each([
    [
      'missing transaction identity',
      subscription({ transactionId: undefined }),
      transaction(),
      'missing_transaction_id',
    ],
    [
      'different transaction identity',
      subscription(),
      transaction({ id: 'txn_other' }),
      'transaction_mismatch',
    ],
    [
      'non-completed transaction',
      subscription(),
      transaction({ status: 'paid' }),
      'transaction_not_completed',
    ],
    [
      'different subscription',
      subscription(),
      transaction({ subscriptionId: 'sub_other' }),
      'subscription_mismatch',
    ],
    [
      'different customer',
      subscription(),
      transaction({ customerId: 'ctm_01hrffh7gvp29kc7xahm8wddwb' }),
      'customer_mismatch',
    ],
    [
      'different currency',
      subscription(),
      transaction({ currencyCode: 'USD' }),
      'currency_mismatch',
    ],
    [
      'different order item',
      subscription(),
      transaction({
        details: {
          totals: { total: '2000', currencyCode: 'EUR' },
          lineItems: [{ priceId: 'pri_other', quantity: 1, totals: { total: '2000' } }],
        },
      }),
      'order_mismatch',
    ],
    [
      'inconsistent calculated amount',
      subscription(),
      transaction({
        details: {
          totals: { total: '2000', currencyCode: 'EUR' },
          lineItems: [{ priceId: 'pri_membership', quantity: 1, totals: { total: '1999' } }],
        },
      }),
      'amount_mismatch',
    ],
  ])('rejects %s', (_label, sub, tx, reason) => {
    expect(validateCheckoutOrderIntegrity(sub, tx)).toEqual({ ok: false, reason });
  });
});
