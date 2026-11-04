#!/usr/bin/env node
// CLI for scripts/e2e-runtime-role.mjs (Plan070 U2-a), kept apart so the library stays importable
// from CommonJS test runners.
//   --check-target  validate E2E_DATABASE_URL before any destructive preparation
//   --print-url     provision the runtime role and print its URL on stdout only
import {
  assertE2eRuntimeTarget,
  describeRuntimeRoleFailure,
  E2E_RUNTIME_ROLE,
  provisionE2eRuntimeRole,
  RuntimeRoleError,
} from './e2e-runtime-role.mjs';

try {
  const adminUrl = process.env.E2E_DATABASE_URL;
  if (!adminUrl) throw new RuntimeRoleError('E2E_DATABASE_URL is required');
  if (process.argv.includes('--check-target')) {
    assertE2eRuntimeTarget(adminUrl);
  } else {
    const runtimeUrl = await provisionE2eRuntimeRole({
      adminUrl,
      runtimeUrl: process.env.E2E_SERVER_DATABASE_URL_RLS || undefined,
    });
    console.error(`[e2e-runtime-role] ${E2E_RUNTIME_ROLE} provisioned (restricted, RLS enforced)`);
    // Only the caller's command substitution reads the URL; it is never logged.
    if (process.argv.includes('--print-url')) process.stdout.write(runtimeUrl);
  }
} catch (error) {
  console.error(`[e2e-runtime-role] failed: ${describeRuntimeRoleFailure(error)}`);
  process.exit(1);
}
