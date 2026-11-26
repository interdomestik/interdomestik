import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';

import { withDisposableClient } from '../src/disposable-client';
import { migrateJournalBeforeNotificationDeliveries } from './journal-prefix.support';
import { scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';
import { runSequentially } from './in-order';
import { quoteIdentifier, quoteSqlLiteral } from './rls-test-connection';
import {
  grantNotificationDeliveryRowLocks,
  role,
  runtimeRole,
} from './wp11-notification-deliveries-rls.fixture';

const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));

export const tenantA = 'wp11-recipient-a';
export const tenantB = 'wp11-recipient-b';

export async function seedRecipient(
  admin: postgres.Sql,
  tenant: string,
  member: string,
  { roleName = 'member', preference = true } = {}
) {
  await admin`insert into tenants (id, name, legal_name, country_code)
    values (${tenant}, ${tenant}, ${tenant}, 'MK') on conflict (id) do nothing`;
  const email = `${member}@example.test`;
  await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
    values (${member}, ${tenant}, 'Synthetic recipient', ${email}, true, ${roleName}, now(), now())`;
  if (preference) {
    await admin`insert into user_locale_preferences (user_id, tenant_id, locale)
      values (${member}, ${tenant}, 'sq')`;
  }
  return email;
}

export function recipientScratchMissing() {
  return scratchServerMissing('REQUIRE_RLS_INTEGRATION');
}

export function withVerifiedRecipientDatabase(
  maxConnections: number,
  run: (fixture: {
    admin: postgres.Sql;
    runtime: postgres.Sql;
    loginName: string;
    appPoolSize: () => number | undefined;
  }) => Promise<void>
) {
  return withScratchDatabase(
    'wp11_recipient',
    async admin => {
      const loginName = `wp11_${randomUUID().replaceAll('-', '')}`;
      const login = quoteIdentifier(loginName);
      const password = randomUUID();
      const [existing] = await admin`select 1 from pg_roles where rolname = ${runtimeRole}`;
      if (!existing) await admin.unsafe(`create role ${role} nologin nosuperuser nobypassrls`);
      try {
        await admin.begin(async tx => {
          await tx.unsafe(`create role ${login} login noinherit nosuperuser nobypassrls
          password ${quoteSqlLiteral(password)}`);
          await tx.unsafe(`grant ${role} to ${login}`);
        });
        try {
          const migration = await migrateJournalBeforeNotificationDeliveries(admin, migrations);
          assert.ok(migration);
          // The reviewed deployment snapshot (db-config-staging-prod-2026-11-16b.md, Q-M2)
          // records SELECT on every public table for interdomestik_runtime_rls, including public."user".
          // Reproduce that read privilege and migration 0105's row-lock prerequisite in scratch.
          await admin.unsafe(`grant usage on schema public to ${role}`);
          await admin.unsafe(`grant select on public."user" to ${role}`);
          await grantNotificationDeliveryRowLocks(admin);
          await admin.begin(async tx => {
            // Later statements depend on earlier ones, so apply them in order.
            await runSequentially(migration.sql, async statement => {
              await tx.unsafe(statement);
            });
          });

          const [{ name }] = await admin<{ name: string }[]>`select current_database() as name`;
          const adminUrl = new URL(process.env.DATABASE_URL!);
          adminUrl.pathname = `/${name}`;
          const runtimeUrl = new URL(adminUrl);
          runtimeUrl.username = loginName;
          runtimeUrl.password = password;
          const env = {
            DATABASE_URL: adminUrl.toString(),
            DATABASE_URL_RLS: runtimeUrl.toString(),
            DB_RLS_ROLE: runtimeRole,
            DB_MAX_CONNECTIONS: String(maxConnections),
          };
          const saved = Object.entries(env).map(([name]) => [name, process.env[name]] as const);
          const pools = globalThis as typeof globalThis & {
            queryClientAdmin?: postgres.Sql;
            queryClientRls?: postgres.Sql;
          };
          assert.equal(
            pools.queryClientRls,
            undefined,
            'load the app database after fixture setup'
          );
          Object.assign(process.env, env);
          try {
            await withDisposableClient(
              runtimeUrl.toString(),
              { applicationName: 'wp11_recipient_runtime', max: 1 },
              runtime =>
                run({
                  admin,
                  runtime,
                  loginName,
                  appPoolSize: () => pools.queryClientRls?.options.max,
                })
            );
          } finally {
            const clients = [pools.queryClientAdmin, pools.queryClientRls];
            delete pools.queryClientAdmin;
            delete pools.queryClientRls;
            for (const [name, value] of saved) {
              if (value === undefined) delete process.env[name];
              else process.env[name] = value;
            }
            await Promise.all([...new Set(clients)].map(client => client?.end({ timeout: 1 })));
          }
        } finally {
          await admin.unsafe(`drop role ${login}`);
        }
      } finally {
        if (!existing) {
          await admin.unsafe(`drop owned by ${role}`);
          await admin.unsafe(`drop role ${role}`);
        }
      }
    },
    { maxConnections: 2 }
  );
}
