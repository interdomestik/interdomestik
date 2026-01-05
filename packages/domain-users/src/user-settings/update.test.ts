import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateNotificationPreferencesCore } from './update';

// Mock dependencies
vi.mock('@interdomestik/database', () => ({
  db: {
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
  },
}));

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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns Unauthorized when no session', async () => {
    const result = await updateNotificationPreferencesCore({
      session: null,
      preferences: validPreferences,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Unauthorized');
    }
  });

  it('returns Unauthorized when user has no tenant', async () => {
    const result = await updateNotificationPreferencesCore({
      session: { user: { id: 'user-1' } } as any,
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
      preferences: validPreferences,
    });

    expect(result.success).toBe(true);
  });
});
