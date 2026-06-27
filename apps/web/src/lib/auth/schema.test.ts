import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbAdmin: { kind: 'admin-db' },
  dbRls: { kind: 'rls-db' },
  drizzleAdapter: vi.fn(() => ({ kind: 'adapter' })),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: mocks.dbRls,
  dbAdmin: mocks.dbAdmin,
}));

vi.mock('@interdomestik/database/schema', () => ({
  user: {},
  session: {},
  account: {},
  verification: {},
}));

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: mocks.drizzleAdapter,
}));

describe('auth database adapter', () => {
  it('uses the admin database client for system auth lookups', async () => {
    await import('./schema');

    expect(mocks.drizzleAdapter).toHaveBeenCalledWith(
      mocks.dbAdmin,
      expect.objectContaining({ provider: 'pg' })
    );
  });
});
