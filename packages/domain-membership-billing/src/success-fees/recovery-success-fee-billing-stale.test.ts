import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const table = (name: string) =>
    new Proxy({}, { get: (_target, prop) => `${name}.${String(prop)}` });
  return {
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    claimEscalationAgreements: table('agreement'),
    domainEventDeliveries: table('deliveries'),
    domainEventDeliveryIdempotencyKey: vi.fn((eventId: string) => `key:${eventId}`),
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
vi.mock('../subscription', () => ({
  resolveProviderSubscriptionHandle: (sub: {
    id: string;
    providerSubscriptionId?: string | null;
  }) => sub.providerSubscriptionId || sub.id,
}));

import { relayRecoverySuccessFeeBillingEvents } from './recovery-success-fee-billing';

type RelayTx = Parameters<typeof relayRecoverySuccessFeeBillingEvents>[0];

function event(id: string, aggregateVersion: number) {
  return {
    actorId: 'staff-1',
    actorRole: 'staff',
    aggregateVersion,
    correlationId: id,
    createdAt: new Date('2026-06-01T10:00:00Z'),
    entityId: 'claim-1',
    entityType: 'claim',
    eventName: 'recovery.success_fee_collected',
    eventVersion: 1,
    id,
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
}

function rowsQuery(rows: unknown[]) {
  return { limit: () => Promise.resolve(rows) };
}

function whereRows(rows: unknown[]) {
  return { where: () => rowsQuery(rows) };
}

function snapshotQuery(row: unknown) {
  return { leftJoin: () => ({ where: () => rowsQuery([row]) }) };
}

function fakeTx(newerRows: unknown[][]): RelayTx {
  const snapshotRow = {
    collectionMethod: 'payment_method_charge',
    currencyCode: 'EUR',
    feeAmount: '25.00',
    invoiceDueAt: null,
    paymentAuthorizationState: 'authorized',
    providerCustomerId: 'ctm_123',
    providerSubscriptionId: 'sub_paddle_123',
    subscriptionId: 'sub-1',
  };
  return {
    select: vi.fn(() => ({
      from: (table: unknown) => {
        if (table === dbMocks.domainEvents) {
          return whereRows(newerRows.shift() ?? []);
        }
        if (table === dbMocks.domainEventDeliveries) {
          return whereRows([]);
        }
        return snapshotQuery(snapshotRow);
      },
    })),
    execute: vi.fn(),
  } as unknown as RelayTx;
}

describe('relayRecoverySuccessFeeBillingEvents stale event suppression', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records stale older collection events without charging Paddle', async () => {
    const older = event('event-1', 1);
    const newer = event('event-2', 2);
    const billSuccessFee = vi
      .fn()
      .mockResolvedValue({ status: 'paddle_subscription_charge_created' });
    dbMocks.selectDomainEventsForRelay.mockResolvedValueOnce([older, newer]);
    dbMocks.recordDomainEventDelivery.mockResolvedValue({ status: 'delivered' });

    const result = await relayRecoverySuccessFeeBillingEvents(fakeTx([[{ id: 'event-2' }], []]), {
      deps: { billSuccessFee },
      limit: 10,
      tenantId: 'tenant_ks',
    });

    expect(billSuccessFee).toHaveBeenCalledTimes(1);
    expect(billSuccessFee).toHaveBeenCalledWith(expect.objectContaining({ event: newer }));
    expect(dbMocks.recordDomainEventDelivery).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ delivered: 1, selected: 2, skippedStale: 1 });
  });
});
