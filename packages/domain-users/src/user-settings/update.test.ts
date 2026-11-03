import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { updateNotificationPreferencesCore } from './update';

// Mock dependencies
vi.mock('@interdomestik/database', () => {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  };
  return {
    db,
    withTenantContext: (
      _context: { tenantId: string },
      action: (tx: typeof db) => Promise<unknown>
    ) => action(db),
  };
});

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((_tenantId, _col, condition) => condition),
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

  const authority = mintTestTenantAuthority('tenant-1');

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
});
