import { hoisted } from './invariants.test-support';
import { beforeEach, vi } from 'vitest';
import { authorizeAnyTestPaddleBillingTenant } from './paddle-authority.test-support';

export function installInvariantsHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authorizePaddleBillingTenant.mockImplementation(authorizeAnyTestPaddleBillingTenant);

    const tx = {
      insert: hoisted.txInsert,
    };

    hoisted.transaction.mockImplementation(
      async (_context, callback) => await callback(tx as never)
    );

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
}
