#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const commands = [
  ['bash', ['scripts/m4-gatekeeper.sh']],
  ['node', ['scripts/run-e2e-lane.mjs', 'state']],
  [
    'pnpm',
    [
      '--filter',
      '@interdomestik/web',
      'exec',
      'playwright',
      'test',
      'e2e/gate/seed-contract.spec.ts',
      '--project=gate-ks-sq',
      '--workers=4',
      '--max-failures=1',
      '--trace=retain-on-failure',
      '--reporter=line',
    ],
  ],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
