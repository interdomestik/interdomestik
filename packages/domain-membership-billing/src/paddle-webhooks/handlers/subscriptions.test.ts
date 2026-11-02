import { isTenantAuthority, readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSubscriptionChanged } from './subscriptions';
import {
  TEST_PADDLE_DELIVERY,
  createActiveSubscriptionUpdatedEvent,
  mockUserOwner,
  resetPaddleHandlerMocks,
} from './test-support';

const hoisted = await vi.hoisted(async () => {
  const { createHoistedPaddleHandlerMocks } = await import('./test-support');

  return createHoistedPaddleHandlerMocks();
});

vi.mock('@interdomestik/database', async () =>
  (await import('./test-support')).createPaddleDatabaseMockModule(hoisted)
);

vi.mock('../../commissions/create', async () =>
  (await import('./test-support')).createCommissionMockModule()
);

vi.mock('@interdomestik/database/member-number', async () =>
  (await import('./test-support')).createMemberNumberMockModule()
);

const logAuditEvent = vi.fn();
const sendThankYouLetter = vi.fn();

beforeEach(() => {
  resetPaddleHandlerMocks(hoisted);
});

describe('handleSubscriptionChanged', () => {
  it('validates input and logs audit event on success', async () => {
    // Mock User: the privileged lookup names the tenant, the profile is read inside it.
    mockUserOwner(hoisted, 'tenant_abc');
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      tenantId: 'tenant_abc',
    });

    const validPayload = {
      id: 'sub_123',
      status: 'active',
      customData: { userId: 'user_123' },
      items: [{ price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } } }],
      currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
    };

    await handleSubscriptionChanged(
      { delivery: TEST_PADDLE_DELIVERY, eventType: 'subscription.updated', data: validPayload },
      { logAuditEvent, sendThankYouLetter }
    );

    expect(hoisted.tx.insert).toHaveBeenCalled();
    expect(hoisted.appendEvent).toHaveBeenCalledWith(
      hoisted.tx,
      expect.objectContaining({
        eventName: 'membership.subscription_changed',
        payload: { cancelAtPeriodEnd: false, fromStatus: 'none', toStatus: 'active' },
      })
    );
    expect(hoisted.resolution.resolvePaddleUserOwner).toHaveBeenCalledWith('user_123');
    // No stored subscription: the authority comes from the user's resolver owner, the exact object
    // the resolver returned, and every tenant-scoped statement runs under it.
    const userOwner = await hoisted.resolution.resolvePaddleUserOwner.mock.results[0]!.value;
    expect(hoisted.resolution.authorizePaddleTenant).toHaveBeenCalledWith(
      TEST_PADDLE_DELIVERY,
      userOwner
    );
    expect(hoisted.resolution.authorizePaddleTenant.mock.calls[0]![1]).toBe(userOwner);
    const authority = hoisted.resolution.authorizePaddleTenant.mock.results[0]!.value;
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    for (const [context] of hoisted.withTenantContext.mock.calls) {
      expect(context).toBe(authority);
    }
    expect(hoisted.db.query.user.findFirst).toHaveBeenCalledWith(expect.anything());
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.updated',
        entityId: 'sub_123',
        // The audit row is written under the very authority the effects ran under.
        authority: hoisted.resolution.authorizePaddleTenant.mock.results[0]!.value,
        metadata: expect.objectContaining({ status: 'active', userId: 'user_123' }),
      })
    );
  });

  it('reconciles an anonymous subscription.created before upserting the subscription', async () => {
    const requestPasswordResetOnboarding = vi.fn();
    const sendThankYouLetter = vi.fn();

    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.resolution.readVerifiedPaddleTransactionEvidence.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'buyer@example.com',
          customData: {
            tenantId: 'tenant_mk',
            agentId: 'agent_9',
            acquisitionSource: 'self_serve_web',
          },
        },
      },
    });
    // No tenant owns the email, so the reads are the agent branch lookup and the final reload.
    hoisted.db.query.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'user_new',
      tenantId: 'tenant_mk',
      email: 'buyer@example.com',
      name: '',
      memberNumber: 'MEM-2026-000123',
      branchId: 'branch-mk-main',
      role: 'member',
    });
    hoisted.identity.hasTenantMemberCredential.mockResolvedValue(false);
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue({
      value: { branchId: 'branch-mk-main' },
    });
    // After reconciliation the persisted user is named by the privileged owner lookup.
    mockUserOwner(hoisted, 'tenant_mk');

    await handleSubscriptionChanged(
      {
        delivery: TEST_PADDLE_DELIVERY,
        eventType: 'subscription.created',
        data: {
          id: 'sub_new',
          status: 'active',
          transactionId: 'txn_anon',
          customData: { tenantId: 'tenant_mk', agentId: 'agent_9', locale: 'en' },
          items: [
            {
              price: {
                id: 'pri_123',
                name: 'Annual membership',
                unitPrice: { amount: '2000', currencyCode: 'EUR' },
              },
            },
          ],
          billingCycle: { frequency: 1, interval: 'year' },
          currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
        },
      },
      { requestPasswordResetOnboarding, sendThankYouLetter }
    );

    expect(requestPasswordResetOnboarding).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      tenantId: 'tenant_mk',
    });
    // Previously 3 ambient transactions (user insert, subscription insert, attribution); every
    // tenant-scoped statement now runs through the canonical webhook tenant context. The four extra
    // contexts beyond the original seven are the canonical plan lookups and the branch-default
    // resolution, which previously ran on the ambient client. The credential lookup is identity
    // data the runtime role cannot read, so it runs through the fixed tenant-bound producer
    // instead of a tenant context.
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(10);
    // Reconciliation runs under the billing authority for the delivery's bound tenant; the
    // post-reconciliation effects run under an authority minted from the resolver owner of the
    // reconciled user. No legacy tenant literal reaches the tenant-context boundary.
    expect(hoisted.resolution.authorizePaddleBillingTenant).toHaveBeenCalledWith(
      TEST_PADDLE_DELIVERY,
      'tenant_mk'
    );
    const billingAuthority = hoisted.resolution.authorizePaddleBillingTenant.mock.results[0]!.value;
    expect(readTenantAuthority(billingAuthority).tenantId).toBe('tenant_mk');
    // The created member's number and credential state come from the fixed identity producers,
    // under the billing authority and for the member the tenant transaction created.
    const [[, createdUserId]] = hoisted.identity.hasTenantMemberCredential.mock.calls;
    expect(hoisted.identity.hasTenantMemberCredential).toHaveBeenCalledWith(
      billingAuthority,
      createdUserId
    );
    expect(hoisted.identity.issueTenantMemberNumber).toHaveBeenCalledWith(billingAuthority, {
      userId: createdUserId,
      joinedAt: expect.any(Date),
    });
    expect(hoisted.resolution.resolvePaddleUserOwner).toHaveBeenCalledWith('user_new');
    const reconciledOwner = await hoisted.resolution.resolvePaddleUserOwner.mock.results[0]!.value;
    expect(hoisted.resolution.authorizePaddleTenant).toHaveBeenCalledTimes(1);
    expect(hoisted.resolution.authorizePaddleTenant).toHaveBeenCalledWith(
      TEST_PADDLE_DELIVERY,
      reconciledOwner
    );
    expect(hoisted.resolution.authorizePaddleTenant.mock.calls[0]![1]).toBe(reconciledOwner);
    const userAuthority = hoisted.resolution.authorizePaddleTenant.mock.results[0]!.value;
    expect(readTenantAuthority(userAuthority).tenantId).toBe('tenant_mk');
    let billingContexts = 0;
    let userContexts = 0;
    for (const [context] of hoisted.withTenantContext.mock.calls) {
      expect(isTenantAuthority(context)).toBe(true);
      if (context === billingAuthority) billingContexts += 1;
      else if (context === userAuthority) userContexts += 1;
      else throw new Error('unexpected tenant context');
    }
    expect(billingContexts).toBeGreaterThan(0);
    expect(userContexts).toBeGreaterThan(0);
    expect(hoisted.tx.insert).toHaveBeenCalled();
    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('updates an existing user-scoped subscription row instead of inserting a second row', async () => {
    const mockWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'mock_sub_existing' }]),
    });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    hoisted.tx.update.mockReturnValue({ set: mockSet });

    // The provider reference resolves to nothing; the user-scoped fallback finds the row.
    hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce({
      id: 'mock_sub_existing',
      tenantId: 'tenant_abc',
      userId: 'user_123',
    });
    mockUserOwner(hoisted, 'tenant_abc');
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      tenantId: 'tenant_abc',
    });

    await handleSubscriptionChanged(createActiveSubscriptionUpdatedEvent(), { logAuditEvent });

    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ providerSubscriptionId: 'sub_paddle_456' })
    );
    expect(mockWhere).toHaveBeenCalled();
  });

  it('stores the canonical annual plan id instead of the Paddle price id', async () => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);

    hoisted.tx.insert.mockReturnValue({ values: insertedValues });
    hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce(null);
    mockUserOwner(hoisted, 'tenant_mk');
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      tenantId: 'tenant_mk',
    });
    hoisted.selectResults.push([], [{ id: 'mk-standard-plan', tier: 'standard' }]);

    await handleSubscriptionChanged(
      {
        delivery: TEST_PADDLE_DELIVERY,
        eventType: 'subscription.updated',
        data: {
          id: 'sub_paddle_annual',
          status: 'active',
          customData: { userId: 'user_123' },
          items: [
            {
              price: {
                id: 'pri_standard_year_mk',
                unitPrice: { amount: '2000', currencyCode: 'EUR' },
              },
            },
          ],
          currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
        },
      },
      { logAuditEvent }
    );

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'standard', planKey: 'mk-standard-plan' })
    );
  });
});
