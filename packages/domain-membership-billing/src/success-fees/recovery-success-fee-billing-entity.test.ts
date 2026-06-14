import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = await vi.hoisted(async () => {
  const helper = await import('./paddle-success-fee-test-helpers');
  return helper.createRecoverySuccessFeeDbMocks();
});
const paddleServerMocks = vi.hoisted(() => ({ getPaddle: vi.fn() }));

vi.mock('@interdomestik/database', () => dbMocks);
vi.mock('../paddle-server', async () => {
  const actual = await vi.importActual<typeof import('../paddle-server')>('../paddle-server');
  return { ...actual, getPaddle: paddleServerMocks.getPaddle };
});
vi.mock('../subscription', () => ({
  resolveProviderSubscriptionHandle: (sub: { id: string; providerSubscriptionId?: string }) =>
    sub.providerSubscriptionId || sub.id,
}));

import { getPaddle } from '../paddle-server';
import { relayRecoverySuccessFeeBillingEvents } from './recovery-success-fee-billing';
import { paddleMock, successFeeCollectedEvent } from './paddle-success-fee-test-helpers';

type RelayTx = Parameters<typeof relayRecoverySuccessFeeBillingEvents>[0];
const event = successFeeCollectedEvent({}, { collectionMethod: 'deduction' });

const rowsQuery = (rows: unknown[]) => ({ limit: () => Promise.resolve(rows) });
const whereRows = (rows: unknown[]) => ({ where: () => rowsQuery(rows) });

function fakeTx(
  options: {
    deliveryRows?: unknown[];
    snapshotCurrency?: string;
    snapshotOverrides?: Record<string, unknown>;
  } = {}
): RelayTx {
  const snapshotRow = {
    collectionMethod: 'deduction',
    currencyCode: options.snapshotCurrency ?? 'EUR',
    feeAmount: '15.50',
    invoiceDueAt: null,
    paymentAuthorizationState: 'authorized',
    providerCustomerId: 'ctm_123',
    providerSubscriptionId: 'sub_paddle_123',
    recoveryLegalTenantId: 'tenant_mk',
    subscriptionId: 'sub-1',
    subscriptionBillingEntity: 'mk',
    subscriptionLegalTenantId: 'tenant_mk',
    subscriptionTenantId: 'tenant_ks',
    ...options.snapshotOverrides,
  };
  const snapshotQuery = {
    innerJoin: () => snapshotQuery,
    leftJoin: () => snapshotQuery,
    where: () => rowsQuery([snapshotRow]),
  };
  return {
    select: vi.fn(() => ({
      from: (table: unknown) => {
        if (table === dbMocks.domainEvents) return whereRows([]);
        if (table === dbMocks.domainEventDeliveries) return whereRows(options.deliveryRows ?? []);
        return snapshotQuery;
      },
    })),
    execute: vi.fn(),
  } as unknown as RelayTx;
}

describe('relayRecoverySuccessFeeBillingEvents recovery entity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the recovery legal tenant entity when constructing the Paddle client', async () => {
    dbMocks.selectDomainEventsForRelay.mockResolvedValueOnce([event]);
    dbMocks.recordDomainEventDelivery.mockResolvedValueOnce({ status: 'delivered' });

    const result = await relayRecoverySuccessFeeBillingEvents(fakeTx(), {
      limit: 10,
      tenantId: 'tenant_ks',
    });

    expect(getPaddle).toHaveBeenCalledWith({ entity: 'mk' });
    expect(result.billingResults).toEqual([{ status: 'skipped_deduction' }]);
    expect(result).toMatchObject({ delivered: 1, selected: 1 });
  });

  it('invoices in the recovery entity when the stored payment subscription belongs elsewhere', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'txn_invoice' });
    const createOneTimeCharge = vi.fn();
    paddleServerMocks.getPaddle.mockReturnValue(paddleMock({ create, createOneTimeCharge }));
    dbMocks.selectDomainEventsForRelay.mockResolvedValueOnce([successFeeCollectedEvent()]);
    dbMocks.recordDomainEventDelivery.mockResolvedValueOnce({ status: 'delivered' });

    const result = await relayRecoverySuccessFeeBillingEvents(
      fakeTx({
        snapshotOverrides: {
          collectionMethod: 'payment_method_charge',
          subscriptionBillingEntity: 'ks',
          subscriptionLegalTenantId: 'tenant_ks',
        },
      }),
      { limit: 10, tenantId: 'tenant_ks' }
    );

    expect(getPaddle).toHaveBeenCalledWith({ entity: 'mk' });
    expect(createOneTimeCharge).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ collectionMode: 'manual', status: 'billed' })
    );
    expect(result.billingResults).toEqual([
      { providerTransactionId: 'txn_invoice', status: 'paddle_invoice_billed' },
    ]);
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
      relayRecoverySuccessFeeBillingEvents(fakeTx({ snapshotCurrency: 'EUR' }), {
        deps: { billSuccessFee: vi.fn() },
        limit: 10,
        tenantId: 'tenant_ks',
      })
    ).rejects.toThrow(/snapshot does not match/);
    expect(dbMocks.recordDomainEventDelivery).not.toHaveBeenCalled();
  });
});
