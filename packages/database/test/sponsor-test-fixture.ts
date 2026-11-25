import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import { grantRlsTestRole } from './rls-test-grants';
import {
  TABLES,
  createSponsorScope,
  seedSponsorRows,
  serial,
  type Row,
  type Scope,
  type Table,
  type Tx,
} from './sponsor-seed.test-support';

export {
  TABLES,
  START,
  END,
  LATER,
  MID,
  insert,
  row,
  seedSponsorScope,
  serial,
  uid,
  type Row,
  type Scope,
  type Table,
  type Tx,
} from './sponsor-seed.test-support';

export type Fixture = { admin: postgres.Sql; a: Scope; b: Scope };
/** drizzle(admin) makes postgres.js return timestamps as text; compare them as ISO strings. */
export const iso = (value: unknown): string => new Date(String(value)).toISOString();
export async function update(tx: Tx, table: Table, id: string, patch: Row): Promise<void> {
  const rows = await tx`update ${tx(table)} set ${tx(patch)} where id = ${id} returning id`;
  assert.equal(rows.length, 1, `${table}: expected one visible update target`);
}

export async function restricted<T>(
  client: postgres.Sql,
  s: Scope,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return client.begin('isolation level read committed', async tx => {
    await tx.unsafe(`set local role ${quoteIdentifier(TEST_DB_ROLE)}`);
    await tx`set local row_security = on`;
    await tx`set local statement_timeout = '8s'`;
    const wrongTenant = `wrong_${s.tenant}`; // Policies must use access authority.
    await tx`select set_config('app.current_tenant_id', ${wrongTenant}, true),
      set_config('app.current_access_tenant_id', ${s.tenant}, true)`;
    const [role] = await tx`select current_user as name, rolsuper, rolbypassrls
      from pg_roles where rolname = current_user`;
    assert.equal(role?.name, TEST_DB_ROLE);
    assert.equal(role?.rolsuper, false);
    assert.equal(role?.rolbypassrls, false);
    return fn(tx);
  }) as Promise<T>;
}
export async function rollback<T>(tx: Tx, fn: (savepoint: Tx) => Promise<T>): Promise<T> {
  const sentinel = new Error('test rollback');
  let result: T | undefined;
  try {
    await tx.savepoint(async savepoint => {
      result = await fn(savepoint);
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }
  return result as T;
}
export async function rejected(
  tx: Tx,
  fn: (savepoint: Tx) => Promise<unknown>,
  code: string,
  detail?: string
): Promise<void> {
  await assert.rejects(tx.savepoint(fn), (error: unknown) => {
    assert.ok(error instanceof postgres.PostgresError);
    assert.equal(error.code, code);
    if (detail)
      assert.ok(
        error.constraint_name === detail || error.message.includes(detail),
        `Expected ${detail}; got ${error.constraint_name}: ${error.message}`
      );
    return true;
  });
}
export async function withFixture(
  t: TestContext,
  fn: (f: Fixture) => Promise<void>
): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    assert.notEqual(
      process.env.REQUIRE_RLS_INTEGRATION,
      '1',
      'Sponsor RLS tests require DATABASE_URL when REQUIRE_RLS_INTEGRATION=1.'
    );
    t.skip('DATABASE_URL is required for sponsor PostgreSQL integration tests');
    return;
  }
  const admin = postgres(url, { max: 1 });
  const a = createSponsorScope();
  const b = createSponsorScope();
  let seeded = false;
  try {
    // Sponsor policies use different names from requireRlsPreconditions; fail if 0099 is absent.
    const posture = await admin`select relname, relrowsecurity, relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and relname in ${admin(TABLES)}`;
    assert.equal(posture.length, TABLES.length, 'Migration 0099 must be applied');
    posture.forEach(p => assert.ok(p.relrowsecurity && p.relforcerowsecurity, p.relname));
    await admin`select pg_advisory_lock(192837465)`;
    try {
      await admin.unsafe(`do $$ begin create role ${quoteIdentifier(TEST_DB_ROLE)} nologin;
        exception when duplicate_object or unique_violation then null; end $$`);
      await grantRlsTestRole(drizzle(admin), TABLES);
      await serial(TABLES, async table => {
        await admin.unsafe(
          `grant insert, update, delete on ${quoteIdentifier(table)} to ${quoteIdentifier(TEST_DB_ROLE)}`
        );
      });
    } finally {
      await admin`select pg_advisory_unlock(192837465)`;
    }
    seeded = true;
    await seedSponsorRows(admin, a);
    await seedSponsorRows(admin, b);
    await fn({ admin, a, b });
  } finally {
    try {
      if (seeded) {
        const parents =
          'subscriptions member_leads membership_plans legal_entities user branches'.split(' ');
        await serial([...[...TABLES].reverse(), ...parents], async table => {
          await admin`delete from ${admin(table)} where tenant_id in ${admin([a.tenant, b.tenant])}`;
        });
        await admin`delete from tenants where id in ${admin([a.tenant, b.tenant])}`;
      }
    } finally {
      await admin.end({ timeout: 5 });
    }
  }
}
