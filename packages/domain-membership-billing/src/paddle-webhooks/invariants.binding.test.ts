import { hoisted } from './invariants.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEST_PADDLE_DELIVERY,
  authorizeAnyTestPaddleBillingTenant,
  createTestPaddleBillingProducer,
} from './paddle-authority.test-support';
import { persistInvoiceAndLedgerInvariants } from './invariants';

describe('persistInvoiceAndLedgerInvariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authorizePaddleBillingTenant.mockImplementation(authorizeAnyTestPaddleBillingTenant);

    const tx = {
      insert: hoisted.txInsert,
    };

    hoisted.transaction.mockImplementation(async (_context, callback) => callback(tx as never));

    hoisted.txInsert.mockImplementation(table => {
      if (table === hoisted.billingInvoices) {
        return { values: hoisted.invoiceValues };
      }
      if (table === hoisted.billingLedgerEntries) {
        return { values: hoisted.ledgerValues };
      }
      throw new Error(`Unexpected table insert target: ${String(table)}`);
    });

    hoisted.invoiceValues.mockReturnValue({
      onConflictDoUpdate: hoisted.invoiceOnConflictDoUpdate,
    });
    hoisted.invoiceOnConflictDoUpdate.mockReturnValue({
      returning: hoisted.invoiceReturning,
    });
    hoisted.invoiceReturning.mockResolvedValue([{ id: 'inv_1' }]);

    hoisted.ledgerValues.mockReturnValue({
      onConflictDoNothing: hoisted.ledgerOnConflictDoNothing,
    });
    hoisted.ledgerOnConflictDoNothing.mockReturnValue({
      returning: hoisted.ledgerReturning,
    });
    hoisted.ledgerReturning.mockResolvedValue([{ id: 'led_1' }]);
  });

  it('marks replay when ledger uniqueness rejects duplicate posting', async () => {
    const logAuditEvent = vi.fn();
    hoisted.ledgerReturning.mockResolvedValueOnce([{ id: 'led_1' }]).mockResolvedValueOnce([]);

    await persistInvoiceAndLedgerInvariants(
      {
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
              currencyCode: 'EUR',
            },
          },
        },
      },
      { logAuditEvent }
    );

    const replay = await persistInvoiceAndLedgerInvariants(
      {
        headers: new Headers(),
        delivery: TEST_PADDLE_DELIVERY,
        webhookEventRowId: 'we_2',
        eventType: 'transaction.completed',
        eventId: 'evt_2',
        tenantId: 'tenant_ks',
        providerTransactionId: 'tx_1',
        data: {
          details: {
            totals: {
              total: '1000',
              currencyCode: 'EUR',
            },
          },
        },
      },
      { logAuditEvent }
    );

    expect(replay).toEqual({
      applied: true,
      replayed: true,
      invoiceId: 'inv_1',
      ledgerEntryId: null,
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'billing.invoice.replay_ignored',
        metadata: expect.objectContaining({
          replayed: true,
          providerTransactionId: 'tx_1',
        }),
      })
    );
  });
  describe('billing binding', () => {
    const input = (overrides: Record<string, unknown> = {}) => ({
      headers: new Headers(),
      delivery: TEST_PADDLE_DELIVERY,
      webhookEventRowId: 'we_1',
      eventType: 'transaction.completed',
      eventId: 'evt_1',
      tenantId: 'tenant_ks',
      providerTransactionId: 'tx_1',
      data: { details: { totals: { total: '1000', currencyCode: 'EUR' } } },
      ...overrides,
    });

    it('cannot persist invariants on an unbound delivery', async () => {
      hoisted.authorizePaddleBillingTenant.mockImplementation(
        createTestPaddleBillingProducer(null)
      );

      await expect(persistInvoiceAndLedgerInvariants(input())).rejects.toThrow(
        'billing tenant tenant_ks is not authorized for this delivery: Paddle billing authority requires an entity-bound delivery'
      );

      expect(hoisted.transaction).not.toHaveBeenCalled();
      expect(hoisted.txInsert).not.toHaveBeenCalled();
    });

    it('cannot act for another billing tenant than the delivery binding', async () => {
      hoisted.authorizePaddleBillingTenant.mockImplementation(
        createTestPaddleBillingProducer('tenant_mk')
      );

      await expect(persistInvoiceAndLedgerInvariants(input())).rejects.toThrow(
        'requires the delivery billing tenant'
      );

      expect(hoisted.transaction).not.toHaveBeenCalled();
      expect(hoisted.txInsert).not.toHaveBeenCalled();
    });

    it('fails closed with no writes when customData names a tenant other than the binding', async () => {
      hoisted.authorizePaddleBillingTenant.mockImplementation(
        createTestPaddleBillingProducer('tenant_ks')
      );

      await expect(
        persistInvoiceAndLedgerInvariants(
          input({
            tenantId: null,
            data: {
              customData: { tenantId: 'tenant_mk' },
              details: { totals: { total: '1000', currencyCode: 'EUR' } },
            },
          })
        )
      ).rejects.toThrow('requires the delivery billing tenant');

      expect(hoisted.transaction).not.toHaveBeenCalled();
      expect(hoisted.txInsert).not.toHaveBeenCalled();
    });
  });
});
