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

  it('C01 keeps every authority field server-owned with non-privileged defaults', async () => {
    const { userSchemaConfig } = await import('./schema');
    const fields = userSchemaConfig.additionalFields;
    const authorityKeys = [
      'role',
      'tenantId',
      'branchId',
      'memberNumber',
      'tenantClassificationPending',
      'agentId',
      'referralCode',
    ] as const;

    expect(Object.keys(fields).sort()).toEqual([...authorityKeys].sort());
    for (const key of authorityKeys) {
      expect(fields[key].input).toBe(false);
      expect(fields[key]).not.toHaveProperty('validator.input');
      expect(fields[key]).not.toHaveProperty('transform.input');
    }
    expect(fields.role.defaultValue).toBe('member');
    expect(fields.tenantClassificationPending.defaultValue).toBe(false);
  });
});
