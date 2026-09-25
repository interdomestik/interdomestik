import assert from 'node:assert/strict';
import { mock } from 'node:test';

import type postgres from 'postgres';
import type { RlsConnectionRolePosture } from '../../src/rls-role-assertion';

function configureFixtureEnvironment(scenario: string, configured: boolean): void {
  // Only the external SQL transport is replaced. Readiness, Drizzle and tenant setup are real.
  process.env.DATABASE_URL = 'postgres://admin:fixture@db.invalid/test';
  process.env.DATABASE_URL_RLS = 'postgres://tenant:fixture@db.invalid/test';
  delete process.env.DB_RLS_ROLE;
  if (configured) process.env.DB_RLS_ROLE = 'tenant_target';
  if (scenario === 'invalid-role') process.env.DB_RLS_ROLE = 'invalid;role';
  if (scenario === 'identical-url') process.env.DATABASE_URL_RLS = process.env.DATABASE_URL;
}

async function main(): Promise<void> {
  const scenario = process.argv[2];
  const configured = scenario === 'configured' || scenario === 'recovery-configured-superuser';
  configureFixtureEnvironment(scenario, configured);
  const safe = [{ currentUser: 'tenant', roleBypassesRls: false, roleIsSuperuser: false }];
  const unsafePostures: Record<string, RlsConnectionRolePosture[] | undefined> = {
    'wrong-role': [{ ...safe[0], roleBypassesRls: true }],
    superuser: [{ ...safe[0], roleIsSuperuser: true }],
    malformed: [{ ...safe[0], roleBypassesRls: null }],
    missing: [],
  };
  let resolveFirst!: (rows: RlsConnectionRolePosture[]) => void;
  const first = new Promise<RlsConnectionRolePosture[]>(resolve => {
    resolveFirst = resolve;
  });
  let resolveNext!: (rows: RlsConnectionRolePosture[]) => void;
  const next = new Promise<RlsConnectionRolePosture[]>(resolve => {
    resolveNext = resolve;
  });
  let queries = 0;
  const roles: unknown[] = [];
  let transactions = 0;
  let callbacks = 0;
  const statements: { query: string; params: unknown[] }[] = [];
  const client = Object.assign(
    async (_sql: TemplateStringsArray, role?: string) => {
      queries++;
      roles.push(role);
      const unsafePosture = unsafePostures[scenario];
      if (unsafePosture) return unsafePosture;
      if (scenario === 'query-error') throw new Error('permission denied');
      if (scenario === 'recovery-configured-superuser' && queries === 4)
        return [{ ...safe[0], roleIsSuperuser: true }];
      if (configured) return queries === 2 ? first : safe;
      if (queries === 1) return first;
      if (scenario === 'recovery-wrong-role') return [{ ...safe[0], roleBypassesRls: true }];
      if (scenario === 'recovery-query-error') throw new Error('permission denied');
      if (scenario === 'concurrent' || scenario === 'repeated') return queries === 2 ? next : safe;
      return safe;
    },
    {
      options: { parsers: {}, serializers: {} },
      begin: async (action: (tx: typeof client) => Promise<unknown>) => {
        transactions++;
        return action(client);
      },
      unsafe: async (query: string, params: unknown[]) => {
        statements.push({ query, params });
        return [];
      },
    }
  );
  const clients = globalThis as typeof globalThis & {
    queryClientAdmin?: postgres.Sql;
    queryClientRls?: postgres.Sql;
  };
  clients.queryClientAdmin = client as unknown as postgres.Sql;
  clients.queryClientRls = client as unknown as postgres.Sql;
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { dbRls } = await import('../../src/db');
  const { withTenantContext } = await import('../../src/tenant');
  const request = () => withTenantContext({ tenantId: 'tenant_a' }, async () => ++callbacks);
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  if (
    [
      'wrong-role',
      'superuser',
      'malformed',
      'missing',
      'invalid-role',
      'query-error',
      'identical-url',
    ].includes(scenario)
  ) {
    await assert.rejects(request());
    const initialQueries = queries;
    mock.timers.tick(60_000);
    await Promise.all(Array.from({ length: 8 }, () => assert.rejects(request())));
    assert.equal(queries, initialQueries, 'unsafe or unknown failure must never retry');
    assert.equal(transactions, 0);
    assert.equal(callbacks, 0);
    assert.throws(() => dbRls.transaction);
    return;
  }
  await flush();
  const rejected = assert.rejects(request(), /role posture could not be verified/);
  const concurrentInitial = Array.from({ length: 8 }, () => assert.rejects(request()));
  mock.timers.tick(5_000);
  await rejected;
  await Promise.all(concurrentInitial);
  assert.equal(queries, configured ? 2 : 1);
  assert.equal(transactions, 0);
  assert.equal(callbacks, 0);
  assert.throws(() => dbRls.transaction, /role posture could not be verified/);
  if (scenario === 'unsettled') {
    for (let index = 0; index < 3; index++) {
      mock.timers.tick(30_000);
      await Promise.all(Array.from({ length: 8 }, () => assert.rejects(request())));
      assert.equal(queries, 1, 'timed-out raw query must not accumulate successors');
    }
  }
  resolveFirst(safe);
  await flush();
  assert.throws(() => dbRls.transaction, 'late completion must not unlock the client');
  await assert.rejects(request(), /role posture could not be verified/);
  mock.timers.tick(5_000);
  if (scenario.startsWith('recovery-')) {
    await assert.rejects(request());
    assert.equal(queries, configured ? 4 : 2, 'recovery must perform fresh posture queries');
    mock.timers.tick(60_000);
    await Promise.all(Array.from({ length: 8 }, () => assert.rejects(request())));
    assert.equal(
      queries,
      configured ? 4 : 2,
      'unsafe recovery result must replace retryable timeout'
    );
    assert.equal(transactions, 0);
    assert.equal(callbacks, 0);
    assert.throws(() => dbRls.transaction);
    return;
  }
  if (scenario === 'concurrent') {
    const requests = Array.from({ length: 8 }, () => request());
    await flush();
    assert.equal(queries, 2);
    assert.equal(transactions, 0);
    assert.throws(() => dbRls.transaction, 'direct access must stay blocked during recovery');
    resolveNext(safe);
    assert.deepEqual(await Promise.all(requests), [1, 2, 3, 4, 5, 6, 7, 8]);
    await request();
    assert.equal(queries, 2, 'complete success is cached');
    return;
  }
  if (scenario === 'repeated') {
    const again = assert.rejects(request());
    mock.timers.tick(5_000);
    await again;
    resolveNext(safe);
    await flush();
    await assert.rejects(request());
    assert.equal(queries, 2);
    mock.timers.tick(5_000);
  }
  assert.equal(await request(), 1);
  const expectedQueries: Record<string, number> = { configured: 4, repeated: 3 };
  assert.equal(queries, expectedQueries[scenario] ?? 2);
  if (scenario === 'configured')
    assert.deepEqual(roles, [undefined, 'tenant_target', undefined, 'tenant_target']);
  assert.equal(transactions, 1);
  assert.deepEqual(statements, [
    ...(scenario === 'configured' ? [{ query: 'set local role "tenant_target"', params: [] }] : []),
    { query: 'set local row_security = on', params: [] },
    { query: "select set_config('app.current_tenant_id', $1, true)", params: ['tenant_a'] },
    { query: "select set_config('app.current_access_tenant_id', $1, true)", params: ['tenant_a'] },
  ]);
}

main()
  .then(() => console.info('RLS readiness scenario completed'))
  .finally(() => mock.timers.reset())
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
