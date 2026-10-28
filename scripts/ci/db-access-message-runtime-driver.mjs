import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  MESSAGE_PROOF_CONTRACT,
  MESSAGE_RUNS,
  messageCaseIdentities,
} from './db-access-message-proof-registry.mjs';
import {
  messageRunResultFile,
  validateMessageRunResult,
  validateMessageRuntimeResults,
} from './db-access-message-runtime-result.mjs';

// Runs only inside the parent's isolated, source-authenticated, owned PG16 assembly.
// Each registered file gets a fresh Vitest CLI because each role fixture replaces the global
// clients and DB_RLS_ROLE; teardown is checked after every file, not only at the end.
const root = import.meta.dirname;
// Stays inside the parent's unchanged 180-second bound so a slow run fails here, logged.
const deadline = Date.now() + 170000;
const admin = postgres(process.env.DATABASE_URL, { max: 1 });
async function fixtureStateClean() {
  const [row] = await admin`
    select
      (select count(*)::int from pg_roles where rolname like 'message_rls_%') as roles,
      (select count(*)::int from tenants
        where id like 'message_home_%' or id like 'message_other_%') as tenants,
      (select count(*)::int from "user"
        where id like 'message_member_%' or id like 'message_other_%'
          or id like 'message_staff_%' or id like 'message_agent_%') as users
  `;
  return row.roles === 0 && row.tenants === 0 && row.users === 0;
}
try {
  const [version] = await admin`select current_setting('server_version_num')::int as version`;
  if (version.version < 160000 || version.version >= 170000) throw new Error('Owned PG16 required');
  const [before] =
    await admin`select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`;
  if (before.count !== 0) throw new Error('Messages proof requires empty owned public schema');
  await migrate(drizzle(admin), { migrationsFolder: path.join(root, 'packages/database/drizzle') });
  if (!(await fixtureStateClean())) throw new Error('Foreign message fixture roles or rows');
  const reports = [];
  for (const [index, run] of MESSAGE_RUNS.entries()) {
    const remaining = deadline - Date.now();
    if (remaining < 15000) throw new Error('Message runtime deadline exhausted before ' + run.file);
    const resultFile = path.join(root, messageRunResultFile(index));
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, 'node_modules/vitest/vitest.mjs'),
        'run',
        run.testPath,
        '--config',
        run.config,
        '--reporter=json',
        '--outputFile=' + resultFile,
      ],
      {
        cwd: path.join(root, run.cwd),
        env: { ...process.env, MESSAGE_RLS_INTEGRATION: '1', REQUIRE_RLS_INTEGRATION: '1' },
        shell: false,
        encoding: 'utf8',
        timeout: Math.min(120000, remaining),
        maxBuffer: 8 * 1024 * 1024,
      }
    );
    process.stdout.write('== ' + run.file + '\n' + (result.stdout ?? ''));
    process.stderr.write(result.stderr ?? '');
    if (result.error || result.signal || result.status !== 0)
      throw new Error('Actual messages test runner failed: ' + run.file);
    const report = JSON.parse(fs.readFileSync(resultFile));
    validateMessageRunResult(report, run);
    reports.push(report);
    if (!(await fixtureStateClean()))
      throw new Error('Message fixture teardown incomplete: ' + run.file);
  }
  const files = validateMessageRuntimeResults(reports);
  fs.writeFileSync(
    path.join(root, 'message-completion.json'),
    JSON.stringify({
      version: MESSAGE_PROOF_CONTRACT.version,
      contractId: MESSAGE_PROOF_CONTRACT.id,
      identities: messageCaseIdentities(),
      files,
      passedTests: MESSAGE_PROOF_CONTRACT.requiredTests,
      setupComplete: true,
      teardownComplete: true,
      postgres: version.version,
    })
  );
} finally {
  await admin.end({ timeout: 2 });
}
