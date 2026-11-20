import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, withTenantContext } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { notificationPreferencesSchema } from './types';
import { updateNotificationPreferencesCore } from './update';

// Mock dependencies
const { limit, lookupWhere, values, set, updateWhere } = vi.hoisted(() => {
  const limit = vi.fn((): { id: string }[] => []);
  const updateWhere = vi.fn();
  return {
    limit,
    lookupWhere: vi.fn(() => ({ limit })),
    values: vi.fn(),
    set: vi.fn((_payload: unknown) => ({ where: updateWhere })),
    updateWhere,
  };
});

vi.mock('@interdomestik/database', () => {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: lookupWhere,
      })),
    })),
    insert: vi.fn(() => ({ values })),
    update: vi.fn(() => ({ set })),
  };
  return {
    db,
    withTenantContext: vi.fn((_context: unknown, action: (tx: typeof db) => unknown) => action(db)),
  };
});

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((tenantId, column, condition) => ({ tenantId, column, condition })),
}));

vi.mock('@interdomestik/database/schema', () => ({
  userNotificationPreferences: {
    tenantId: 'tenantId',
    userId: 'userId',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args) => ({ type: 'and', args })),
  relations: vi.fn(),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-id'),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(session => {
    if (!session?.user?.tenantId) throw new Error('No tenant');
    return session.user.tenantId;
  }),
}));

describe('updateNotificationPreferencesCore', () => {
  const validPreferences = {
    emailClaimUpdates: true,
    emailMarketing: false,
    emailNewsletter: true,
    pushClaimUpdates: true,
    pushMessages: true,
    inAppAll: true,
  };

  const mockSession = {
    user: {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: 'member',
    },
  };

  const authority = mintTestTenantAuthority('authority-tenant', { userId: 'user-1' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns Unauthorized when no session', async () => {
    const result = await updateNotificationPreferencesCore({
      session: null,
      authority,
      preferences: validPreferences,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Unauthorized');
    }
  });

  it('returns Unauthorized when there is no tenant authority', async () => {
    const result = await updateNotificationPreferencesCore({
      session: { user: { id: 'user-1' } } as any,
      authority: null,
      preferences: validPreferences,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Unauthorized');
    }
  });

  it.each([
    ['an unregistered authority', {} as typeof authority],
    ['a different principal', mintTestTenantAuthority('tenant-1', { userId: 'user-2' })],
    ['a null principal', mintTestTenantAuthority('tenant-1')],
  ] as const)('returns Unauthorized without database access for %s', async (_, deniedAuthority) => {
    const result = await updateNotificationPreferencesCore({
      session: mockSession,
      authority: deniedAuthority,
      preferences: validPreferences,
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(withTenantContext).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns Unauthorized without database access when the session user ID and principal are missing', async () => {
    const result = await updateNotificationPreferencesCore({
      session: { user: { role: 'member', tenantId: 'tenant-1' } } as typeof mockSession,
      authority: mintTestTenantAuthority('tenant-1'),
      preferences: validPreferences,
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(withTenantContext).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects unknown keys in preferences (strict validation)', async () => {
    const invalidPreferences = {
      ...validPreferences,
      unknownKey: true, // This should fail
    };

    const result = await updateNotificationPreferencesCore({
      session: mockSession as any,
      authority,
      preferences: invalidPreferences,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
    }
  });

  it('rejects missing required keys', async () => {
    const incompletePreferences = {
      emailClaimUpdates: true,
      // Missing other required fields
    };

    const result = await updateNotificationPreferencesCore({
      session: mockSession as any,
      authority,
      preferences: incompletePreferences,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
    }
  });

  it('rejects wrong type for preference values', async () => {
    const wrongTypePreferences = {
      ...validPreferences,
      emailClaimUpdates: 'yes', // Should be boolean
    };

    const result = await updateNotificationPreferencesCore({
      session: mockSession as any,
      authority,
      preferences: wrongTypePreferences,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
    }
  });

  it('accepts valid preferences and returns success', async () => {
    const result = await updateNotificationPreferencesCore({
      session: mockSession as any,
      authority,
      preferences: validPreferences,
    });

    expect(result.success).toBe(true);
  });

  it.each([
    {
      operation: 'insert',
      rows: [],
      write: values,
      insertFields: { id: 'test-id', createdAt: expect.any(Date) },
    },
    { operation: 'update', rows: [{ id: 'existing-id' }], write: set, insertFields: {} },
  ])(
    'uses the authority identity for an $operation even if parsed data contains row fields',
    async ({ operation, rows, write, insertFields }) => {
      const session = { user: { ...mockSession.user } };
      limit.mockReturnValueOnce(rows);
      // Exercise the write independently of the strict schema's current rejection of these keys.
      const data = {
        ...validPreferences,
        id: 'input-id',
        tenantId: 'input-tenant',
        userId: 'input-user',
        createdAt: 'input-created',
        updatedAt: 'input-updated',
        extraColumn: 'x',
      };
      vi.spyOn(notificationPreferencesSchema, 'safeParse').mockImplementationOnce(() => {
        // The session matched at authorization time. Both queries must use the bound principal.
        session.user.id = 'changed-before-lookup';
        return { success: true, data };
      });

      const result = await updateNotificationPreferencesCore({
        session,
        authority,
        preferences: data,
      });

      expect(result).toEqual({ success: true });
      const userCondition = {
        type: 'eq',
        a: 'userId',
        b: 'user-1',
      };
      const predicate = {
        tenantId: 'authority-tenant',
        column: 'tenantId',
        condition: userCondition,
      };
      expect(lookupWhere).toHaveBeenCalledWith(predicate);
      if (operation === 'update') {
        expect(updateWhere).toHaveBeenCalledWith(predicate);
      }
      expect(withTenant).toHaveBeenLastCalledWith('authority-tenant', 'tenantId', userCondition);
      expect(write.mock.lastCall?.[0]).not.toHaveProperty('extraColumn');
      expect(write).toHaveBeenCalledWith({
        ...validPreferences,
        ...insertFields,
        tenantId: 'authority-tenant',
        userId: 'user-1',
        updatedAt: expect.any(Date),
      });
    }
  );
});
