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

    it('should return a primary recovery action when subscription is undefined', () => {
      const result = getMembershipActions(undefined, mockT);
      expect(result.primary).toEqual(
        expect.objectContaining({
          id: 'complete_membership',
          label: 'ops.complete_membership',
          variant: 'default',
        })
      );
      expect(result.secondary).toEqual([]);
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
    const timelineT = (key: string) => key;

    it('should return empty array for undefined subscription', () => {
      const result = toOpsTimelineEvents(undefined, timelineT);
      expect(result).toEqual([]);
    });

    it('should create a localized created event from subscription', () => {
      const sub = {
        id: 'sub-1',
        status: 'active',
        createdAt: new Date('2024-01-01'),
        currentPeriodEnd: null,
      };

      const result = toOpsTimelineEvents(sub, timelineT);
      expect(result.some(e => e.title === 'timeline.created_title')).toBe(true);
    });

    it('should create a localized canceled event if canceledAt exists', () => {
      const sub = {
        id: 'sub-1',
        status: 'canceled',
        createdAt: new Date('2024-01-01'),
        currentPeriodEnd: null,
        canceledAt: new Date('2024-02-01'),
      };

      const result = toOpsTimelineEvents(sub, timelineT);
      expect(result.some(e => e.title === 'timeline.canceled_title')).toBe(true);
    });

    it('never labels a future period end as a renewal', () => {
      const sub = {
        id: 'sub-1',
        status: 'active',
        createdAt: baseDate,
        currentPeriodEnd: new Date(baseDate.getTime() + 30 * dayMs),
      };

      const result = toOpsTimelineEvents(sub, timelineT);
      const cycleEvent = result.find(e => e.id === 'sub-1-cycle');
      expect(cycleEvent?.title).toBe('timeline.period_end_title');
      expect(result.some(e => /renew/i.test(e.title))).toBe(false);
    });

    it('labels a past period end as ended rather than implying a renewal', () => {
      const sub = {
        id: 'sub-1',
        status: 'past_due',
        createdAt: baseDate,
        currentPeriodEnd: new Date(baseDate.getTime() - 5 * dayMs),
      };

      const result = toOpsTimelineEvents(sub, timelineT);
      const cycleEvent = result.find(e => e.id === 'sub-1-cycle');
      expect(cycleEvent?.title).toBe('timeline.period_ended_title');
      expect(cycleEvent?.tone).toBe('warning');
    });

    it('keeps parseable timestamps so timeline ordering and locale display remain valid', () => {
      const sub = {
        id: 'sub-1',
        status: 'active',
        createdAt: new Date('2026-03-15T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
      };

      const result = toOpsTimelineEvents(sub, timelineT);
      expect(result.map(event => event.id)).toEqual(['sub-1-cycle', 'sub-1-created']);
      expect(result.every(event => Number.isFinite(Date.parse(event.date)))).toBe(true);
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
