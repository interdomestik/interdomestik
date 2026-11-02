import { hoisted } from './reconcile-checkout-user.test-support';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TEST_PADDLE_DELIVERY,
  authorizeAnyTestPaddleBillingTenant,
  authorizeTestPaddleOwner,
} from '../../paddle-authority.test-support';
import { reconcileCheckoutUser } from './reconcile-checkout-user';

function insertedUserValuesInclude(fields: Record<string, unknown>): boolean {
  return hoisted.insertedUserValues.mock.calls.some(([value]) => {
    if (!value || typeof value !== 'object') return false;
    return Object.entries(fields).every(([key, expected]) => {
      return (value as Record<string, unknown>)[key] === expected;
    });
  });
}

describe('reconcileCheckoutUser', () => {
  const requestPasswordResetOnboarding = vi.fn();

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

    hoisted.db.transaction.mockImplementation(async callback => callback(hoisted.tx));
    // Tenant-scoped statements (writes via tx.insert/update, reads via tx.query) share one context mock.
    hoisted.tx.query = hoisted.db.query;
    hoisted.withTenantContext.mockReset();
    hoisted.withTenantContext.mockImplementation(async (_context, callback) =>
      callback(hoisted.tx)
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
        returning: async () => [{ id: 'user_existing' }],
      }),
    });
  });

  it('preserves elevated roles while still backfilling member state', async () => {
    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'admin@example.com',
          customData: {
            tenantId: 'tenant_ks',
            agentId: 'agent_1',
          },
        },
      },
    });
    hoisted.resolvePaddleCustomerEmailOwner.mockResolvedValue({
      userId: 'user_admin',
      tenantId: 'tenant_ks',
    });
    hoisted.db.query.user.findFirst
      .mockResolvedValueOnce({
        id: 'user_admin',
        tenantId: 'tenant_ks',
        branchId: null,
        email: 'admin@example.com',
        name: 'Admin User',
        memberNumber: null,
        role: 'admin',
        agentId: null,
        createdBy: 'admin',
      })
      .mockResolvedValueOnce({
        id: 'user_admin',
        tenantId: 'tenant_ks',
        branchId: 'branch-ks-main',
        email: 'admin@example.com',
        name: 'Admin User',
        memberNumber: 'MEM-2026-000555',
        role: 'admin',
      });
    hoisted.hasTenantMemberCredential.mockResolvedValue(true);
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue({
      value: { branchId: 'branch-ks-main' },
    });

    await reconcileCheckoutUser(
      TEST_PADDLE_DELIVERY,
      {
        id: 'sub_admin',
        transactionId: 'txn_admin',
        customData: {
          tenantId: 'tenant_ks',
          agentId: 'agent_1',
        },
      },
      { requestPasswordResetOnboarding }
    );

    expect(hoisted.tx.update).toHaveBeenCalled();
    expect(hoisted.updatedUserValues).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'admin',
        branchId: 'branch-ks-main',
        agentId: 'agent_1',
        assistedByAgentId: 'agent_1',
        createdBy: 'admin',
      })
    );
    expect(hoisted.issueTenantMemberNumber).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user_admin',
      joinedAt: expect.any(Date),
    });
    expect(insertedUserValuesInclude({ memberId: 'user_admin', status: 'active' })).toBe(false);
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
  });

  it('returns null without any write when email ownership is ambiguous across tenants', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'shared@example.com',
          customData: { tenantId: 'tenant_mk' },
        },
      },
    });
    hoisted.resolvePaddleCustomerEmailOwner.mockResolvedValue('ambiguous');

    const result = await reconcileCheckoutUser(
      TEST_PADDLE_DELIVERY,
      {
        id: 'sub_ambiguous',
        transactionId: 'txn_ambiguous',
        customData: { tenantId: 'tenant_mk' },
      },
      { requestPasswordResetOnboarding }
    );

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('is ambiguous'));
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.db.query.user.findFirst).not.toHaveBeenCalled();
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(hoisted.issueTenantMemberNumber).not.toHaveBeenCalled();
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('treats an email owner that is not visible in its own tenant as a conflict, never as absent', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'hidden@example.com',
          customData: { tenantId: 'tenant_mk' },
        },
      },
    });
    hoisted.resolvePaddleCustomerEmailOwner.mockResolvedValue({
      userId: 'user_hidden',
      tenantId: 'tenant_ks',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue(undefined);

    const result = await reconcileCheckoutUser(
      TEST_PADDLE_DELIVERY,
      { id: 'sub_hidden', transactionId: 'txn_hidden', customData: { tenantId: 'tenant_mk' } },
      { requestPasswordResetOnboarding }
    );

    expect(result).toBeNull();
    // Only the owner-scoped read ran, under the authority minted from the email owner.
    const emailOwner = await hoisted.resolvePaddleCustomerEmailOwner.mock.results[0]!.value;
    expect(hoisted.authorizePaddleTenant).toHaveBeenCalledWith(TEST_PADDLE_DELIVERY, emailOwner);
    expect(hoisted.authorizePaddleTenant.mock.calls[0]![1]).toBe(emailOwner);
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      hoisted.authorizePaddleTenant.mock.results[0]!.value,
      expect.any(Function)
    );
    expect(readTenantAuthority(hoisted.authorizePaddleTenant.mock.results[0]!.value).tenantId).toBe(
      'tenant_ks'
    );
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('rethrows the unique violation when the raced email owner is ambiguous', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'race@example.com',
          customData: { tenantId: 'tenant_mk' },
        },
      },
    });
    hoisted.resolvePaddleCustomerEmailOwner
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('ambiguous');
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue(undefined);
    hoisted.insertedUserValues.mockRejectedValueOnce(uniqueViolation);

    await expect(
      reconcileCheckoutUser(
        TEST_PADDLE_DELIVERY,
        { id: 'sub_race', transactionId: 'txn_race', customData: { tenantId: 'tenant_mk' } },
        { requestPasswordResetOnboarding }
      )
    ).rejects.toBe(uniqueViolation);
    expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
  });
});
