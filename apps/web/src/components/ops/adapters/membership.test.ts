import { describe, expect, it } from 'vitest';
import { getMembershipActions, toOpsStatus, toOpsTimelineEvents } from './membership';

describe('Membership Adapter Policies', () => {
  describe('getMembershipActions', () => {
    const mockT = (key: string) => key;

    it('should return empty actions when subscription is undefined', () => {
      const result = getMembershipActions(undefined, mockT);
      expect(result).toEqual({ secondary: [] });
    });

    describe('past_due status - should show update payment primary', () => {
      it('should return update_payment as primary action', () => {
        const sub = {
          id: 'sub-1',
          status: 'past_due',
          createdAt: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        };

        const result = getMembershipActions(sub, mockT);

        expect(result.primary).toBeDefined();
        expect(result.primary?.id).toBe('update_payment');
        expect(result.primary?.label).toBe('Update Payment Method');
      });

      it('should allow cancellation for past_due subscription', () => {
        const sub = {
          id: 'sub-1',
          status: 'past_due',
          createdAt: new Date(),
          currentPeriodEnd: null,
        };

        const result = getMembershipActions(sub, mockT);
        expect(result.secondary.some(a => a.id === 'cancel')).toBe(true);
      });
    });

    describe('active status with renewal approaching', () => {
      it('should show renew as primary when within 30 days of period end', () => {
        const sub = {
          id: 'sub-1',
          status: 'active',
          createdAt: new Date(),
          currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days out
        };

        const result = getMembershipActions(sub, mockT);

        expect(result.primary).toBeDefined();
        expect(result.primary?.id).toBe('renew');
        expect(result.primary?.label).toBe('Renew');
      });

      it('should NOT show renew when more than 30 days from period end', () => {
        const sub = {
          id: 'sub-1',
          status: 'active',
          createdAt: new Date(),
          currentPeriodEnd: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days out
        };

        const result = getMembershipActions(sub, mockT);
        expect(result.primary).toBeUndefined();
      });

      it('should allow cancellation for active subscription not already canceled', () => {
        const sub = {
          id: 'sub-1',
          status: 'active',
          createdAt: new Date(),
          currentPeriodEnd: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        };

        const result = getMembershipActions(sub, mockT);
        expect(result.secondary.some(a => a.id === 'cancel')).toBe(true);
      });
    });

    describe('already canceled subscription', () => {
      it('should NOT allow cancellation if already canceledAt', () => {
        const sub = {
          id: 'sub-1',
          status: 'active',
          createdAt: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          canceledAt: new Date(),
        };

        const result = getMembershipActions(sub, mockT);
        expect(result.secondary.some(a => a.id === 'cancel')).toBe(false);
      });

      it('should NOT allow cancellation if cancelAtPeriodEnd is true', () => {
        const sub = {
          id: 'sub-1',
          status: 'active',
          createdAt: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: true,
        };

        const result = getMembershipActions(sub, mockT);
        expect(result.secondary.some(a => a.id === 'cancel')).toBe(false);
      });
    });

    describe('trialing/inactive statuses', () => {
      it('should not show cancel for trialing if not active or past_due', () => {
        const sub = {
          id: 'sub-1',
          status: 'trialing',
          createdAt: new Date(),
          currentPeriodEnd: null,
        };

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
});
