import { spawn } from 'node:child_process';
import process from 'node:process';
import safeCommand from './security/safe-command.cjs';

const [command, ...args] = process.argv.slice(2);
const resolvedCommand = command ? safeCommand.resolveAllowedCommand(command, args) : '';

if (!resolvedCommand) {
  console.error('Usage: node scripts/run-with-default-db-url.mjs <command> [args...]');
  process.exit(2);
}

const resolvedDbUrl =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const resolvedBetterAuthSecret =
  process.env.BETTER_AUTH_SECRET ?? 'test-secret-for-local-dev-only-32chars-minimum';

process.env.DATABASE_URL = resolvedDbUrl;
process.env.DATABASE_URL_RLS = process.env.DATABASE_URL_RLS ?? resolvedDbUrl;
process.env.E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? resolvedDbUrl;
process.env.E2E_DATABASE_URL_RLS = process.env.E2E_DATABASE_URL_RLS ?? process.env.DATABASE_URL_RLS;
process.env.BETTER_AUTH_SECRET = resolvedBetterAuthSecret;

const child = spawn(resolvedCommand, args, {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

child.on('exit', code => {
  process.exit(code ?? 1);
});
