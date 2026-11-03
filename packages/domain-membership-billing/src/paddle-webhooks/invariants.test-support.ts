import { vi, type Mock } from 'vitest';

// Matches Vitest's own Procedure so typed mocks stay callable and assignable like inferred ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFunction = Mock<(...args: any[]) => any>;

type HoistedMocks = {
  authorizePaddleBillingTenant: MockFunction;
  transaction: MockFunction;
  txInsert: MockFunction;
  invoiceValues: MockFunction;
  invoiceOnConflictDoUpdate: MockFunction;
  invoiceReturning: MockFunction;
  ledgerValues: MockFunction;
  ledgerOnConflictDoNothing: MockFunction;
  ledgerReturning: MockFunction;
  sql: MockFunction;
  billingInvoices: {
    id: string;
    tenantId: string;
    billingEntity: string;
    providerTransactionId: string;
    updatedAt: string;
  };
  billingLedgerEntries: {
    id: string;
  };
};

const hoisted: HoistedMocks = vi.hoisted(() => ({
  authorizePaddleBillingTenant: vi.fn(),
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
  authorizePaddleBillingTenant: hoisted.authorizePaddleBillingTenant,
  withTenantContext: hoisted.transaction,
  billingInvoices: hoisted.billingInvoices,
  billingLedgerEntries: hoisted.billingLedgerEntries,
  sql: hoisted.sql,
}));

export { hoisted };
