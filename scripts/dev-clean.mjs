#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lsof = process.env.INTERDOMESTIK_LSOF_EXECUTABLE || 'lsof';
const devCommand = process.env.INTERDOMESTIK_DEV_COMMAND_EXECUTABLE || 'pnpm';
if (process.argv.length > 2) {
  console.error('dev:clean accepts no arguments; it checks the configured development port 3000.');
  process.exit(2);
}
const probe = spawnSync(lsof, ['-nP', '-t', '-iTCP:3000', '-sTCP:LISTEN'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 5000,
});

if (probe.status === 0 && probe.stdout?.trim()) {
  console.error(
    'dev:clean refused: port 3000 is already in use. Stop its owner from that session before retrying. No process was stopped.'
  );
  process.exit(1);
}
if (probe.error || probe.status !== 1 || probe.stdout?.trim() || probe.stderr?.trim()) {
  console.error(
    'dev:clean could not safely determine whether port 3000 is free. No process was stopped.'
  );
  process.exit(1);
}

const result = spawnSync(devCommand, ['dev'], { cwd: root, stdio: 'inherit' });
if (result.error) console.error(`dev:clean could not start dev: ${result.error.code}`);
process.exit(result.status ?? 1);
