import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = await vi.hoisted(async () => {
  const helper = await import('./paddle-success-fee-test-helpers');
  return helper.createRecoverySuccessFeeDbMocks();
});

vi.mock('@interdomestik/database', () => dbMocks);
vi.mock('../paddle-server', async () => {
  const actual = await vi.importActual<typeof import('../paddle-server')>('../paddle-server');
  return { ...actual, getPaddle: vi.fn() };
});
type Sub = { id: string; providerSubscriptionId?: string | null };
vi.mock('../subscription', () => ({
  resolveProviderSubscriptionHandle: (sub: Sub) => sub.providerSubscriptionId || sub.id,
}));

import {
  RECOVERY_SUCCESS_FEE_BILLING_CONSUMER,
  relayRecoverySuccessFeeBillingEvents,
} from './recovery-success-fee-billing';
import { successFeeCollectedEvent } from './paddle-success-fee-test-helpers';

type RelayTx = Parameters<typeof relayRecoverySuccessFeeBillingEvents>[0];
const event = successFeeCollectedEvent();

const rowsQuery = (rows: unknown[]) => ({ limit: () => Promise.resolve(rows) });
const whereRows = (rows: unknown[]) => ({ where: () => rowsQuery(rows) });
const snapshotQuery = (rows: unknown[]) => {
  const query = {
    innerJoin: () => query,
    leftJoin: () => query,
    where: () => rowsQuery(rows),
  };
  return query;
};

function snapshotRow(overrides: Record<string, unknown> = {}) {
  return {
    collectionMethod: 'payment_method_charge',
    currencyCode: 'EUR',
    feeAmount: '15.50',
    invoiceDueAt: null,
    paymentAuthorizationState: 'authorized',
    providerCustomerId: 'ctm_123',
    providerSubscriptionId: 'sub_paddle_123',
    recoveryLegalTenantId: 'tenant_ks',
    subscriptionId: 'sub-1',
    subscriptionBillingEntity: 'ks',
    subscriptionLegalTenantId: 'tenant_ks',
    subscriptionTenantId: 'tenant_ks',
    ...overrides,
  };
}

function fakeTx(options: { deliveryRows?: unknown[]; snapshotRows?: unknown[] } = {}): RelayTx {
  return {
    select: vi.fn(() => ({
      from: (table: unknown) => {
        if (table === dbMocks.domainEventDeliveries) {
          return whereRows(options.deliveryRows ?? []);
        }
        if (table === dbMocks.domainEvents) {
          return whereRows([]);
        }
        return snapshotQuery(options.snapshotRows ?? [snapshotRow()]);
      },
    })),
    execute: vi.fn(),
  } as unknown as RelayTx;
}
describe('relayRecoverySuccessFeeBillingEvents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bills an undelivered recovery.success_fee_collected@1 event then records delivery', async () => {
    const billSuccessFee = vi.fn().mockResolvedValue({ status: 'skipped_deduction' });
    const tx = fakeTx();
    dbMocks.selectDomainEventsForRelay.mockResolvedValueOnce([event]);
    dbMocks.recordDomainEventDelivery.mockResolvedValueOnce({ status: 'delivered' });

    const result = await relayRecoverySuccessFeeBillingEvents(tx, {
      deps: { billSuccessFee },
      limit: 10,
      tenantId: 'tenant_ks',
    });

    expect(dbMocks.selectDomainEventsForRelay).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        consumerName: RECOVERY_SUCCESS_FEE_BILLING_CONSUMER,
        tenantId: 'tenant_ks',
      })
    );
    expect(billSuccessFee).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `domain-event:${RECOVERY_SUCCESS_FEE_BILLING_CONSUMER}:event-1`,
        snapshot: expect.objectContaining({
          billingEntity: 'ks',
          providerCustomerId: 'ctm_123',
          providerSubscriptionId: 'sub_paddle_123',
          recoveryLegalTenantId: 'tenant_ks',
          tenantId: 'tenant_ks',
        }),
      })
    );
    expect(dbMocks.recordDomainEventDelivery).toHaveBeenCalledTimes(1);
    expect(result.billingResults).toEqual([{ status: 'skipped_deduction' }]);
    expect(result).toMatchObject({ delivered: 1, selected: 1, skippedAlreadyDelivered: 0 });
  });
});
