import { describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const table = (name: string) =>
    new Proxy({}, { get: (_target, prop) => `${name}.${String(prop)}` });
  return {
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    claimEscalationAgreements: table('agreement'),
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    subscriptions: table('subscriptions'),
  };
});

vi.mock('@interdomestik/database', () => dbMocks);
vi.mock('../subscription', () => ({
  resolveProviderSubscriptionHandle: (sub: {
    id: string;
    providerSubscriptionId?: string | null;
  }) => sub.providerSubscriptionId || sub.id,
}));

import {
  requireSuccessFeePayload,
  resolveSuccessFeeBillingSnapshot,
} from './recovery-success-fee-snapshot';

type SnapshotEvent = Parameters<typeof resolveSuccessFeeBillingSnapshot>[1];
type SnapshotTx = Parameters<typeof resolveSuccessFeeBillingSnapshot>[0];

const event: SnapshotEvent = {
  actorId: 'staff-1',
  actorRole: 'staff',
  aggregateVersion: 1,
  correlationId: 'event-1',
  createdAt: new Date('2026-06-01T10:00:00Z'),
  entityId: 'claim-1',
  entityType: 'claim',
  eventName: 'recovery.success_fee_collected',
  eventVersion: 1,
  id: 'event-1',
  payload: {},
  tenantId: 'tenant_foreign',
};

function rowsQuery(rows: unknown[]) {
  return { limit: () => Promise.resolve(rows) };
}

function snapshotQuery(rows: unknown[]) {
  return { leftJoin: () => ({ where: () => rowsQuery(rows) }) };
}

function fakeTx(): SnapshotTx {
  return {
    select: vi.fn(() => ({
      from: () =>
        snapshotQuery([
          {
            collectionMethod: 'payment_method_charge',
            currencyCode: 'EUR',
            feeAmount: '15.50',
            invoiceDueAt: null,
            paymentAuthorizationState: 'authorized',
            providerCustomerId: 'ctm_123',
            providerSubscriptionId: 'sub_paddle_123',
            subscriptionId: 'sub-1',
          },
        ]),
    })),
  } as unknown as SnapshotTx;
}

describe('resolveSuccessFeeBillingSnapshot', () => {
  it('scopes the snapshot and subscription lookup to the event tenant', async () => {
    await expect(resolveSuccessFeeBillingSnapshot(fakeTx(), event)).resolves.toEqual(
      expect.objectContaining({
        claimId: 'claim-1',
        providerSubscriptionId: 'sub_paddle_123',
        tenantId: 'tenant_foreign',
      })
    );

    expect(dbMocks.eq).toHaveBeenCalledWith('agreement.tenantId', 'tenant_foreign');
    expect(dbMocks.eq).toHaveBeenCalledWith('agreement.claimId', 'claim-1');
    expect(dbMocks.eq).toHaveBeenCalledWith('subscriptions.tenantId', 'tenant_foreign');
  });

  it('rejects success-fee events missing boolean payload fields', () => {
    expect(() =>
      requireSuccessFeePayload({
        ...event,
        payload: {
          collectionMethod: 'payment_method_charge',
          currencyCode: 'EUR',
          paymentAuthorizationState: 'authorized',
        },
      })
    ).toThrow(/missing required payload fields/);
  });
});
