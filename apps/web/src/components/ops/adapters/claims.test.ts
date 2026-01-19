import { describe, expect, it } from 'vitest';
import { getClaimActions, toOpsStatus } from './claims';

describe('Claims Adapter Policies', () => {
  describe('getClaimActions', () => {
    const mockT = (key: string) => key;

    it('should return empty actions when claim is undefined', () => {
      const result = getClaimActions(undefined, mockT);
      expect(result).toEqual({ secondary: [] });
    });

    describe('open/active statuses - should show all safe actions', () => {
      const openStatuses = [
        'submitted',
        'verification',
        'evaluation',
        'negotiation',
        'court',
        'draft',
      ];

      openStatuses.forEach(status => {
        it(`should return upload and message actions for "${status}" status`, () => {
          const claim = { id: 'claim-1', status };
          const result = getClaimActions(claim, mockT);

          expect(result.secondary).toHaveLength(2);

          const actionIds = result.secondary.map(a => a.id);
          expect(actionIds).toContain('upload');
          expect(actionIds).toContain('message');

          // Verify action properties
          const uploadAction = result.secondary.find(a => a.id === 'upload');
          expect(uploadAction?.label).toBe('Upload Evidence');
          expect(uploadAction?.variant).toBe('default');

          const messageAction = result.secondary.find(a => a.id === 'message');
          expect(messageAction?.label).toBe('Send Message');
          expect(messageAction?.variant).toBe('outline');
        });
      });
    });

    describe('terminal statuses - should show no actions', () => {
      const terminalStatuses = ['closed', 'paid', 'denied'];

      terminalStatuses.forEach(status => {
        it(`should return no actions for "${status}" status`, () => {
          const claim = { id: 'claim-1', status };
          const result = getClaimActions(claim, mockT);

          expect(result.secondary).toHaveLength(0);
        });
      });
    });
  });

  describe('toOpsStatus', () => {
    it('should format status label and return correct variant', () => {
      const result = toOpsStatus('in_progress');
      expect(result.label).toBe('IN PROGRESS');
      expect(result.variant).toBeDefined();
    });

    it('should handle single word status', () => {
      const result = toOpsStatus('submitted');
      expect(result.label).toBe('SUBMITTED');
    });
  });
});
