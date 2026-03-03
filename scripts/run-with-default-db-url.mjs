import { spawn } from 'node:child_process';
import process from 'node:process';

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node scripts/run-with-default-db-url.mjs <command> [args...]');
  process.exit(2);
}

const resolvedDbUrl =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

process.env.DATABASE_URL = resolvedDbUrl;
process.env.DATABASE_URL_RLS = process.env.DATABASE_URL_RLS ?? resolvedDbUrl;
process.env.E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? resolvedDbUrl;
process.env.E2E_DATABASE_URL_RLS = process.env.E2E_DATABASE_URL_RLS ?? process.env.DATABASE_URL_RLS;

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

child.on('exit', code => {
  process.exit(code ?? 1);
});
