import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { validateMessageTestResult } from './db-access-message-runtime-result.mjs';

// Runs only inside the parent's isolated, source-authenticated, owned PG16 assembly.
const root = import.meta.dirname;
const admin = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const [version] = await admin`select current_setting('server_version_num')::int as version`;
  if (version.version < 160000 || version.version >= 170000) throw new Error('Owned PG16 required');
  const [before] =
    await admin`select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`;
  if (before.count !== 0) throw new Error('Messages proof requires empty owned public schema');
  await migrate(drizzle(admin), { migrationsFolder: path.join(root, 'packages/database/drizzle') });
  const [rolesBefore] =
    await admin`select count(*)::int as count from pg_roles where rolname like 'message_rls_%'`;
  if (rolesBefore.count !== 0) throw new Error('Foreign message fixture roles');
  const cwd = path.join(root, 'packages/domain-communications');
  const resultFile = path.join(root, 'messages-result.json');
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      'src/messages/tenant-context.integration.test.ts',
      '--config',
      'vitest.config.ts',
      '--reporter=json',
      '--outputFile=' + resultFile,
    ],
    {
      cwd,
      env: { ...process.env, MESSAGE_RLS_INTEGRATION: '1', REQUIRE_RLS_INTEGRATION: '1' },
      shell: false,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.error || result.signal || result.status !== 0)
    throw new Error('Actual messages test runner failed');
  const identities = validateMessageTestResult(JSON.parse(fs.readFileSync(resultFile)));
  const [rolesAfter] =
    await admin`select count(*)::int as count from pg_roles where rolname like 'message_rls_%'`;
  const [tenantsAfter] =
    await admin`select count(*)::int as count from tenants where id like 'message_home_%' or id like 'message_other_%'`;
  if (rolesAfter.count !== 0 || tenantsAfter.count !== 0)
    throw new Error('Message fixture teardown incomplete');
  fs.writeFileSync(
    path.join(root, 'message-completion.json'),
    JSON.stringify({
      identities,
      passedTests: 9,
      setupComplete: true,
      teardownComplete: true,
      postgres: version.version,
    })
  );
} finally {
  await admin.end({ timeout: 2 });
}
