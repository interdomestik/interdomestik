#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// Fixed scope: whole-repository static guards plus all pure case/recovery unit tests.
// Direct Node entrypoints avoid package lifecycle hooks, Turbo remote cache, and builds.
const steps = [
  ['i18n', ['scripts/check-i18n.mjs']],
  ['entrypoints', ['scripts/check-entrypoints-no-db.mjs', '--strict']],
  ['portal-layout', ['scripts/check-portal-layout-topology.mjs']],
  ['architecture', ['scripts/check-architecture-boundaries.mjs']],
  ['case-recovery-boundaries', ['scripts/check-case-recovery-boundaries.mjs']],
  ['country-host-aliases', ['scripts/check-country-host-alias-guard.mjs']],
  [
    'unit',
    [
      '--import',
      'tsx',
      '--test',
      '--test-concurrency=2',
      'packages/domain-case/src/*.test.ts',
      'packages/domain-recovery/src/*.test.ts',
    ],
  ],
];
const started = performance.now();
const env = {
  ...process.env,
  NODE_ENV: 'test',
  REQUIRE_RLS_INTEGRATION: '0',
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/fast_unit',
  DATABASE_URL_RLS: 'postgresql://unused:unused@127.0.0.1:1/fast_unit',
};
// Node's test runner otherwise suppresses nested --test invocations in contract tests.
delete env.NODE_TEST_CONTEXT;
for (const [name, args] of steps) {
  console.log(`[check:fast] ${name}`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env });
  if (result.error) console.error(`check:fast could not start ${name}: ${result.error.code}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`[check:fast] passed in ${((performance.now() - started) / 1000).toFixed(2)}s`);
