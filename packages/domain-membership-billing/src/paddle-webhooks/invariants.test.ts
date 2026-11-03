import { installInvariantsHooks } from './invariants.hooks.test-support';
import { hoisted } from './invariants.test-support';
import { describe, expect, it } from 'vitest';
import { TEST_PADDLE_DELIVERY } from './paddle-authority.test-support';
import { persistInvoiceAndLedgerInvariants } from './invariants';

describe('persistInvoiceAndLedgerInvariants', () => {
  installInvariantsHooks();

  it('skips non-transaction events', async () => {
    const result = await persistInvoiceAndLedgerInvariants({
      headers: new Headers(),
      delivery: TEST_PADDLE_DELIVERY,
      webhookEventRowId: 'we_1',
      eventType: 'subscription.updated',
      eventId: 'evt_1',
      tenantId: 'tenant_ks',
      providerTransactionId: 'tx_1',
      data: {},
    });

    expect(result).toEqual({
      applied: false,
      replayed: false,
      invoiceId: null,
      ledgerEntryId: null,
    });
    expect(hoisted.transaction).not.toHaveBeenCalled();
  });

  it('rejects transaction events without tenant scope', async () => {
    await expect(
      persistInvoiceAndLedgerInvariants({
        headers: new Headers(),
        delivery: TEST_PADDLE_DELIVERY,
        webhookEventRowId: 'we_1',
        eventType: 'transaction.completed',
        eventId: 'evt_1',
        tenantId: null,
        providerTransactionId: 'tx_1',
        data: {},
      })
    ).rejects.toThrow('missing legal tenant scope');
  });

  it('rejects transaction events when provided entity mismatches tenant entity', async () => {
    await expect(
      persistInvoiceAndLedgerInvariants({
        headers: new Headers(),
        delivery: TEST_PADDLE_DELIVERY,
        webhookEventRowId: 'we_1',
        eventType: 'transaction.completed',
        eventId: 'evt_1',
        tenantId: 'tenant_ks',
        billingEntity: 'mk',
        providerTransactionId: 'tx_1',
        data: {},
      })
    ).rejects.toThrow('conflicts with legal tenant');
  });

  it('rejects transaction events without a valid amount total', async () => {
    await expect(
      persistInvoiceAndLedgerInvariants({
        headers: new Headers(),
        delivery: TEST_PADDLE_DELIVERY,
        webhookEventRowId: 'we_1',
        eventType: 'transaction.completed',
        eventId: 'evt_1',
        tenantId: 'tenant_ks',
        providerTransactionId: 'tx_1',
        data: {
          details: {
            totals: {
              total: 'invalid-amount',
              currencyCode: 'EUR',
            },
          },
        },
      })
    ).rejects.toThrow('Missing or invalid transaction total');
    expect(hoisted.transaction).not.toHaveBeenCalled();
  });

  it('rejects transaction events without a valid currency code', async () => {
    await expect(
      persistInvoiceAndLedgerInvariants({
        headers: new Headers(),
        delivery: TEST_PADDLE_DELIVERY,
        webhookEventRowId: 'we_1',
        eventType: 'transaction.completed',
        eventId: 'evt_1',
        tenantId: 'tenant_ks',
        providerTransactionId: 'tx_1',
        data: {
          details: {
            totals: {
              total: '1000',
              currencyCode: 'EURO',
            },
          },
        },
      })
    ).rejects.toThrow('Missing or invalid transaction currency code');
    expect(hoisted.transaction).not.toHaveBeenCalled();
  });

  it('persists tenant/entity-scoped invoice and append-only ledger entry', async () => {
    const result = await persistInvoiceAndLedgerInvariants({
      headers: new Headers(),
      delivery: TEST_PADDLE_DELIVERY,
      webhookEventRowId: 'we_1',
      eventType: 'transaction.completed',
      eventId: 'evt_1',
      tenantId: 'tenant_ks',
      providerTransactionId: 'tx_1',
      storedSubscriptionId: 'sub_internal_1',
      data: {
        details: {
          totals: {
            total: '1000',
            currencyCode: 'eur',
          },
        },
      },
    });

    // The write runs under the billing authority minted for the delivery's bound tenant.
    expect(hoisted.authorizePaddleBillingTenant).toHaveBeenCalledWith(
      TEST_PADDLE_DELIVERY,
      'tenant_ks'
    );
    expect(hoisted.transaction).toHaveBeenCalledWith(
      hoisted.authorizePaddleBillingTenant.mock.results[0]!.value,
      expect.any(Function)
    );
    expect(result).toEqual({
      applied: true,
      replayed: false,
      invoiceId: 'inv_1',
      ledgerEntryId: 'led_1',
    });
    expect(hoisted.invoiceValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_ks',
        billingEntity: 'ks',
        providerTransactionId: 'tx_1',
        webhookEventId: 'we_1',
        subscriptionId: 'sub_internal_1',
        currencyCode: 'EUR',
      })
    );
    expect(hoisted.invoiceOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [
          hoisted.billingInvoices.tenantId,
          hoisted.billingInvoices.billingEntity,
          hoisted.billingInvoices.providerTransactionId,
        ],
      })
    );
    expect(hoisted.ledgerValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_ks',
        billingEntity: 'ks',
        invoiceId: 'inv_1',
        webhookEventId: 'we_1',
        entryType: 'invoice.posted',
      })
    );
    expect(hoisted.ledgerOnConflictDoNothing).toHaveBeenCalledWith();
  });
});
