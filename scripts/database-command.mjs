#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packageCommandRuntime } from './package-command-runtime.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const [operation, ...input] = process.argv.slice(2);
// pnpm run may forward a leading separator; never forward it to Supabase.
const userArgs = input[0] === '--' ? input.slice(1) : input;
const localFlags = new Set(['--dry-run', '--include-all', '--help', '-h']);
let args;

if (operation === 'generate') {
  args = ['--filter', '@interdomestik/database', 'run', 'generate', ...userArgs];
} else if (operation === 'push-local') {
  if (userArgs.some(arg => !localFlags.has(arg))) {
    // Do not echo rejected arguments: a URL or password may contain credentials.
    console.error(
      'refused unsafe push-local argument; allowed: --dry-run, --include-all, --help, -h'
    );
    process.exit(2);
  }
  args = [
    '--filter',
    '@interdomestik/database',
    'exec',
    'supabase',
    'db',
    'push',
    '--local',
    '--workdir',
    root,
    ...userArgs,
  ];
} else {
  console.error('usage: database-command.mjs <generate|push-local> [args...]');
  process.exit(2);
}

const runtime = packageCommandRuntime('pnpm');
const result = spawnSync(runtime.executable, args, {
  cwd: root,
  stdio: 'inherit',
  env: runtime.env,
});
if (result.error) console.error(`database command failed to start: ${result.error.code}`);
process.exit(result.status ?? 1);
