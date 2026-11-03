import type { IngressCapability } from '@interdomestik/database/ingress';
import { expect, vi } from 'vitest';
import { createQueuedFrom as createQueuedFromMock } from '../../../../../scripts/tests/queued-select-mock';
import {
  TEST_PADDLE_DELIVERY,
  authorizeAnyTestPaddleBillingTenant,
  authorizeTestPaddleOwner,
} from '../paddle-authority.test-support';
import type { MockFunction, createHoistedPaddleHandlerMocks } from './test-support-mocks';

export { TEST_PADDLE_DELIVERY, authorizeTestPaddleOwner };

export { createQueuedFromMock as createQueuedFrom };
export {
  createCommissionMockModule,
  createHoistedPaddleHandlerMocks,
  createMemberNumberMockModule,
  createPaddleDatabaseMockModule,
} from './test-support-mocks';

type RacedSubscriptionInsertMocks = { mockSet: MockFunction; mockWhere: MockFunction };

/** The privileged resolver names this exact user's owning tenant. */
export function mockUserOwner(
  hoisted: ReturnType<typeof createHoistedPaddleHandlerMocks>,
  tenantId: string
) {
  hoisted.resolution.resolvePaddleUserOwner.mockImplementation((userId: string) =>
    Promise.resolve({
      userId,
      tenantId,
    })
  );
}

/** The privileged resolver names this exact subscription's owning tenant. */
export function mockSubscriptionOwner(
  hoisted: ReturnType<typeof createHoistedPaddleHandlerMocks>,
  owner: { subscriptionId: string; tenantId: string }
) {
  hoisted.resolution.resolvePaddleSubscriptionOwner.mockResolvedValue(owner);
}

/** Verified-delivery stand-in carried by every webhook event fixture. */
export type PaddleEventDelivery = IngressCapability<'paddle-delivery'>;

function pastDueSubscriptionEventBody() {
  return {
    data: {
      id: 'sub_paddle_456',
      status: 'past_due',
      customData: { userId: 'user_123' },
      items: [
        {
          price: {
            id: 'pri_123',
            description: 'Asistenca',
            unitPrice: { amount: '1000', currencyCode: 'USD' },
          },
        },
      ],
      currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
    },
  };
}

export function createPastDueSubscriptionEvent(): ReturnType<
  typeof pastDueSubscriptionEventBody
> & { delivery: PaddleEventDelivery } {
  return { delivery: TEST_PADDLE_DELIVERY, ...pastDueSubscriptionEventBody() };
}

function activeSubscriptionUpdatedEventBody() {
  return {
    eventType: 'subscription.updated',
    data: {
      id: 'sub_paddle_456',
      status: 'active',
      customData: { userId: 'user_123' },
      items: [
        {
          price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
        },
      ],
      currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
    },
  };
}

export function createActiveSubscriptionUpdatedEvent(): ReturnType<
  typeof activeSubscriptionUpdatedEventBody
> & { delivery: PaddleEventDelivery } {
  return { delivery: TEST_PADDLE_DELIVERY, ...activeSubscriptionUpdatedEventBody() };
}

/** An unscoped provider reference is resolved by the privileged owner lookup, not an ambient read. */
export function expectProviderSubscriptionReferenceLookup(
  hoisted: ReturnType<typeof createHoistedPaddleHandlerMocks>,
  providerSubscriptionId: string
) {
  expect(hoisted.resolution.resolvePaddleSubscriptionOwner).toHaveBeenCalledWith(
    providerSubscriptionId
  );
}

export function mockRacedSubscriptionInsert(
  hoisted: ReturnType<typeof createHoistedPaddleHandlerMocks>
): RacedSubscriptionInsertMocks {
  const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
  const mockWhere = vi
    .fn()
    .mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'sub' }]) });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });

  hoisted.db.update.mockReturnValue({ set: mockSet });
  hoisted.db.insert.mockReturnValue({
    values: vi.fn().mockRejectedValue(uniqueViolation),
  });
  hoisted.tx.update.mockReturnValue({ set: mockSet });
  hoisted.tx.insert.mockReturnValue({
    values: vi.fn().mockRejectedValue(uniqueViolation),
  });

  return { mockSet, mockWhere };
}

