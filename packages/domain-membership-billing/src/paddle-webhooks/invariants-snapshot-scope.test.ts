import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  billingInvoices: {
    billingEntity: 'invoice_billing_entity_col',
    id: 'invoice_id_col',
    providerTransactionId: 'invoice_provider_transaction_id_col',
    tenantId: 'invoice_tenant_id_col',
    updatedAt: 'invoice_updated_at_col',
  },
  billingLedgerEntries: { id: 'ledger_id_col' },
  invoiceOnConflictDoUpdate: vi.fn(),
  invoiceReturning: vi.fn(),
  invoiceValues: vi.fn(),
  ledgerOnConflictDoNothing: vi.fn(),
  ledgerReturning: vi.fn(),
  ledgerValues: vi.fn(),
  sql: vi.fn(() => ({ mockedSql: true })),
  subscriptionFindFirst: vi.fn(),
  transaction: vi.fn(),
  txInsert: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  billingInvoices: hoisted.billingInvoices,
  billingLedgerEntries: hoisted.billingLedgerEntries,
  db: {
    query: { subscriptions: { findFirst: hoisted.subscriptionFindFirst } },
    transaction: hoisted.transaction,
  },
  sql: hoisted.sql,
}));

import { persistInvoiceAndLedgerInvariants } from './invariants';

function transactionInput(customData?: Record<string, string>) {
  return {
    billingEntity: 'mk' as const,
    data: {
      customData,
      details: { totals: { currencyCode: 'eur', total: '1000' } },
      subscriptionId: 'sub_paddle_1',
    },
    eventId: 'evt_1',
    eventType: 'transaction.completed',
    headers: new Headers(),
    providerTransactionId: 'tx_1',
    tenantId: 'tenant_ks',
    webhookEventRowId: 'we_1',
  };
}

describe('persistInvoiceAndLedgerInvariants snapshot scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tx = { insert: hoisted.txInsert };
    hoisted.transaction.mockImplementation(async callback => callback(tx));
    hoisted.txInsert.mockImplementation(table => {
      if (table === hoisted.billingInvoices) return { values: hoisted.invoiceValues };
      if (table === hoisted.billingLedgerEntries) return { values: hoisted.ledgerValues };
      throw new Error(`Unexpected table insert target: ${String(table)}`);
    });
    hoisted.invoiceValues.mockReturnValue({
      onConflictDoUpdate: hoisted.invoiceOnConflictDoUpdate,
    });
    hoisted.invoiceOnConflictDoUpdate.mockReturnValue({ returning: hoisted.invoiceReturning });
    hoisted.invoiceReturning.mockResolvedValue([{ id: 'inv_1' }]);
    hoisted.ledgerValues.mockReturnValue({
      onConflictDoNothing: hoisted.ledgerOnConflictDoNothing,
    });
    hoisted.ledgerOnConflictDoNothing.mockReturnValue({ returning: hoisted.ledgerReturning });
    hoisted.ledgerReturning.mockResolvedValue([{ id: 'led_1' }]);
  });

  it('uses stored subscription legal tenant and billing entity for invoice scope', async () => {
    hoisted.subscriptionFindFirst.mockResolvedValue({
      billingEntity: 'mk',
      id: 'sub_1',
      legalTenantId: 'tenant_mk',
      tenantId: 'tenant_ks',
    });

    await persistInvoiceAndLedgerInvariants(transactionInput());

    expect(hoisted.invoiceValues).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEntity: 'mk',
        subscriptionId: 'sub_paddle_1',
        tenantId: 'tenant_mk',
      })
    );
    expect(hoisted.ledgerValues).toHaveBeenCalledWith(
      expect.objectContaining({ billingEntity: 'mk', tenantId: 'tenant_mk' })
    );
  });

  it('uses recovery success-fee legal tenant metadata before subscription scope', async () => {
    hoisted.subscriptionFindFirst.mockResolvedValue({
      billingEntity: 'ks',
      id: 'sub_1',
      legalTenantId: 'tenant_ks',
      tenantId: 'tenant_ks',
    });

    await persistInvoiceAndLedgerInvariants(
      transactionInput({
        billingEntity: 'mk',
        domainEventConsumer: 'billing.recovery_success_fee_collected.paddle',
        recoveryLegalTenantId: 'tenant_mk',
        tenantId: 'tenant_ks',
      })
    );

    expect(hoisted.invoiceValues).toHaveBeenCalledWith(
      expect.objectContaining({ billingEntity: 'mk', tenantId: 'tenant_mk' })
    );
  });

  it('rejects route entity conflicts when subscription lookup misses', async () => {
    hoisted.subscriptionFindFirst.mockResolvedValue(null);

    await expect(
      persistInvoiceAndLedgerInvariants(
        transactionInput({
          tenantId: 'tenant_ks',
        })
      )
    ).rejects.toThrow('conflicts with legal tenant');
    expect(hoisted.subscriptionFindFirst).toHaveBeenCalledTimes(1);
    expect(hoisted.invoiceValues).not.toHaveBeenCalled();
  });

  it('rejects unsupported explicit billing entity metadata', async () => {
    await expect(
      persistInvoiceAndLedgerInvariants(transactionInput({ billingEntity: 'zz' }))
    ).rejects.toThrow('Unsupported webhook billing entity metadata');
    expect(hoisted.invoiceValues).not.toHaveBeenCalled();
  });
});
