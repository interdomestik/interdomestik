import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock('@interdomestik/database', () => ({
  db: { query: { webhookEvents: { findFirst: hoisted.findFirst } } },
}));

import { RetryablePaddleWebhookError } from '../../errors';
import { isValidPaddleCustomerEmail } from './checkout-transaction-authority';
import { resolveCheckoutTransactionEvidence } from './checkout-transaction-evidence';

const CUSTOMER_ID = 'ctm_01hrffh7gvp29kc7xahm8wddwa';

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    customerId: CUSTOMER_ID,
    transactionId: 'txn_1',
    customData: { tenantId: 'tenant_mk' },
    ...overrides,
  };
}

function storedTransaction(
  overrides: Record<string, unknown> = {},
  processingResult: 'ok' | 'error' | 'retryable_error' | null = 'ok'
) {
  return {
    processingResult,
    payload: {
      data: {
        customerId: CUSTOMER_ID,
        customData: { tenantId: 'tenant_mk' },
        ...overrides,
      },
    },
  };
}

describe('resolveCheckoutTransactionEvidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a long dot-rich value without backtracking email validation', () => {
    const invalidEmail = `buyer@${'segment.'.repeat(16_384)} `;
    expect(isValidPaddleCustomerEmail(invalidEmail)).toBe(false);
  });

  it('defers a valid entity event before writes while its verified transaction is absent', async () => {
    hoisted.findFirst.mockResolvedValue(null);

    await expect(
      resolveCheckoutTransactionEvidence(subscription(), 'entity:mk')
    ).rejects.toBeInstanceOf(RetryablePaddleWebhookError);

    const query = hoisted.findFirst.mock.calls[0]?.[0] as {
      where: (
        events: Record<string, string>,
        operators: {
          and: (...conditions: unknown[]) => unknown;
          eq: (left: unknown, right: unknown) => unknown;
        }
      ) => unknown;
    };
    const and = vi.fn((...conditions: unknown[]) => conditions);
    const eq = vi.fn((left: unknown, right: unknown) => ({ left, right }));
    query.where(
      {
        providerTransactionId: 'provider_transaction_id',
        provider: 'provider',
        signatureValid: 'signature_valid',
        eventType: 'event_type',
        processingScopeKey: 'processing_scope_key',
      },
      { and, eq }
    );

    expect(eq).toHaveBeenCalledWith('provider_transaction_id', 'txn_1');
    expect(eq).toHaveBeenCalledWith('provider', 'paddle');
    expect(eq).toHaveBeenCalledWith('signature_valid', true);
    expect(eq).toHaveBeenCalledWith('event_type', 'transaction.completed');
    expect(eq).toHaveBeenCalledWith('processing_scope_key', 'entity:mk');
    expect(query).toMatchObject({ columns: { payload: true, processingResult: true } });
  });

  it.each([
    ['in-flight', null],
    ['retryable transaction failure', 'retryable_error'],
  ] as const)('defers while exact transaction evidence is %s', async (_label, result) => {
    hoisted.findFirst.mockResolvedValue(storedTransaction({}, result));

    await expect(
      resolveCheckoutTransactionEvidence(subscription(), 'entity:mk')
    ).rejects.toBeInstanceOf(RetryablePaddleWebhookError);
  });

  it('treats an exact permanently failed transaction receipt as permanent', async () => {
    const resolvePaddleCustomer = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hoisted.findFirst.mockResolvedValue(storedTransaction({}, 'error'));

    await expect(
      resolveCheckoutTransactionEvidence(subscription(), 'entity:mk', resolvePaddleCustomer)
    ).resolves.toBeNull();
    expect(resolvePaddleCustomer).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('preserves generic missing-transaction behavior', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hoisted.findFirst.mockResolvedValue(null);

    await expect(resolveCheckoutTransactionEvidence(subscription(), 'global')).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('transaction'));
    warnSpy.mockRestore();
  });

  it.each([
    ['missing tenant', subscription({ customData: undefined })],
    ['wrong entity', subscription({ customData: { tenantId: 'tenant_ks' } })],
    ['missing customer', subscription({ customerId: undefined })],
    ['invalid customer', subscription({ customerId: 'ctm_invalid' })],
  ])('fails closed for %s before transaction lookup', async (_label, payload) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(resolveCheckoutTransactionEvidence(payload, 'entity:mk')).resolves.toBeNull();
    expect(hoisted.findFirst).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('treats malformed stored payload and custom-data conflict as permanent', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hoisted.findFirst.mockResolvedValueOnce({
      processingResult: 'ok',
      payload: { unexpected: true },
    });
    await expect(
      resolveCheckoutTransactionEvidence(subscription(), 'entity:mk')
    ).resolves.toBeNull();

    hoisted.findFirst.mockResolvedValueOnce(
      storedTransaction({ customData: { tenantId: 'tenant_ks' } })
    );
    await expect(
      resolveCheckoutTransactionEvidence(subscription(), 'entity:mk')
    ).resolves.toBeNull();
    warnSpy.mockRestore();
  });

  it('returns only the active matching provider customer email', async () => {
    hoisted.findFirst.mockResolvedValue(
      storedTransaction({ customerEmail: 'unsupported-payload@example.com' })
    );
    const resolvePaddleCustomer = vi.fn().mockResolvedValue({
      kind: 'resolved',
      customer: { id: CUSTOMER_ID, email: 'Provider@Example.com', status: 'active' },
    });

    await expect(
      resolveCheckoutTransactionEvidence(subscription(), 'entity:mk', resolvePaddleCustomer)
    ).resolves.toEqual({
      customerEmail: 'provider@example.com',
      customData: { tenantId: 'tenant_mk' },
    });
    expect(resolvePaddleCustomer).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it('keeps transient customer lookup failure retryable', async () => {
    hoisted.findFirst.mockResolvedValue(storedTransaction());

    await expect(
      resolveCheckoutTransactionEvidence(subscription(), 'entity:mk', async () => ({
        kind: 'failed',
        retryable: true,
      }))
    ).rejects.toBeInstanceOf(RetryablePaddleWebhookError);
  });

  it.each([
    ['permanent lookup failure', { kind: 'failed', retryable: false }],
    [
      'archived customer',
      {
        kind: 'resolved',
        customer: { id: CUSTOMER_ID, email: 'archived@example.com', status: 'archived' },
      },
    ],
    [
      'mismatched customer',
      {
        kind: 'resolved',
        customer: {
          id: 'ctm_01hrffh7gvp29kc7xahm8wddwb',
          email: 'other@example.com',
          status: 'active',
        },
      },
    ],
  ])('rejects %s permanently', async (_label, lookup) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hoisted.findFirst.mockResolvedValue(storedTransaction());

    await expect(
      resolveCheckoutTransactionEvidence(subscription(), 'entity:mk', async () => lookup as never)
    ).resolves.toBeNull();
    warnSpy.mockRestore();
  });

  it('rejects a transaction customer mismatch before provider lookup', async () => {
    const resolvePaddleCustomer = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hoisted.findFirst.mockResolvedValue(
      storedTransaction({ customerId: 'ctm_01hrffh7gvp29kc7xahm8wddwb' })
    );

    await expect(
      resolveCheckoutTransactionEvidence(subscription(), 'entity:mk', resolvePaddleCustomer)
    ).resolves.toBeNull();
    expect(resolvePaddleCustomer).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
