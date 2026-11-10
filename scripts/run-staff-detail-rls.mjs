#!/usr/bin/env node
// Explicit SQL proof; usage and required database posture: scripts/staff-detail-rls.md.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  describeRuntimeRoleFailure,
  provisionE2eRuntimeRole,
  RuntimeRoleError,
} from './e2e-runtime-role.mjs';

async function run() {
  const adminUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new RuntimeRoleError('Staff detail proof requires E2E_DATABASE_URL or DATABASE_URL');
  }
  let target;
  try {
    target = new URL(adminUrl);
  } catch {
    throw new RuntimeRoleError('Staff detail proof requires a valid local database URL');
  }
  const synthetic =
    target.pathname === '/interdomestik_test' ||
    (target.pathname === '/postgres' && target.port === '54322');
  if (target.hostname !== '127.0.0.1' || !synthetic) {
    throw new RuntimeRoleError('Staff detail proof requires the loopback restricted-lane database');
  }
  // Existing helper validates protocol/options and proves a fresh, nonowning NOBYPASSRLS LOGIN.
  const runtimeUrl = await provisionE2eRuntimeRole({
    adminUrl,
    runtimeUrl: process.env.E2E_SERVER_DATABASE_URL_RLS,
  });
  const webRoot = fileURLToPath(new URL('../apps/web/', import.meta.url));
  const vitest = fileURLToPath(
    new URL('../apps/web/node_modules/vitest/vitest.mjs', import.meta.url)
  );
  const child = spawn(
    process.execPath,
    [
      vitest,
      'run',
      '--environment=node',
      '--maxWorkers=1',
      '--no-file-parallelism',
      '--testTimeout=30000',
      'src/app/[locale]/(staff)/staff/claims/[id]/staff-detail-rls.integration.test.ts',
    ],
    {
      cwd: webRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        E2E_DATABASE_URL: adminUrl,
        DATABASE_URL: adminUrl,
        DATABASE_URL_RLS: runtimeUrl,
        DB_MAX_CONNECTIONS: '1',
        REQUIRE_RLS_INTEGRATION: '1',
        S8_STAFF_DETAIL_DB_PROOF: '1',
        S8_STAFF_DETAIL_RUN_TOKEN: randomBytes(8).toString('hex'),
      },
    }
  );
  child.on('error', () => {
    console.error('Unable to start staff detail proof');
    process.exitCode = 1;
  });
  child.on('exit', code => {
    process.exitCode = code ?? 1;
  });
}

try {
  await run();
} catch (error) {
  console.error(`Staff detail proof failed: ${describeRuntimeRoleFailure(error)}`);
  process.exitCode = 1;
}
