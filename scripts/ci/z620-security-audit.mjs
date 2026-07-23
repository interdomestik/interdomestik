#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

let lastStatus = 1;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const audit = spawnSync('pnpm', ['audit', '--prod', '--audit-level=high', '--json'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  const gate = spawnSync('node', ['scripts/pnpm-audit-gate.mjs'], {
    input: audit.stdout,
    encoding: 'utf8',
  });
  process.stdout.write(gate.stdout || '');
  process.stderr.write(gate.stderr || '');
  lastStatus = gate.status ?? 1;
  if (lastStatus === 0) process.exit(0);
  console.error(`pnpm audit gate failed (attempt ${attempt}/3)`);
}
process.exit(lastStatus);
