import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveSuccessFeeCollectionCore } from './save-success-fee-collection';

const mocks = vi.hoisted(() => {
  const chain = () => ({ from: vi.fn(), where: vi.fn(), limit: vi.fn() });
  const table = (name: string) =>
    new Proxy({}, { get: (_target, prop) => `${name}.${String(prop)}` });
  const claimSelect = chain();
  const agreementSelect = chain();
  const subscriptionSelect = chain();
  const txUpdate = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));
  const txSelect = vi.fn();

  return {
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
    claimEscalationAgreements: table('agreement'),
    claims: table('claims'),
    db: { transaction: vi.fn(async cb => cb({ select: txSelect, update: txUpdate })) },
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    subscriptions: table('subscriptions'),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    agreementSelect,
    claimSelect,
    subscriptionSelect,
    txSelect,
    txUpdate,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  appendEvent: mocks.appendEvent,
  claimEscalationAgreements: mocks.claimEscalationAgreements,
  claims: mocks.claims,
  db: mocks.db,
  eq: mocks.eq,
  subscriptions: mocks.subscriptions,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

function session(role = 'staff') {
  return { user: { id: 'staff-1', role, tenantId: 'tenant-1' } };
}

function primeCollection(options: { paymentAuthorizationState?: string } = {}) {
  const selects = [mocks.claimSelect, mocks.agreementSelect, mocks.subscriptionSelect];
  for (const select of selects) {
    mocks.txSelect.mockReturnValueOnce(select);
    select.from.mockReturnValue(select);
    select.where.mockReturnValue(select);
  }
  mocks.claimSelect.limit.mockResolvedValue([
    { category: 'vehicle', currency: 'EUR', id: 'claim-1', userId: 'member-1' },
  ]);
  mocks.agreementSelect.limit.mockResolvedValue([
    {
      acceptedAt: new Date('2026-03-12T09:00:00Z'),
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member approved recovery.',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: '25.00',
      paymentAuthorizationState: options.paymentAuthorizationState ?? 'authorized',
      signedAt: new Date('2026-03-12T09:00:00Z'),
      termsVersion: '2026-03-v1',
    },
  ]);
  mocks.subscriptionSelect.limit.mockResolvedValue([{ id: 'sub-1', providerCustomerId: null }]);
}

function collect(overrides: Partial<Parameters<typeof saveSuccessFeeCollectionCore>[0]> = {}) {
  return saveSuccessFeeCollectionCore({
    claimId: 'claim-1',
    deductionAllowed: true,
    recoveredAmount: 100,
    session: session(),
    ...overrides,
  });
}

describe('saveSuccessFeeCollectionCore success-fee events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendEvent.mockResolvedValue({ id: 'event-1' });
  });

  it('emits a sanitized success-fee event in the collection transaction', async () => {
    const now = new Date('2026-03-12T09:00:00Z');
    primeCollection();

    await collect({ now });

    expect(mocks.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ select: mocks.txSelect, update: mocks.txUpdate }),
      expect.objectContaining({
        correlationId: 'claim:claim-1:recovery-success-fee-collected:deduction',
        eventName: 'recovery.success_fee_collected',
        payload: {
          collectionMethod: 'deduction',
          currencyCode: 'EUR',
          deductionAllowed: true,
          hasInvoiceDueDate: false,
          hasStoredPaymentMethod: false,
          paymentAuthorizationState: 'authorized',
        },
        tenantId: 'tenant-1',
      })
    );
  });

  it('records invoice fallback shape without amount, date, or subscription identifiers', async () => {
    primeCollection({ paymentAuthorizationState: 'revoked' });

    await collect({
      deductionAllowed: false,
      now: new Date('2026-03-12T09:00:00Z'),
      recoveredAmount: 1000,
    });

    expect(mocks.appendEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        correlationId: 'claim:claim-1:recovery-success-fee-collected:invoice',
        payload: {
          collectionMethod: 'invoice',
          currencyCode: 'EUR',
          deductionAllowed: false,
          hasInvoiceDueDate: true,
          hasStoredPaymentMethod: false,
          paymentAuthorizationState: 'revoked',
        },
      })
    );
  });

  it('fails the action when the success-fee event cannot be appended', async () => {
    mocks.appendEvent.mockRejectedValueOnce(new Error('domain event append failed'));
    primeCollection();

    await expect(collect()).resolves.toEqual({
      success: false,
      error: 'Failed to save success-fee collection',
    });
  });
});
