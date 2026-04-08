import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBranchId, resolveSubscriptionContext } from './context';

// Mock the database structure with basic spies
vi.mock('@interdomestik/database', () => ({
  db: {
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
  },
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
      const result = await resolveSubscriptionContext(sub);
      expect(result).toBeNull();
    });

    it('should return context with tenant from existing subscription', async () => {
      const sub = { id: 's_1', customData: { userId: 'u_1' } };

      (db.query.subscriptions.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tn_ex', userId: 'u_1' })
      );
      (db.query.user.findFirst as any).mockImplementation(mockDbResponse({ email: 'e@mail.com' }));
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_def' } })
      );

      const result = await resolveSubscriptionContext(sub);

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

      (db.query.subscriptions.findFirst as any).mockImplementation(mockDbResponse(undefined));
      (db.query.user.findFirst as any).mockImplementation(mockDbResponse({ tenantId: 'tn_usr' }));
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_def' } })
      );

      const result = await resolveSubscriptionContext(sub);
      expect(result?.tenantId).toBe('tn_usr');
    });

    it('should reuse existing subscription user when customData omits userId', async () => {
      const sub = { id: 's_existing', customData: { tenantId: 'tenant_mk', agentId: 'ag_1' } };

      (db.query.subscriptions.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tenant_mk', userId: 'user_existing' })
      );
      (db.query.user.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tenant_mk', email: 'member@example.com' })
      );
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_agent' } })
      );

      const result = await resolveSubscriptionContext(sub);

      expect(result).toEqual(
        expect.objectContaining({
          userId: 'user_existing',
          tenantId: 'tenant_mk',
        })
      );
    });

    it('should prefer canonical tenant over mismatched customData tenant', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const sub = { id: 's_existing', customData: { userId: 'u_1', tenantId: 'tenant_bad' } };

      (db.query.subscriptions.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tenant_real', userId: 'u_1' })
      );
      (db.query.user.findFirst as any).mockImplementation(
        mockDbResponse({ tenantId: 'tenant_real', email: 'member@example.com' })
      );
      (db.query.tenantSettings.findFirst as any).mockImplementation(
        mockDbResponse({ value: { branchId: 'br_def' } })
      );

      const result = await resolveSubscriptionContext(sub);

      expect(result?.tenantId).toBe('tenant_real');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring mismatched customData.tenantId')
      );

      warnSpy.mockRestore();
    });

    it('should return null if tenant cannot be resolved', async () => {
      const sub = { id: 's_bad', customData: { userId: 'u_1' } };
      (db.query.subscriptions.findFirst as any).mockImplementation(mockDbResponse(undefined));
      (db.query.user.findFirst as any).mockImplementation(mockDbResponse(undefined));

      const result = await resolveSubscriptionContext(sub);
      expect(result).toBeNull();
    });
  });
});
