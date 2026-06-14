import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const table = (name: string) =>
    new Proxy({}, { get: (_target, prop) => `${name}.${String(prop)}` });
  return {
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    claimEscalationAgreements: table('agreement'),
    domainEventDeliveries: table('deliveries'),
    domainEventDeliveryIdempotencyKey: vi.fn(
      (eventId: string, consumerName: string) => `domain-event:${consumerName}:${eventId}`
    ),
    domainEvents: table('events'),
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    recordDomainEventDelivery: vi.fn(),
    selectDomainEventsForRelay: vi.fn(),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    subscriptions: table('subscriptions'),
  };
});

vi.mock('@interdomestik/database', () => dbMocks);
vi.mock('../paddle-server', () => ({ getPaddle: vi.fn() }));
type Sub = { id: string; providerSubscriptionId?: string | null };
vi.mock('../subscription', () => ({
  resolveProviderSubscriptionHandle: (sub: Sub) => sub.providerSubscriptionId || sub.id,
}));

import {
  RECOVERY_SUCCESS_FEE_BILLING_CONSUMER,
  relayRecoverySuccessFeeBillingEvents,
} from './recovery-success-fee-billing';

type RelayTx = Parameters<typeof relayRecoverySuccessFeeBillingEvents>[0];
const event = {
  aggregateVersion: 1,
  createdAt: new Date('2026-06-01T10:00:00Z'),
  entityId: 'claim-1',
  entityType: 'claim',
  eventName: 'recovery.success_fee_collected',
  eventVersion: 1,
  id: 'event-1',
  payload: {
    collectionMethod: 'payment_method_charge',
    currencyCode: 'EUR',
    deductionAllowed: false,
    hasInvoiceDueDate: false,
    hasStoredPaymentMethod: true,
    paymentAuthorizationState: 'authorized',
  },
  tenantId: 'tenant_ks',
};

const rowsQuery = (rows: unknown[]) => ({ limit: () => Promise.resolve(rows) });
const whereRows = (rows: unknown[]) => ({ where: () => rowsQuery(rows) });
const snapshotQuery = (rows: unknown[]) => ({ leftJoin: () => ({ where: () => rowsQuery(rows) }) });

function snapshotRow(overrides: Record<string, unknown> = {}) {
  return {
    collectionMethod: 'payment_method_charge',
    currencyCode: 'EUR',
    feeAmount: '15.50',
    invoiceDueAt: null,
    paymentAuthorizationState: 'authorized',
    providerCustomerId: 'ctm_123',
    providerSubscriptionId: 'sub_paddle_123',
    subscriptionId: 'sub-1',
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
          providerCustomerId: 'ctm_123',
          providerSubscriptionId: 'sub_paddle_123',
          tenantId: 'tenant_ks',
        }),
      })
    );
    expect(dbMocks.recordDomainEventDelivery).toHaveBeenCalledTimes(1);
    expect(result.billingResults).toEqual([{ status: 'skipped_deduction' }]);
    expect(result).toMatchObject({ delivered: 1, selected: 1, skippedAlreadyDelivered: 0 });
  });

  it('skips Paddle work when replay selects an already delivered event', async () => {
    const billSuccessFee = vi.fn();
    dbMocks.selectDomainEventsForRelay.mockResolvedValueOnce([event]);
    const result = await relayRecoverySuccessFeeBillingEvents(
      fakeTx({ deliveryRows: [{ id: 'delivery-1' }] }),
      { deps: { billSuccessFee }, limit: 10, mode: 'replay', tenantId: 'tenant_ks' }
    );

    expect(billSuccessFee).not.toHaveBeenCalled();
    expect(dbMocks.recordDomainEventDelivery).not.toHaveBeenCalled();
    expect(result.skippedAlreadyDelivered).toBe(1);
  });

  it('rejects payload and snapshot mismatches before marking delivery', async () => {
    const badEvent = { ...event, payload: { ...event.payload, currencyCode: 'USD' } };
    dbMocks.selectDomainEventsForRelay.mockResolvedValueOnce([badEvent]);

    await expect(
      relayRecoverySuccessFeeBillingEvents(
        fakeTx({ snapshotRows: [snapshotRow({ currencyCode: 'EUR' })] }),
        { deps: { billSuccessFee: vi.fn() }, limit: 10, tenantId: 'tenant_ks' }
      )
    ).rejects.toThrow(/snapshot does not match/);
    expect(dbMocks.recordDomainEventDelivery).not.toHaveBeenCalled();
  });
});
