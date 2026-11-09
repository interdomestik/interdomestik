import assert from 'node:assert/strict';
import test from 'node:test';
import * as schema from '../src/schema';
import { buildWorkloadUsers } from '../src/seed-workload/user-fixtures';
import { seedWorkloadUsers } from '../src/seed-workload/users';
import type { SeedConfig } from '../src/seed-types';

test('workload seeding uses the exact ownership catalogue and credential IDs', async () => {
  const users: Record<string, unknown>[] = [];
  const accounts: Record<string, unknown>[] = [];
  const db = {
    insert: (table: unknown) => ({
      values: (rows: Record<string, unknown>[]) => {
        (table === schema.user ? users : accounts).push(...rows);
        return { onConflictDoNothing: () => Promise.resolve() };
      },
    }),
  };
  await seedWorkloadUsers(db, schema, { at: () => new Date(0) } as SeedConfig);
  const fixtures = buildWorkloadUsers();
  assert.equal(fixtures.length, 59);
  assert.equal(new Set(fixtures.map(row => row.id)).size, 59);
  assert.equal(new Set(fixtures.map(row => row.email)).size, 59);
  assert.deepEqual(
    users.map(({ id, email, tenantId }) => ({ id, email, tenantId })),
    fixtures.map(({ id, email, tenantId }) => ({ id, email, tenantId }))
  );
  assert.deepEqual(
    accounts.map(row => row.id),
    fixtures.map(row => `${row.id}-credential`)
  );
  assert.deepEqual(
    accounts.map(row => row.userId),
    fixtures.map(row => row.id)
  );
});
