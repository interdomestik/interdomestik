import { mockDbResponse, resolution } from './context.test-support';
import { db, withTenantContext } from '@interdomestik/database';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEST_PADDLE_DELIVERY,
  authorizeTestPaddleOwner,
} from '../../paddle-authority.test-support';
import { resolveSubscriptionContext } from './context';

describe('context utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolution.authorizePaddleTenant.mockReset().mockImplementation(authorizeTestPaddleOwner);
    resolution.resolvePaddleSubscriptionOwner.mockReset().mockResolvedValue(null);
    resolution.resolvePaddleUserOwner.mockReset().mockResolvedValue(null);
  });

  describe('resolveSubscriptionContext', () => {
    it('should return null if no userId in customData', async () => {
      const sub = { id: 's_1', customData: {} };
      const result = await resolveSubscriptionContext(TEST_PADDLE_DELIVERY, sub);
      expect(result).toBeNull();
    });

    it('should return context with tenant from existing subscription', async () => {
      const sub = { id: 's_1', customData: { userId: 'u_1' } };

      resolution.resolvePaddleSubscriptionOwner.mockResolvedValue({
        subscriptionId: 's_1',
        tenantId: 'tn_ex',
      });
      resolution.resolvePaddleUserOwner.mockResolvedValue({ userId: 'u_1', tenantId: 'tn_ex' });
      (db.query.subscriptions.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tn_ex', userId: 'u_1' })
      );
      (db.query.user.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tn_ex', email: 'e@mail.com' })
      );
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_def' } })
      );

      const result = await resolveSubscriptionContext(TEST_PADDLE_DELIVERY, sub);

      // The subscription owner's authority is reused for the user read and the branch lookup.
      const subscriptionOwner = resolution.resolvePaddleSubscriptionOwner.mock.results[0]!;
      const subscriptionAuthority = resolution.authorizePaddleTenant.mock.results[0]!.value;
      expect(resolution.authorizePaddleTenant.mock.calls[0]).toEqual([
        TEST_PADDLE_DELIVERY,
        await subscriptionOwner.value,
      ]);
      expect(resolution.authorizePaddleTenant.mock.calls[0]![1]).toBe(
        await subscriptionOwner.value
      );
      expect(withTenantContext).toHaveBeenLastCalledWith(
        subscriptionAuthority,
        expect.any(Function)
      );
      expect(result?.authority).toBe(subscriptionAuthority);
      expect(readTenantAuthority(result!.authority).tenantId).toBe('tn_ex');
      expect(result).toEqual(
        expect.objectContaining({
          userId: 'u_1',
          tenantId: 'tn_ex',
          branchId: 'br_def',
        })
      );
    });

    it('should return context with tenant from user if subscription is new', async () => {
      const sub = { id: 's_new', customData: { userId: 'u_1' } };

      resolution.resolvePaddleUserOwner.mockResolvedValue({ userId: 'u_1', tenantId: 'tn_usr' });
      (db.query.subscriptions.findFirst as any).mockImplementation(mockDbResponse(undefined));
      (db.query.user.findFirst as any).mockImplementation(mockDbResponse({ tenantId: 'tn_usr' }));
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_def' } })
      );

      const result = await resolveSubscriptionContext(TEST_PADDLE_DELIVERY, sub);
      expect(result?.tenantId).toBe('tn_usr');
      // No existing subscription: the authority comes from the resolver owner of the user.
      const userOwner = await resolution.resolvePaddleUserOwner.mock.results[0]!.value;
      expect(resolution.authorizePaddleTenant).toHaveBeenCalledWith(
        TEST_PADDLE_DELIVERY,
        userOwner
      );
      expect(resolution.authorizePaddleTenant.mock.calls[0]![1]).toBe(userOwner);
      expect(withTenantContext).toHaveBeenLastCalledWith(result?.authority, expect.any(Function));
      expect(readTenantAuthority(result!.authority).tenantId).toBe('tn_usr');
    });

    it('should reuse existing subscription user when customData omits userId', async () => {
      const sub = { id: 's_existing', customData: { tenantId: 'tenant_mk', agentId: 'ag_1' } };

      resolution.resolvePaddleSubscriptionOwner.mockResolvedValue({
        subscriptionId: 's_existing',
        tenantId: 'tenant_mk',
      });
      resolution.resolvePaddleUserOwner.mockResolvedValue({
        userId: 'user_existing',
        tenantId: 'tenant_mk',
      });
      (db.query.subscriptions.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tenant_mk', userId: 'user_existing' })
      );
      (db.query.user.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tenant_mk', email: 'member@example.com' })
      );
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_agent' } })
      );

      const result = await resolveSubscriptionContext(TEST_PADDLE_DELIVERY, sub);

      expect(result).toEqual(
        expect.objectContaining({
          userId: 'user_existing',
          tenantId: 'tenant_mk',
        })
      );
    });

    it('should reject mismatched customData tenant before writes', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sub = { id: 's_existing', customData: { userId: 'u_1', tenantId: 'tenant_bad' } };

      resolution.resolvePaddleSubscriptionOwner.mockResolvedValue({
        subscriptionId: 's_existing',
        tenantId: 'tenant_real',
      });
      resolution.resolvePaddleUserOwner.mockResolvedValue({
        userId: 'u_1',
        tenantId: 'tenant_real',
      });
      (db.query.subscriptions.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tenant_real', userId: 'u_1' })
      );
      (db.query.user.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tenant_real', email: 'member@example.com' })
      );
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_def' } })
      );

      await expect(resolveSubscriptionContext(TEST_PADDLE_DELIVERY, sub)).rejects.toThrow(
        'customData tenant=tenant_bad conflicts with canonical tenant=tenant_real'
      );
      expect(warnSpy).not.toHaveBeenCalled();
      // The provider-supplied tenant never becomes an authority, and no branch lookup ran.
      for (const call of resolution.authorizePaddleTenant.mock.calls) {
        expect(call[1]).not.toEqual(expect.objectContaining({ tenantId: 'tenant_bad' }));
      }
      expect(withTenantContext).toHaveBeenCalledTimes(2);

      warnSpy.mockRestore();
    });

    it('should fail closed without branch lookup when the existing subscription tenant differs from the user tenant', async () => {
      const sub = { id: 's_existing', customData: { userId: 'u_1' } };

      resolution.resolvePaddleSubscriptionOwner.mockResolvedValue({
        subscriptionId: 's_existing',
        tenantId: 'tenant_sub',
      });
      resolution.resolvePaddleUserOwner.mockResolvedValue({
        userId: 'u_1',
        tenantId: 'tenant_user',
      });
      (db.query.subscriptions.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tenant_sub', userId: 'u_1' })
      );
      (db.query.user.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tenant_user', email: 'member@example.com' })
      );

      await expect(resolveSubscriptionContext(TEST_PADDLE_DELIVERY, sub)).rejects.toThrow(
        'existing subscription tenant=tenant_sub conflicts with user tenant=tenant_user'
      );
      // Only the two owner-scoped reads ran; no effect ran under either authority.
      expect(withTenantContext).toHaveBeenCalledTimes(2);
      expect(db.query.tenantSettings.findFirst).not.toHaveBeenCalled();
    });

    it('should reject mismatched customData user when an existing subscription has canonical user', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sub = { id: 's_existing', customData: { userId: 'u_bad', tenantId: 'tenant_real' } };

      resolution.resolvePaddleSubscriptionOwner.mockResolvedValue({
        subscriptionId: 's_existing',
        tenantId: 'tenant_real',
      });
      (db.query.subscriptions.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tenant_real', userId: 'u_real' })
      );

      await expect(resolveSubscriptionContext(TEST_PADDLE_DELIVERY, sub)).rejects.toThrow(
        'customData user=u_bad conflicts with existing subscription user=u_real'
      );
      expect(resolution.resolvePaddleUserOwner).not.toHaveBeenCalled();
      expect(db.query.user.findFirst).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should not use customData tenant when canonical user lookup fails', async () => {
      const sub = { id: 's_bad', customData: { userId: 'u_missing', tenantId: 'tenant_provider' } };
      resolution.resolvePaddleUserOwner.mockResolvedValue(null);
      (db.query.subscriptions.findFirst as any).mockImplementation(mockDbResponse(undefined));
      (db.query.user.findFirst as any).mockImplementation(mockDbResponse(undefined));

      const result = await resolveSubscriptionContext(TEST_PADDLE_DELIVERY, sub);

      expect(result).toBeNull();
      expect(withTenantContext).not.toHaveBeenCalled();
    });

    it('should return null if tenant cannot be resolved', async () => {
      const sub = { id: 's_bad', customData: { userId: 'u_1' } };
      (db.query.subscriptions.findFirst as any).mockImplementation(mockDbResponse(undefined));
      (db.query.user.findFirst as any).mockImplementation(mockDbResponse(undefined));

      const result = await resolveSubscriptionContext(TEST_PADDLE_DELIVERY, sub);
      expect(result).toBeNull();
    });
  });
});
