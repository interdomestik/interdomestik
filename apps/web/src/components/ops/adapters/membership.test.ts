import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMembershipActions,
  getSponsoredMembershipState,
  toOpsStatus,
  toOpsTimelineEvents,
} from './membership';

const baseDate = new Date('2026-03-15T00:00:00.000Z');
const dayMs = 24 * 60 * 60 * 1000;

describe('Membership Adapter Policies', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getMembershipActions', () => {
    const mockT = (key: string) => key;
    type TestSubscription = NonNullable<Parameters<typeof getMembershipActions>[0]>;

    const buildSubscription = (overrides: Partial<TestSubscription> = {}): TestSubscription => ({
      id: 'sub-1',
      status: 'active',
      createdAt: baseDate,
      currentPeriodEnd: new Date(baseDate.getTime() + 60 * dayMs),
      ...overrides,
    });

    it('should return empty actions when subscription is undefined', () => {
      const result = getMembershipActions(undefined, mockT);
      expect(result).toEqual({ secondary: [] });
    });

    describe('past_due status - should show update payment primary', () => {
      it('should return update_payment as primary action', () => {
        const sub = buildSubscription({
          status: 'past_due',
          currentPeriodEnd: new Date(baseDate.getTime() + 30 * dayMs),
        });

        const result = getMembershipActions(sub, mockT);

        expect(result.primary).toBeDefined();
        expect(result.primary?.id).toBe('update_payment');
        expect(result.primary?.label).toBe('Update Payment Method');
      });

      it('should allow cancellation for past_due subscription', () => {
        const sub = buildSubscription({ status: 'past_due', currentPeriodEnd: null });

        const result = getMembershipActions(sub, mockT);
        expect(result.secondary.some(a => a.id === 'cancel')).toBe(true);
      });
    });

    describe('active status with renewal approaching', () => {
      it.each([
        {
          description: 'shows renew as primary when within 30 days of period end',
          daysToRenewal: 15,
          expectedPrimary: 'renew',
        },
        {
          description: 'does not show renew when more than 30 days from period end',
          daysToRenewal: 60,
          expectedPrimary: undefined,
        },
      ])('$description', ({ daysToRenewal, expectedPrimary }) => {
        const sub = buildSubscription({
          currentPeriodEnd: new Date(baseDate.getTime() + daysToRenewal * dayMs),
        });

        const result = getMembershipActions(sub, mockT);
        expect(result.primary?.id).toBe(expectedPrimary);
      });

      it('should allow cancellation for active subscription not already canceled', () => {
        const sub = buildSubscription();

        const result = getMembershipActions(sub, mockT);
        expect(result.secondary.some(a => a.id === 'cancel')).toBe(true);
      });
    });

    describe('already canceled subscription', () => {
      it.each([
        {
          description: 'does not allow cancellation if already canceledAt',
          overrides: { canceledAt: baseDate },
        },
        {
          description: 'does not allow cancellation if cancelAtPeriodEnd is true',
          overrides: { cancelAtPeriodEnd: true },
        },
      ])('$description', ({ overrides }) => {
        const sub = buildSubscription(overrides);

        const result = getMembershipActions(sub, mockT);
        expect(result.secondary.some(a => a.id === 'cancel')).toBe(false);
      });
    });

    describe('trialing/inactive statuses', () => {
      it('should not show cancel for trialing if not active or past_due', () => {
        const sub = buildSubscription({ status: 'trialing', currentPeriodEnd: null });

        const result = getMembershipActions(sub, mockT);
        // trialing is not in (active, past_due) so no cancel
        expect(result.secondary.some(a => a.id === 'cancel')).toBe(false);
      });
    });
  });

  describe('toOpsStatus', () => {
    it('should format null status as NONE', () => {
      const result = toOpsStatus(null);
      expect(result.label).toBe('NONE');
    });

    it('should format undefined status as NONE', () => {
      const result = toOpsStatus(undefined);
      expect(result.label).toBe('NONE');
    });

    it('should format past_due correctly', () => {
      const result = toOpsStatus('past_due');
      expect(result.label).toBe('PAST DUE');
    });
  });

  describe('toOpsTimelineEvents', () => {
    it('should return empty array for undefined subscription', () => {
      const result = toOpsTimelineEvents(undefined);
      expect(result).toEqual([]);
    });

    it('should create created event from subscription', () => {
      const sub = {
        id: 'sub-1',
        status: 'active',
        createdAt: new Date('2024-01-01'),
        currentPeriodEnd: null,
      };

      const result = toOpsTimelineEvents(sub);
      expect(result.some(e => e.title === 'Membership Created')).toBe(true);
    });

    it('should create canceled event if canceledAt exists', () => {
      const sub = {
        id: 'sub-1',
        status: 'canceled',
        createdAt: new Date('2024-01-01'),
        currentPeriodEnd: null,
        canceledAt: new Date('2024-02-01'),
      };

      const result = toOpsTimelineEvents(sub);
      expect(result.some(e => e.title === 'Canceled')).toBe(true);
    });
  });

  describe('getSponsoredMembershipState', () => {
    const buildSponsoredSubscription = (
      overrides: Partial<NonNullable<Parameters<typeof getSponsoredMembershipState>[0]>> = {}
    ) => ({
      id: 'sub-1',
      status: 'active',
      planId: 'standard',
      provider: 'group_sponsor',
      acquisitionSource: 'group_roster_import',
      createdAt: baseDate,
      currentPeriodEnd: null,
      ...overrides,
    });

    it.each([
      {
        description: 'returns activation_required for paused sponsored subscriptions',
        overrides: { status: 'paused' },
        expected: 'activation_required',
      },
      {
        description:
          'returns eligible_for_family_upgrade for active sponsored standard subscriptions',
        overrides: {},
        expected: 'eligible_for_family_upgrade',
      },
      {
        description: 'returns none for non-sponsored subscriptions',
        overrides: { provider: 'paddle', acquisitionSource: 'checkout' },
        expected: 'none',
      },
    ])('$description', ({ overrides, expected }) => {
      expect(getSponsoredMembershipState(buildSponsoredSubscription(overrides))).toBe(expected);
    });
  });
});
