import './extras.test-support';
import { db } from '@interdomestik/database';
import { beforeEach, vi, type Mock } from 'vitest';
import { createMemberReferralRewardCore } from '../../../../../domain-referrals/src';
import { createCommissionWithDispositionCore } from '../../../commissions/create';
import { handleNewSubscriptionExtras } from './extras';

const handleCreatedSubscriptionExtras = (
  args: Omit<Parameters<typeof handleNewSubscriptionExtras>[0], 'eventType'>
) =>
  handleNewSubscriptionExtras({
    eventType: 'subscription.created',
    ...args,
  });

const mockDeps: { logAuditEvent: Mock } = {
  logAuditEvent: vi.fn(),
};

const mockSub = {
  id: 'sub_123',
  status: 'active',
  items: [
    {
      price: {
        name: 'Annual membership',
        unitPrice: { amount: '2000', currencyCode: 'EUR' },
      },
    },
  ],
  billingCycle: { frequency: 1, interval: 'year' },
  currentBillingPeriod: {
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2027-01-01T00:00:00Z',
  },
};

const mockUserRecord = {
  email: 'test@example.com',
  name: 'Test Member',
  memberNumber: 'M-123',
};

const tx: { insert: Mock; update: Mock; query: typeof db.query } = {
  insert: vi.fn(),
  update: vi.fn(),
  query: db.query,
};

const insertValues: Mock = vi.fn();

const onConflictDoUpdate: Mock = vi.fn();

const updateWhere: Mock = vi.fn();

export function installExtrasHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default success mocks
    (db.query.agentSettings.findFirst as any).mockResolvedValue(null);
    (db.transaction as any).mockImplementation(
      async (callback: (trx: typeof tx) => Promise<unknown> | unknown) => callback(tx)
    );
    tx.insert.mockImplementation(() => ({
      values: insertValues,
    }));
    insertValues.mockReturnValue({
      onConflictDoUpdate,
    });
    onConflictDoUpdate.mockResolvedValue(undefined);
    tx.update.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: updateWhere,
      }),
    }));
    updateWhere.mockResolvedValue(undefined);
    (createCommissionWithDispositionCore as any).mockResolvedValue({
      success: true,
      data: { id: 'comm_1', created: true },
    });
    (db.query.referrals.findFirst as any).mockResolvedValue(null);
    (createMemberReferralRewardCore as any).mockResolvedValue({
      success: true,
      data: { kind: 'no-op', created: false, reason: 'no_referral' },
    });
  });
}

export {
  handleCreatedSubscriptionExtras,
  mockDeps,
  mockSub,
  mockUserRecord,
  tx,
  insertValues,
  onConflictDoUpdate,
  updateWhere,
};
