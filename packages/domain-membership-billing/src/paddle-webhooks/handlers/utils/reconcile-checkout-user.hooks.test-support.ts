import { hoisted } from './reconcile-checkout-user.test-support';
import { beforeEach, vi } from 'vitest';
import {
  authorizeAnyTestPaddleBillingTenant,
  authorizeTestPaddleOwner,
} from '../../paddle-authority.test-support';

export function installReconcileCheckoutUserHooks(): void {
  beforeEach(() => {
    hoisted.authorizePaddleBillingTenant.mockReset();
    hoisted.authorizePaddleBillingTenant.mockImplementation(authorizeAnyTestPaddleBillingTenant);
    hoisted.authorizePaddleTenant.mockReset();
    hoisted.authorizePaddleTenant.mockImplementation(authorizeTestPaddleOwner);
    vi.clearAllMocks();
    hoisted.db.query.user.findFirst.mockReset();
    hoisted.hasTenantMemberCredential.mockReset().mockResolvedValue(false);
    hoisted.readVerifiedPaddleTransactionEvidence.mockReset();
    hoisted.resolvePaddleCustomerEmailOwner.mockReset().mockResolvedValue(null);
    hoisted.db.query.tenantSettings.findFirst.mockReset();
    hoisted.db.transaction.mockReset();
    hoisted.tx.insert.mockReset();
    hoisted.tx.update.mockReset();
    hoisted.insertedUserValues.mockReset();
    hoisted.updatedUserValues.mockReset();
    hoisted.issueTenantMemberNumber.mockReset();
    hoisted.nanoid.mockReset();

    hoisted.nanoid.mockReturnValue('user_new');
    hoisted.issueTenantMemberNumber.mockResolvedValue({
      memberNumber: 'MEM-2026-000123',
      isNew: true,
    });

    hoisted.db.transaction.mockImplementation(async callback => await callback(hoisted.tx));
    // Tenant-scoped statements (writes via tx.insert/update, reads via tx.query) share one context mock.
    hoisted.tx.query = hoisted.db.query;
    hoisted.withTenantContext.mockReset();
    hoisted.withTenantContext.mockImplementation(
      async (_context, callback) => await callback(hoisted.tx)
    );

    hoisted.tx.insert.mockImplementation(() => ({
      values: hoisted.insertedUserValues,
    }));
    hoisted.insertedUserValues.mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    });

    hoisted.tx.update.mockImplementation(() => ({
      set: hoisted.updatedUserValues,
    }));
    hoisted.updatedUserValues.mockReturnValue({
      where: () => ({
        returning: () => Promise.resolve([{ id: 'user_existing' }]),
      }),
    });
  });
}
