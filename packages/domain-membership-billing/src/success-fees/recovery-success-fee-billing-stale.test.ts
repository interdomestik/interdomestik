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
vi.mock('../subscription', () => ({
  resolveProviderSubscriptionHandle: (sub: {
    id: string;
    providerSubscriptionId?: string | null;
  }) => sub.providerSubscriptionId || sub.id,
}));

import { relayRecoverySuccessFeeBillingEvents } from './recovery-success-fee-billing';
import { successFeeCollectedEvent } from './paddle-success-fee-test-helpers';

type RelayTx = Parameters<typeof relayRecoverySuccessFeeBillingEvents>[0];

function event(id: string, aggregateVersion: number) {
  return successFeeCollectedEvent({
    actorId: 'staff-1',
    actorRole: 'staff',
    aggregateVersion,
    correlationId: id,
    id,
  });
}

function rowsQuery(rows: unknown[]) {
  return { limit: () => Promise.resolve(rows) };
}

function whereRows(rows: unknown[]) {
  return { where: () => rowsQuery(rows) };
}

function snapshotQuery(row: unknown) {
  const query = {
    innerJoin: () => query,
    leftJoin: () => query,
    where: () => rowsQuery([row]),
  };
  return query;
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
    recoveryLegalTenantId: 'tenant_ks',
    subscriptionId: 'sub-1',
    subscriptionBillingEntity: 'ks',
    subscriptionLegalTenantId: 'tenant_ks',
    subscriptionTenantId: 'tenant_ks',
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
