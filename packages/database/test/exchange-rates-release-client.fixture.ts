import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

import { withDisposableClient } from '../src/disposable-client';
import {
  quoteIdentifier,
  quoteSqlLiteral,
  resolveRlsTestConnectionConfig,
  TEST_DB_ROLE,
} from './rls-test-connection';

async function releaseDatabase(admin: postgres.Sql) {
  const [{ database }] = await admin<{ database: string }[]>`select current_database() as database`;
  assert.match(database, /^wp07_payment_[a-f\d]{12}$/u);
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/${database}`;
  return { database, url };
}

export async function withPaymentPortReleaseClient<T>(
  admin: postgres.Sql,
  run: (client: postgres.Sql) => Promise<T>
): Promise<T> {
  const { database, url } = await releaseDatabase(admin);
  const { databaseUrlRls } = resolveRlsTestConnectionConfig(url.toString());
  assert.ok(databaseUrlRls, 'the test release writer requires its own login');

  const role = quoteIdentifier(TEST_DB_ROLE);
  // The journal's scratch role is separate from runtime. Give it the privileges of the writer.
  await admin.unsafe(`grant update (id) on public.exchange_rate_books to ${role}`);
  await admin.unsafe(`grant select, insert, update, delete
    on public.exchange_rate_verification_limits to ${role}`);
  await admin.unsafe(`grant select, insert on public.audit_log to ${role}`);

  return withDisposableClient(
    databaseUrlRls,
    { applicationName: 'wp07_release_test' },
    async client => {
      const [context] = await client`select current_database() as database, session_user as login,
        current_user as role, rolsuper, rolbypassrls,
        row_security_active('public.exchange_rate_verification_limits') as limits,
        (select relforcerowsecurity from pg_class
          where oid = 'public.exchange_rate_verification_limits'::regclass) as limits_forced,
        row_security_active('public.audit_log') as receipts from pg_roles where rolname = session_user`;
      assert.deepEqual(context, {
        database,
        login: TEST_DB_ROLE,
        role: TEST_DB_ROLE,
        rolsuper: false,
        rolbypassrls: false,
        limits: true,
        limits_forced: true,
        receipts: true,
      });
      return run(client);
    }
  );
}

export async function withPrivilegedReleaseLogin(
  admin: postgres.Sql,
  posture: 'bypassrls' | 'audit-owner-member' | 'set-role-bypassrls',
  run: (client: postgres.Sql) => Promise<void>
) {
  const { database, url } = await releaseDatabase(admin);
  const username = `wp07_release_${randomUUID().replaceAll('-', '')}`;
  const role = quoteIdentifier(username);
  const password = randomUUID();
  const bypassRls = posture === 'bypassrls';
  const setRole = posture === 'set-role-bypassrls';
  const effective = setRole ? `${username}_bypassrls` : username;
  const effectiveRole = quoteIdentifier(effective);
  await admin.unsafe(
    `create role ${role} login nosuperuser ${bypassRls ? 'bypassrls' : 'nobypassrls'}
      password ${quoteSqlLiteral(password)}`
  );
  url.username = username;
  url.password = password;
  try {
    if (posture === 'audit-owner-member') {
      const [{ owner }] = await admin<{ owner: string }[]>`
        select pg_get_userbyid(relowner) as owner from pg_class
        where oid = 'public.audit_log'::regclass`;
      // Inherit the table owner's privileges while preventing SET ROLE to that owner.
      await admin.unsafe(`grant ${quoteIdentifier(owner)} to ${role} with inherit true, set false`);
    }
    if (setRole) {
      await admin.unsafe(`create role ${effectiveRole} nologin nosuperuser bypassrls`);
      await admin.unsafe(`grant ${effectiveRole} to ${role} with inherit false, set true`);
    }
    await withDisposableClient(
      url.toString(),
      { applicationName: 'wp07_release_privileged_test' },
      async client => {
        if (setRole) await client.unsafe(`set role ${effectiveRole}`);
        const [context] = await client`select current_database() as database, session_user as login,
          current_user as role, login_role.rolsuper, login_role.rolbypassrls,
          effective_role.rolsuper as role_superuser, effective_role.rolbypassrls as role_bypassrls,
          (select pg_has_role(session_user, relowner, 'MEMBER') from pg_class
            where oid = 'public.audit_log'::regclass) as audit_owner_member,
          row_security_active('public.audit_log') as receipts
          from pg_roles as login_role, pg_roles as effective_role
          where login_role.rolname = session_user and effective_role.rolname = current_user`;
        assert.deepEqual(context, {
          database,
          login: username,
          role: effective,
          rolsuper: false,
          rolbypassrls: bypassRls,
          role_superuser: false,
          role_bypassrls: bypassRls || setRole,
          audit_owner_member: posture === 'audit-owner-member',
          receipts: false,
        });
        await run(client);
      }
    );
  } finally {
    const roles = setRole ? [role, effectiveRole] : [role];
    await admin.unsafe(`drop role if exists ${roles.join(', ')}`);
  }
}
