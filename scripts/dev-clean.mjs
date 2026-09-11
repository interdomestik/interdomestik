#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packageCommandRuntime } from './package-command-runtime.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
if (process.argv.length > 2) {
  console.error('dev:clean accepts no arguments; it checks the configured development port 3000.');
  process.exit(2);
}
const probeRuntime = packageCommandRuntime('lsof');
const probe = spawnSync(probeRuntime.executable, ['-nP', '-t', '-iTCP:3000', '-sTCP:LISTEN'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 5000,
  env: probeRuntime.env,
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

const devRuntime = packageCommandRuntime('pnpm');
const result = spawnSync(devRuntime.executable, ['dev'], {
  cwd: root,
  stdio: 'inherit',
  env: devRuntime.env,
});
if (result.error) console.error(`dev:clean could not start dev: ${result.error.code}`);
process.exit(result.status ?? 1);