export function resetPaddleHandlerMocks(
  hoisted: ReturnType<typeof createHoistedPaddleHandlerMocks>
) {
  vi.clearAllMocks();
  hoisted.selectResults.length = 0;
  hoisted.db.query.user.findFirst.mockReset();
  hoisted.identity.hasTenantMemberCredential.mockReset().mockResolvedValue(false);
  hoisted.identity.issueTenantMemberNumber
    .mockReset()
    .mockResolvedValue({ memberNumber: 'MEM-2026-000123', isNew: true });
  hoisted.db.query.subscriptions.findFirst.mockReset();
  hoisted.db.query.tenantSettings.findFirst.mockReset();
  hoisted.db.query.webhookEvents.findFirst.mockReset();
  for (const resolver of Object.values(hoisted.resolution)) resolver.mockReset();
  hoisted.resolution.authorizePaddleTenant.mockImplementation(authorizeTestPaddleOwner);
  hoisted.resolution.authorizePaddleBillingTenant.mockImplementation(
    authorizeAnyTestPaddleBillingTenant
  );
  // Unknown references resolve to nothing until a test names an owner.
  hoisted.resolution.resolvePaddleSubscriptionOwner.mockResolvedValue(null);
  hoisted.resolution.resolvePaddleUserOwner.mockResolvedValue(null);
  hoisted.resolution.resolvePaddleCustomerEmailOwner.mockResolvedValue(null);
  hoisted.resolution.readVerifiedPaddleTransactionEvidence.mockResolvedValue(null);
  hoisted.db.query.agentClients.findFirst.mockReset();
  hoisted.db.query.membershipPlans.findFirst.mockReset();
  hoisted.db.select.mockImplementation(() => ({
    from: createQueuedFromMock(vi.fn, hoisted.selectResults),
  }));
  hoisted.db.transaction.mockImplementation(async callback => callback(hoisted.tx));
  // Default tenant context: writes/selects land on the transaction mock, reads on db.query.
  hoisted.withTenantContext.mockImplementation(
    async (_context, callback) => await callback(hoisted.tx)
  );
  hoisted.db.insert.mockImplementation(() => ({
    values: vi.fn().mockResolvedValue(undefined),
  }));
  hoisted.db.query.agentClients.findFirst.mockResolvedValue(null);
  hoisted.db.query.membershipPlans.findFirst.mockResolvedValue(null);
  hoisted.db.update.mockImplementation(() => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }));
  hoisted.tx.insert.mockImplementation(() => ({
    values: hoisted.insertedUserValues,
  }));
  // Plan lookups (annual membership) now run in a tenant context and still consume the queued
  // `selectResults`; every other select keeps the provider-order check shape.
  const queuedPlanFrom = createQueuedFromMock(vi.fn, hoisted.selectResults) as (
    table: unknown
  ) => unknown;
  hoisted.tx.select.mockImplementation(() => ({
    from: (table: unknown) =>
      table === hoisted.membershipPlans
        ? queuedPlanFrom(table)
        : {
            where: () => Promise.resolve([{ hasInvalid: null, hasNewer: null, hasEqual: null }]),
          },
  }));
  hoisted.insertedUserValues.mockReturnValue({
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  });
  hoisted.tx.update.mockImplementation(() => ({
    set: hoisted.updatedUserValues,
  }));
  hoisted.updatedUserValues.mockReturnValue({
    where: () => ({ returning: async () => [{ id: 'sub' }] }),
  });
}

/** Route tenant-context callbacks to the ambient db mock for handlers that never used a transaction. */
export function routeTenantContextToDbMock(
  hoisted: ReturnType<typeof createHoistedPaddleHandlerMocks>
) {
  hoisted.withTenantContext.mockImplementation(
    async (_context, callback) => await callback(hoisted.db)
  );
}
