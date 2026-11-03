import { installReconcileCheckoutUserHooks } from './reconcile-checkout-user.hooks.test-support';
import { hoisted, insertedUserValuesInclude } from './reconcile-checkout-user.test-support';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { describe, expect, it, vi } from 'vitest';
import { TEST_PADDLE_DELIVERY } from '../../paddle-authority.test-support';
import { isRetryablePaddleWebhookError } from '../../errors';
import { reconcileCheckoutUser } from './reconcile-checkout-user';

describe('reconcileCheckoutUser', () => {
  const requestPasswordResetOnboarding = vi.fn();

  installReconcileCheckoutUserHooks();

  const counterDown = new Error('counter down');
  it.each([
    ['is refused', () => hoisted.issueTenantMemberNumber.mockResolvedValue(null), undefined],
    ['fails', () => hoisted.issueTenantMemberNumber.mockRejectedValue(counterDown), counterDown],
  ])(
    'fails reconciliation as retryable, for the receipt to be redelivered, when member-number issuance %s',
    async (_label, arrange, cause) => {
      hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
        payload: {
          data: { customerEmail: 'buyer@example.com', customData: { tenantId: 'tenant_mk' } },
        },
      });
      hoisted.db.query.user.findFirst.mockResolvedValue(null);
      hoisted.db.query.tenantSettings.findFirst.mockResolvedValue(undefined);
      arrange();

      await expect(
        reconcileCheckoutUser(
          TEST_PADDLE_DELIVERY,
          { id: 'sub_new', transactionId: 'txn_123', customData: { tenantId: 'tenant_mk' } },
          { requestPasswordResetOnboarding }
        )
      ).rejects.toSatisfy(
        error => isRetryablePaddleWebhookError(error) && (error as Error).cause === cause
      );
      expect(hoisted.insertedUserValues).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user_new', role: 'member' })
      );
      expect(requestPasswordResetOnboarding).not.toHaveBeenCalled();
    }
  );

  it('creates a new member user from stored transaction payload and requests onboarding', async () => {
    hoisted.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'buyer@example.com',
          customData: {
            tenantId: 'tenant_mk',
            agentId: 'agent_9',
            acquisitionSource: 'self_serve_web',
            utmSource: 'google',
          },
        },
      },
    });
    // No tenant owns the email (privileged probe); the reads below are the agent branch lookup and
    // the final reload.
    hoisted.db.query.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'user_new',
      tenantId: 'tenant_mk',
      email: 'buyer@example.com',
      name: 'buyer',
      memberNumber: 'MEM-2026-000123',
    });
    hoisted.hasTenantMemberCredential.mockResolvedValue(false);
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue({
      value: { branchId: 'branch-mk-main' },
    });

    const result = await reconcileCheckoutUser(
      TEST_PADDLE_DELIVERY,
      {
        id: 'sub_new',
        transactionId: 'txn_123',
        customData: {
          tenantId: 'tenant_mk',
          agentId: 'agent_9',
        },
      },
      { requestPasswordResetOnboarding }
    );

    // Every effect runs under the billing authority for the entity-bound tenant, minted from the
    // evidence tenant only because it equals the binding.
    expect(hoisted.authorizePaddleBillingTenant).toHaveBeenCalledWith(
      TEST_PADDLE_DELIVERY,
      'tenant_mk'
    );
    const billingAuthority = hoisted.authorizePaddleBillingTenant.mock.results[0]!.value;
    expect(readTenantAuthority(billingAuthority).tenantId).toBe('tenant_mk');
    expect(hoisted.withTenantContext).toHaveBeenCalled();
    for (const [context] of hoisted.withTenantContext.mock.calls) {
      expect(context).toBe(billingAuthority);
    }
    expect(hoisted.tx.insert).toHaveBeenCalledTimes(1);
    expect(hoisted.tx.insert).toHaveBeenCalled();
    expect(hoisted.insertedUserValues).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'member',
        agentId: 'agent_9',
        createdBy: 'self',
        assistedByAgentId: 'agent_9',
      })
    );
    expect(insertedUserValuesInclude({ memberId: 'user_new', status: 'active' })).toBe(false);
    expect(hoisted.issueTenantMemberNumber).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user_new',
      joinedAt: expect.any(Date),
    });
    // Both identity producers run under the billing authority of the reconciled tenant, after
    // the tenant transaction that created the member.
    const [issuedAuthority] = hoisted.issueTenantMemberNumber.mock.calls[0];
    expect(readTenantAuthority(issuedAuthority).tenantId).toBe('tenant_mk');
    expect(hoisted.hasTenantMemberCredential).toHaveBeenCalledWith(issuedAuthority, 'user_new');
    expect(hoisted.withTenantContext.mock.invocationCallOrder[1]).toBeLessThan(
      hoisted.issueTenantMemberNumber.mock.invocationCallOrder[0]
    );
    expect(requestPasswordResetOnboarding).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      tenantId: 'tenant_mk',
    });
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user_new',
        tenantId: 'tenant_mk',
        branchId: 'branch-mk-main',
        customData: expect.objectContaining({
          tenantId: 'tenant_mk',
          agentId: 'agent_9',
          acquisitionSource: 'self_serve_web',
          utmSource: 'google',
        }),
      })
    );
  });
});
