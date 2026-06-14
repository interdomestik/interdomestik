import { describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const table = (name: string) =>
    new Proxy({}, { get: (_target, prop) => `${name}.${String(prop)}` });
  return {
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    claims: table('claims'),
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
  const query = {
    innerJoin: () => query,
    leftJoin: () => query,
    where: () => rowsQuery(rows),
  };
  return query;
}

function fakeTx(overrides: Record<string, unknown> = {}): SnapshotTx {
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
            recoveryLegalTenantId: 'tenant_mk',
            subscriptionId: 'sub-1',
            subscriptionBillingEntity: 'mk',
            subscriptionLegalTenantId: 'tenant_mk',
            subscriptionTenantId: 'tenant_foreign',
            ...overrides,
          },
        ]),
    })),
  } as unknown as SnapshotTx;
}

describe('resolveSuccessFeeBillingSnapshot', () => {
  it('scopes the snapshot and subscription lookup to the event tenant', async () => {
    await expect(resolveSuccessFeeBillingSnapshot(fakeTx(), event)).resolves.toEqual(
      expect.objectContaining({
        billingEntity: 'mk',
        claimId: 'claim-1',
        providerSubscriptionId: 'sub_paddle_123',
        recoveryLegalTenantId: 'tenant_mk',
        subscriptionBillingEntity: 'mk',
        tenantId: 'tenant_foreign',
      })
    );

    expect(dbMocks.eq).toHaveBeenCalledWith('agreement.tenantId', 'tenant_foreign');
    expect(dbMocks.eq).toHaveBeenCalledWith('agreement.claimId', 'claim-1');
    expect(dbMocks.eq).toHaveBeenCalledWith('claims.tenantId', 'tenant_foreign');
    expect(dbMocks.eq).toHaveBeenCalledWith('subscriptions.tenantId', 'tenant_foreign');
  });

  it('treats missing recovery legal tenant as an unavailable billing snapshot', async () => {
    await expect(
      resolveSuccessFeeBillingSnapshot(fakeTx({ recoveryLegalTenantId: null }), event)
    ).rejects.toThrow('success-fee billing snapshot is unavailable for collected event');
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
