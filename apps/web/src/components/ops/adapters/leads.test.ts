import { describe, expect, it } from 'vitest';
import { getLeadActions, toOpsStatus, toOpsTimelineEvents } from './leads';

describe('Leads Adapter Policies', () => {
  describe('getLeadActions', () => {
    it('should return empty actions when lead is undefined', () => {
      const result = getLeadActions(undefined);
      expect(result).toEqual({ secondary: [] });
    });

    describe('new status', () => {
      it('should show convert as primary and mark_contacted as secondary', () => {
        const lead = { id: 'lead-1', status: 'new' };

        const result = getLeadActions(lead);

        expect(result.primary).toBeDefined();
        expect(result.primary?.id).toBe('convert');
        expect(result.primary?.disabled).toBeFalsy();

        expect(result.secondary.some(a => a.id === 'mark_contacted')).toBe(true);
        expect(result.secondary.some(a => a.id === 'mark_lost')).toBe(true);
      });
    });

    describe('contacted status', () => {
      it('should show convert as primary and pay_cash as secondary', () => {
        const lead = { id: 'lead-1', status: 'contacted' };

        const result = getLeadActions(lead);

        expect(result.primary?.id).toBe('convert');
        expect(result.secondary.some(a => a.id === 'pay_cash')).toBe(true);
        expect(result.secondary.some(a => a.id === 'mark_lost')).toBe(true);

        // mark_contacted should NOT be present for contacted status
        expect(result.secondary.some(a => a.id === 'mark_contacted')).toBe(false);
      });
    });

    describe('payment_pending status', () => {
      it('should show convert as primary and mark_lost as secondary', () => {
        const lead = { id: 'lead-1', status: 'payment_pending' };

        const result = getLeadActions(lead);

        expect(result.primary?.id).toBe('convert');
        expect(result.secondary.some(a => a.id === 'mark_lost')).toBe(true);

        // No mark_contacted or mark_payment_pending for this status
        expect(result.secondary.some(a => a.id === 'mark_contacted')).toBe(false);
        expect(result.secondary.some(a => a.id === 'mark_payment_pending')).toBe(false);
      });
    });

    describe('converted status - terminal', () => {
      it('should NOT show convert or mark_lost actions', () => {
        const lead = { id: 'lead-1', status: 'converted' };

        const result = getLeadActions(lead);

        expect(result.primary).toBeUndefined();
        expect(result.secondary.some(a => a.id === 'mark_lost')).toBe(false);
      });
    });

    describe('lost status - terminal', () => {
      it('should show convert as disabled primary, no mark_lost', () => {
        const lead = { id: 'lead-1', status: 'lost' };

        const result = getLeadActions(lead);

        expect(result.primary?.id).toBe('convert');
        expect(result.primary?.disabled).toBe(true);
        expect(result.secondary.some(a => a.id === 'mark_lost')).toBe(false);
      });
    });

    describe('expired status', () => {
      it('should show convert as primary but no mark_lost', () => {
        const lead = { id: 'lead-1', status: 'expired' };

        const result = getLeadActions(lead);

        expect(result.primary?.id).toBe('convert');
        // expired is in the exclusion list for mark_lost
        expect(result.secondary.some(a => a.id === 'mark_lost')).toBe(false);
      });
    });
  });

  describe('toOpsStatus', () => {
    it('should format null status as NONE', () => {
      const result = toOpsStatus(null);
      expect(result.label).toBe('NONE');
    });

    it('should format payment_pending correctly', () => {
      const result = toOpsStatus('payment_pending');
      expect(result.label).toBe('PAYMENT PENDING');
    });
  });

  describe('toOpsTimelineEvents', () => {
    it('should return empty array for undefined lead', () => {
      const result = toOpsTimelineEvents(undefined);
      expect(result).toEqual([]);
    });

    it('should create created event from lead', () => {
      const lead = {
        id: 'lead-1',
        status: 'new',
        createdAt: new Date('2024-01-01'),
        source: 'web_form',
      };

      const result = toOpsTimelineEvents(lead);
      expect(result.some(e => e.title === 'Lead Created')).toBe(true);
    });

    it('should create converted event if status is converted', () => {
      const lead = {
        id: 'lead-1',
        status: 'converted',
        createdAt: new Date('2024-01-01'),
      };

      const result = toOpsTimelineEvents(lead);
      expect(result.some(e => e.title === 'Converted')).toBe(true);
    });
  });
});
