import { describe, expect, it } from 'vitest';

import type { ClaimStatus } from '@interdomestik/database/constants';
import { isStaffOwnedStatus, isTerminalStatus } from '../types';
import { getPrimaryDirectiveVariant, shouldShowUnassignedBadge } from './OwnerDirective';

describe('OwnerDirective helpers', () => {
  describe('isStaffOwnedStatus', () => {
    it('returns true for staff-owned statuses', () => {
      const staffStatuses: ClaimStatus[] = ['submitted', 'evaluation', 'negotiation', 'court'];
      staffStatuses.forEach(status => {
        expect(isStaffOwnedStatus(status)).toBe(true);
      });
    });

    it('returns false for member-owned statuses', () => {
      expect(isStaffOwnedStatus('draft')).toBe(false);
      expect(isStaffOwnedStatus('verification')).toBe(false);
    });

    it('returns false for system-owned statuses', () => {
      expect(isStaffOwnedStatus('resolved')).toBe(false);
      expect(isStaffOwnedStatus('rejected')).toBe(false);
    });
  });

  describe('isTerminalStatus', () => {
    it('returns true for resolved and rejected', () => {
      expect(isTerminalStatus('resolved')).toBe(true);
      expect(isTerminalStatus('rejected')).toBe(true);
    });

    it('returns false for non-terminal statuses', () => {
      const nonTerminal: ClaimStatus[] = [
        'draft',
        'submitted',
        'verification',
        'evaluation',
        'negotiation',
        'court',
      ];
      nonTerminal.forEach(status => {
        expect(isTerminalStatus(status)).toBe(false);
      });
    });
  });

  describe('getPrimaryDirectiveVariant', () => {
    it('returns member_waiting for member-owned statuses', () => {
      expect(getPrimaryDirectiveVariant('draft', undefined)).toBe('member_waiting');
      expect(getPrimaryDirectiveVariant('verification', undefined)).toBe('member_waiting');
    });

    it('returns staff_action_required for staff-owned without name', () => {
      expect(getPrimaryDirectiveVariant('submitted', undefined)).toBe('staff_action_required');
      expect(getPrimaryDirectiveVariant('evaluation', undefined)).toBe('staff_action_required');
    });

    it('returns staff_action_with_name for staff-owned with name', () => {
      expect(getPrimaryDirectiveVariant('submitted', 'Ana')).toBe('staff_action_with_name');
      expect(getPrimaryDirectiveVariant('evaluation', 'John')).toBe('staff_action_with_name');
    });

    it('returns system_completed for system-owned statuses', () => {
      expect(getPrimaryDirectiveVariant('resolved', undefined)).toBe('system_completed');
      expect(getPrimaryDirectiveVariant('rejected', undefined)).toBe('system_completed');
    });

    it('falls back to system_completed for unknown status', () => {
      // Test unknown status fallback (PRD rule 2)
      expect(getPrimaryDirectiveVariant('unknown_status' as ClaimStatus, undefined)).toBe(
        'unknown_status'
      );
    });
  });

  describe('shouldShowUnassignedBadge', () => {
    it('shows badge for staff-owned + unassigned + non-terminal', () => {
      expect(shouldShowUnassignedBadge('submitted', true, 'staff')).toBe(true);
      expect(shouldShowUnassignedBadge('evaluation', true, 'staff')).toBe(true);
    });

    it('hides badge when waitingOn is member (corner case)', () => {
      // PRD rule: status=verification, staffId=null, waitingOn='member' → no badge
      expect(shouldShowUnassignedBadge('verification', true, 'member')).toBe(false);
      expect(shouldShowUnassignedBadge('submitted', true, 'member')).toBe(false);
    });

    it('hides badge for terminal statuses', () => {
      expect(shouldShowUnassignedBadge('resolved', true, 'staff')).toBe(false);
      expect(shouldShowUnassignedBadge('rejected', true, 'staff')).toBe(false);
    });

    it('hides badge when assigned', () => {
      expect(shouldShowUnassignedBadge('submitted', false, 'staff')).toBe(false);
      expect(shouldShowUnassignedBadge('evaluation', false, 'staff')).toBe(false);
    });

    it('hides badge for member-owned statuses', () => {
      expect(shouldShowUnassignedBadge('draft', true, 'member')).toBe(false);
      expect(shouldShowUnassignedBadge('verification', true, 'member')).toBe(false);
    });

    it('treats null waitingOn correctly', () => {
      // PRD rule: if waitingOn undefined, treat as null (not default to member)
      expect(shouldShowUnassignedBadge('submitted', true, null)).toBe(true);
    });
  });
});
