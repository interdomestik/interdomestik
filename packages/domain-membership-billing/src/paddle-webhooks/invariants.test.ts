import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  transaction: vi.fn(),
  txInsert: vi.fn(),
  invoiceValues: vi.fn(),
  invoiceOnConflictDoUpdate: vi.fn(),
  invoiceReturning: vi.fn(),
  ledgerValues: vi.fn(),
  ledgerOnConflictDoNothing: vi.fn(),
  ledgerReturning: vi.fn(),
  sql: vi.fn(() => ({ mockedSql: true })),
  billingInvoices: {
    id: 'invoice_id_col',
    tenantId: 'invoice_tenant_id_col',
    billingEntity: 'invoice_billing_entity_col',
    providerTransactionId: 'invoice_provider_transaction_id_col',
    updatedAt: 'invoice_updated_at_col',
  },
  billingLedgerEntries: {
    id: 'ledger_id_col',
  },
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    transaction: hoisted.transaction,
  },
  billingInvoices: hoisted.billingInvoices,
  billingLedgerEntries: hoisted.billingLedgerEntries,
  sql: hoisted.sql,
}));

import { persistInvoiceAndLedgerInvariants } from './invariants';

describe('persistInvoiceAndLedgerInvariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const tx = {
      insert: hoisted.txInsert,
    };

    hoisted.transaction.mockImplementation(async callback => callback(tx as never));

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

  it('skips non-transaction events', async () => {
    const result = await persistInvoiceAndLedgerInvariants({
      headers: new Headers(),
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
        webhookEventRowId: 'we_1',
        eventType: 'transaction.completed',
        eventId: 'evt_1',
        tenantId: null,
        providerTransactionId: 'tx_1',
        data: {},
      })
    ).rejects.toThrow('Missing tenantId');
  });

  it('rejects transaction events when provided entity mismatches tenant entity', async () => {
    await expect(
      persistInvoiceAndLedgerInvariants({
        headers: new Headers(),
        webhookEventRowId: 'we_1',
        eventType: 'transaction.completed',
        eventId: 'evt_1',
        tenantId: 'tenant_ks',
        billingEntity: 'mk',
        providerTransactionId: 'tx_1',
        data: {},
      })
    ).rejects.toThrow('Billing entity mismatch');
  });

  it('persists tenant/entity-scoped invoice and append-only ledger entry', async () => {
    const result = await persistInvoiceAndLedgerInvariants({
      headers: new Headers(),
      webhookEventRowId: 'we_1',
      eventType: 'transaction.completed',
      eventId: 'evt_1',
      tenantId: 'tenant_ks',
      providerTransactionId: 'tx_1',
      data: {
        subscriptionId: 'sub_1',
        details: {
          totals: {
            total: '1000',
            currencyCode: 'eur',
          },
        },
      },
    });

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

  it('marks replay when ledger uniqueness rejects duplicate posting', async () => {
    const logAuditEvent = vi.fn();
    hoisted.ledgerReturning.mockResolvedValueOnce([{ id: 'led_1' }]).mockResolvedValueOnce([]);

    await persistInvoiceAndLedgerInvariants(
      {
        headers: new Headers(),
        webhookEventRowId: 'we_1',
        eventType: 'transaction.completed',
        eventId: 'evt_1',
        tenantId: 'tenant_ks',
        providerTransactionId: 'tx_1',
        data: {},
      },
      { logAuditEvent }
    );

    const replay = await persistInvoiceAndLedgerInvariants(
      {
        headers: new Headers(),
        webhookEventRowId: 'we_2',
        eventType: 'transaction.completed',
        eventId: 'evt_2',
        tenantId: 'tenant_ks',
        providerTransactionId: 'tx_1',
        data: {},
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
});
