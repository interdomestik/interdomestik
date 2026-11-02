import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authorizePaddleBillingTenant: vi.fn(),
  authorizePaddleTenant: vi.fn(),
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
  resolvePaddleSubscriptionOwner: vi.fn(),
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
  },
  withTenantContext: hoisted.transaction,
  sql: hoisted.sql,
  resolvePaddleSubscriptionOwner: hoisted.resolvePaddleSubscriptionOwner,
  authorizePaddleBillingTenant: hoisted.authorizePaddleBillingTenant,
  authorizePaddleTenant: hoisted.authorizePaddleTenant,
}));

import {
  TEST_PADDLE_DELIVERY,
  authorizeAnyTestPaddleBillingTenant,
  authorizeTestPaddleOwner,
  createTestPaddleBillingProducer,
} from './paddle-authority.test-support';
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
    delivery: TEST_PADDLE_DELIVERY,
    providerTransactionId: 'tx_1',
    storedSubscriptionId: 'sub_1',
    tenantId: 'tenant_ks',
    webhookEventRowId: 'we_1',
  };
}

describe('persistInvoiceAndLedgerInvariants snapshot scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authorizePaddleTenant.mockImplementation(authorizeTestPaddleOwner);
    // The billing tenant of the entity route that received the delivery.
    hoisted.authorizePaddleBillingTenant.mockImplementation(authorizeAnyTestPaddleBillingTenant);
    // Unknown provider references resolve to no owner unless a test names one.
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValue(null);
    const tx = {
      insert: hoisted.txInsert,
      query: { subscriptions: { findFirst: hoisted.subscriptionFindFirst } },
    };
    hoisted.transaction.mockImplementation(async (_context, callback) => callback(tx));
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
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValue({
      subscriptionId: 'sub_1',
      tenantId: 'tenant_ks',
    });
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
        subscriptionId: 'sub_1',
        tenantId: 'tenant_mk',
      })
    );
    expect(hoisted.ledgerValues).toHaveBeenCalledWith(
      expect.objectContaining({ billingEntity: 'mk', tenantId: 'tenant_mk' })
    );
  });

  it('refuses a stored legal tenant that is not the billing tenant the delivery is bound to', async () => {
    hoisted.authorizePaddleBillingTenant.mockImplementation(
      createTestPaddleBillingProducer('tenant_ks')
    );
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValue({
      subscriptionId: 'sub_1',
      tenantId: 'tenant_ks',
    });
    hoisted.subscriptionFindFirst.mockResolvedValue({
      billingEntity: 'mk',
      id: 'sub_1',
      legalTenantId: 'tenant_mk',
      tenantId: 'tenant_ks',
    });

    await expect(persistInvoiceAndLedgerInvariants(transactionInput())).rejects.toThrow(
      'requires the delivery billing tenant'
    );

    // Only the owner-scoped subscription read ran; the invoice and ledger were never written.
    expect(hoisted.transaction).toHaveBeenCalledTimes(1);
    expect(hoisted.transaction).toHaveBeenCalledWith(
      hoisted.authorizePaddleTenant.mock.results[0]!.value,
      expect.any(Function)
    );
    expect(hoisted.txInsert).not.toHaveBeenCalled();
    expect(hoisted.invoiceValues).not.toHaveBeenCalled();
  });

  it('uses the owner-scoped subscription read, then the billing authority for the write', async () => {
    hoisted.authorizePaddleBillingTenant.mockImplementation(
      createTestPaddleBillingProducer('tenant_mk')
    );
    const owner = { subscriptionId: 'sub_1', tenantId: 'tenant_ks' };
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValue(owner);
    hoisted.subscriptionFindFirst.mockResolvedValue({
      billingEntity: 'mk',
      id: 'sub_1',
      legalTenantId: 'tenant_mk',
      tenantId: 'tenant_ks',
    });

    await persistInvoiceAndLedgerInvariants(transactionInput());

    expect(hoisted.authorizePaddleTenant).toHaveBeenCalledWith(TEST_PADDLE_DELIVERY, owner);
    expect(hoisted.authorizePaddleTenant.mock.calls[0]![1]).toBe(owner);
    expect(hoisted.authorizePaddleBillingTenant).toHaveBeenCalledWith(
      TEST_PADDLE_DELIVERY,
      'tenant_mk'
    );
    const [readContext, writeContext] = hoisted.transaction.mock.calls.map(call => call[0]);
    expect(readContext).toBe(hoisted.authorizePaddleTenant.mock.results[0]!.value);
    expect(writeContext).toBe(hoisted.authorizePaddleBillingTenant.mock.results[0]!.value);
  });

  it('does not link an invoice to an out-of-order provider subscription id', async () => {
    hoisted.subscriptionFindFirst.mockResolvedValue(null);

    await persistInvoiceAndLedgerInvariants({
      ...transactionInput({ tenantId: 'tenant_mk' }),
      storedSubscriptionId: undefined,
      tenantId: 'tenant_mk',
    });

    expect(hoisted.invoiceValues).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: null })
    );
  });

  it('uses recovery success-fee legal tenant metadata before subscription scope', async () => {
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValue({
      subscriptionId: 'sub_1',
      tenantId: 'tenant_ks',
    });
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
    // The provider reference is looked up once; with no unique owner nothing is read or written.
    expect(hoisted.resolvePaddleSubscriptionOwner).toHaveBeenCalledTimes(1);
    expect(hoisted.resolvePaddleSubscriptionOwner).toHaveBeenCalledWith('sub_paddle_1');
    expect(hoisted.subscriptionFindFirst).not.toHaveBeenCalled();
    expect(hoisted.invoiceValues).not.toHaveBeenCalled();
  });

  it('rejects unsupported explicit billing entity metadata', async () => {
    await expect(
      persistInvoiceAndLedgerInvariants(transactionInput({ billingEntity: 'zz' }))
    ).rejects.toThrow('Unsupported webhook billing entity metadata');
    expect(hoisted.invoiceValues).not.toHaveBeenCalled();
  });
});
