import { resolution } from './context.test-support';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEST_PADDLE_DELIVERY,
  authorizeTestPaddleOwner,
} from '../../paddle-authority.test-support';
import { authorizeReconciledCheckoutUser } from './context';

describe('context utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolution.authorizePaddleTenant.mockReset().mockImplementation(authorizeTestPaddleOwner);
    resolution.resolvePaddleSubscriptionOwner.mockReset().mockResolvedValue(null);
    resolution.resolvePaddleUserOwner.mockReset().mockResolvedValue(null);
  });
  describe('authorizeReconciledCheckoutUser', () => {
    it('mints the authority from the resolver owner of the persisted user', async () => {
      const owner = { userId: 'u_new', tenantId: 'tenant_mk' };
      resolution.resolvePaddleUserOwner.mockResolvedValue(owner);

      const authority = await authorizeReconciledCheckoutUser(
        TEST_PADDLE_DELIVERY,
        { userId: 'u_new', tenantId: 'tenant_mk' },
        's_1'
      );

      expect(resolution.resolvePaddleUserOwner).toHaveBeenCalledWith('u_new');
      expect(resolution.authorizePaddleTenant).toHaveBeenCalledWith(TEST_PADDLE_DELIVERY, owner);
      expect(resolution.authorizePaddleTenant.mock.calls[0]![1]).toBe(owner);
      expect(readTenantAuthority(authority).tenantId).toBe('tenant_mk');
    });

    it('fails closed when the persisted user belongs to another tenant than the evidence', async () => {
      resolution.resolvePaddleUserOwner.mockResolvedValue({
        userId: 'u_new',
        tenantId: 'tenant_ks',
      });

      await expect(
        authorizeReconciledCheckoutUser(
          TEST_PADDLE_DELIVERY,
          { userId: 'u_new', tenantId: 'tenant_mk' },
          's_1'
        )
      ).rejects.toThrow('conflicts with webhook authority tenant=tenant_ks');
    });

    it('fails closed when the persisted user has no unique owner', async () => {
      resolution.resolvePaddleUserOwner.mockResolvedValue(null);

      await expect(
        authorizeReconciledCheckoutUser(
          TEST_PADDLE_DELIVERY,
          { userId: 'u_new', tenantId: 'tenant_mk' },
          's_1'
        )
      ).rejects.toThrow('has no unique owner');
      expect(resolution.authorizePaddleTenant).not.toHaveBeenCalled();
    });
  });
});
