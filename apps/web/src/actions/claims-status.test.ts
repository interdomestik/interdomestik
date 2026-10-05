import './claims.test-mocks';
import { describe, expect, it, vi } from 'vitest';
import { updateClaimStatus } from './claims';
import {
  mockGetSession,
  mockTxSelectLimit,
  mockTxUpdateReturning,
  submittedLifecycleCurrentClaim,
} from './claims.test-support';

describe('Claim Actions', () => {
  describe('updateClaimStatus', () => {
    it('should deny non-admin and non-staff users', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-123', role: 'user', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'verification');
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('should allow staff users to update status', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'verification');

      expect(mockTxUpdateReturning).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should allow admin users to update status', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'verification');

      expect(mockTxUpdateReturning).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should reject invalid status values', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      const result = await updateClaimStatus('claim-1', 'super-resolved');
      expect(result).toEqual({ success: false, error: 'Invalid status' });
    });
  });

  describe('updateClaimStatus - additional cases', () => {
    it('should deny unauthenticated users', async () => {
      mockGetSession.mockResolvedValue(null);
      const result = await updateClaimStatus('claim-1', 'verification');
      expect(result).toEqual({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    });

    it('should handle database errors during status update', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      mockTxSelectLimit.mockRejectedValueOnce(new Error('DB Error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await updateClaimStatus('claim-1', 'verification');

      consoleErrorSpy.mockRestore();

      expect(result).toEqual({ success: false, error: 'Failed to update status' });
    });

    it('should accept same-status updates', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      mockTxSelectLimit.mockResolvedValueOnce([submittedLifecycleCurrentClaim]);
      const result = await updateClaimStatus('claim-1', 'submitted');
      expect(result).toEqual({ success: true });
    });
  });
});
