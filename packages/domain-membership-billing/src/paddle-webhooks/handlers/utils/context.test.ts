import { db, withTenantContext } from '@interdomestik/database';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEST_PADDLE_DELIVERY,
  authorizeTestPaddleOwner,
} from '../../paddle-authority.test-support';
import {
  authorizeReconciledCheckoutUser,
  resolveBranchId,
  resolveSubscriptionContext,
} from './context';

// Mock the database structure with basic spies
vi.mock('@interdomestik/database', () => {
  const db = {
    query: {
      user: {
        findFirst: vi.fn(),
      },
      tenantSettings: {
        findFirst: vi.fn(),
      },
      subscriptions: {
        findFirst: vi.fn(),
      },
    },
  };
  return {
    db,
    withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) => cb(db)),
    ...resolution,
  };
});

const resolution = vi.hoisted(() => ({
  authorizePaddleTenant: vi.fn(),
  resolvePaddleSubscriptionOwner: vi.fn(),
  resolvePaddleUserOwner: vi.fn(),
}));

// Helper to mock response AND execute 'where' callback for coverage
const mockDbResponse = (returnValue: any) => {
  return (args: any) => {
    if (args?.where && typeof args.where === 'function') {
      // Execute the callback with dummy operators
      args.where(
        {},
        {
          and: (...a: any[]) => a,
          eq: (a: any, b: any) => [a, b],
          or: (...a: any[]) => a,
        }
      );
    }
    return Promise.resolve(returnValue);
  };
};

describe('context utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolution.authorizePaddleTenant.mockReset().mockImplementation(authorizeTestPaddleOwner);
    resolution.resolvePaddleSubscriptionOwner.mockReset().mockResolvedValue(null);
    resolution.resolvePaddleUserOwner.mockReset().mockResolvedValue(null);
  });

  describe('resolveBranchId', () => {
    it('should return agent branchId if agentId is provided and agent exists', async () => {
      (db.query.user.findFirst as any).mockImplementation(mockDbResponse({ branchId: 'br_agent' }));

      const result = await resolveBranchId({
        customData: { agentId: 'ag_1' },
        tenantId: 'tn_1',
        db: db as any,
      });

      expect(result).toBe('br_agent');
    });

    it('should fallback to default branch when agentId is provided but agent has no branchId', async () => {
      (db.query.user.findFirst as any).mockImplementation(mockDbResponse({ branchId: null }));
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_default' } })
      );

      const result = await resolveBranchId({
        customData: { agentId: 'ag_1' },
        tenantId: 'tn_1',
        db: db as any,
      });

      expect(result).toBe('br_default');
    });

    it('should fallback to default branch setting if no agentId', async () => {
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_default' } })
      );

      const result = await resolveBranchId({
        customData: {},
        tenantId: 'tn_1',
        db: db as any,
      });

      expect(result).toBe('br_default');
    });

    it('should handle various JSON object structures for default branch', async () => {
      (db.query.tenantSettings.findFirst as any)
        .mockImplementationOnce(mockDbResponse({ value: { defaultBranchId: 'br_1' } }))
        .mockImplementationOnce(mockDbResponse({ value: { id: 'br_2' } }))
        .mockImplementationOnce(mockDbResponse({ value: { value: 'br_3' } }));

      expect(await resolveBranchId({ customData: {}, tenantId: 't', db: db as any })).toBe('br_1');
      expect(await resolveBranchId({ customData: {}, tenantId: 't', db: db as any })).toBe('br_2');
      expect(await resolveBranchId({ customData: {}, tenantId: 't', db: db as any })).toBe('br_3');
    });

    it('should return undefined if default branch setting is missing or invalid', async () => {
      (db.query.tenantSettings.findFirst as any).mockImplementation(mockDbResponse(undefined));
      const result = await resolveBranchId({ customData: {}, tenantId: 't', db: db as any });
      expect(result).toBeUndefined();
    });
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
