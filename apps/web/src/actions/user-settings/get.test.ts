import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(async () => [] as unknown[]),
  where: vi.fn(() => ({ limit: undefined as unknown })),
  from: vi.fn(() => ({ where: undefined as unknown })),
  select: vi.fn(() => ({ from: undefined as unknown })),
  withTenantContext: vi.fn(),
}));

mocks.where.mockImplementation(() => ({ limit: mocks.limit }));
mocks.from.mockImplementation(() => ({ where: mocks.where }));
mocks.select.mockImplementation(() => ({ from: mocks.from }));

vi.mock('@interdomestik/database', () => {
  const db = {
    select: mocks.select,
  };
  return {
    db,
    withTenantContext: async (context: unknown, cb: (tx: unknown) => unknown) => {
      mocks.withTenantContext(context);
      return cb(db);
    },
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  userNotificationPreferences: {
    userId: 'userNotificationPreferences.userId',
    tenantId: 'userNotificationPreferences.tenantId',
  },
}));

import { getNotificationPreferencesCore } from './get';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './types';

describe('getNotificationPreferencesCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns defaults when no preferences exist', async () => {
    const result = await getNotificationPreferencesCore({
      session: {
        user: { id: 'user-1', role: 'user', tenantId: 'tenant-1' },
      } as unknown as NonNullable<import('./context').Session>,
    });

    expect(result).toEqual({
      success: true,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      error: undefined,
    });
    expect(mocks.withTenantContext).toHaveBeenCalledWith({ tenantId: 'tenant-1' });
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.limit).toHaveBeenCalledWith(1);
  });
});
