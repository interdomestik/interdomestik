import './claims.test-mocks';
import { db } from '@interdomestik/database';
import { describe, expect, it, vi } from 'vitest';
import { createClaim } from './claims';
import {
  mockDbInsert,
  retailClaimFormData,
  mockGetActiveSubscription,
  mockGetSession,
  type MockResolvedOnce,
} from './claims.test-support';

describe('Claim Actions', () => {
  describe('createClaim', () => {
    it('should fail if user has no active membership', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      mockGetActiveSubscription.mockResolvedValueOnce(null);

      const formData = new FormData();
      formData.append('title', 'Valid Title');
      formData.append('companyName', 'Company');
      formData.append('category', 'retail');

      const result = await createClaim({}, formData);
      expect(result).toEqual({ success: false, error: 'Membership required to create a claim.' });
    });

    it('should fail if user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);
      const formData = new FormData();
      const result = await createClaim({}, formData);
      expect(result).toEqual({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    });

    it('should fail with validation errors for empty data', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
      const formData = new FormData();
      const result = await createClaim({}, formData);

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error', 'Validation failed');
      expect(result).toHaveProperty('issues');
    });

    it('should create a claim successfully with valid data', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
      const formData = retailClaimFormData();

      await createClaim({}, formData);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Claim',
          companyName: 'Bad Company',
          userId: 'user-123',
          caseLifecycleState: 'draft',
          recoveryLifecycleState: 'not_started',
        })
      );
    });

    it('applies tenant default branch when subscription has no branchId', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      mockGetActiveSubscription.mockResolvedValueOnce({
        id: 'sub-1',
        userId: 'user-123',
        status: 'active',
        branchId: null,
        agentId: null,
      });

      const tenantSettingsFindFirst = db.query.tenantSettings
        .findFirst as never as MockResolvedOnce;

      tenantSettingsFindFirst.mockResolvedValueOnce({
        value: { branchId: 'branch-mk-skopje-center' },
      });

      const formData = retailClaimFormData();

      await createClaim({}, formData);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 'branch-mk-skopje-center',
        })
      );
    });
  });

  describe('createClaim - error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
      mockDbInsert.mockRejectedValueOnce(new Error('DB Error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const formData = retailClaimFormData();

      const result = await createClaim({}, formData);

      consoleErrorSpy.mockRestore();

      expect(result).toEqual({
        success: false,
        error: 'Failed to create claim. Please try again.',
      });
    });

    it('should handle optional claimAmount as empty string', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      const formData = retailClaimFormData('');

      await createClaim({}, formData);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Claim',
          claimAmount: undefined,
        })
      );
    });
  });

  describe('createClaim - claimAmount transform coverage', () => {
    it('should transform truthy claimAmount value', async () => {
      mockGetSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

      const formData = retailClaimFormData('999.99');

      await createClaim({}, formData);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          claimAmount: '999.99',
        })
      );
    });
  });
});
