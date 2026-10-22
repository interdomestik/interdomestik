import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const commands = Object.freeze({
  seed: ['seed:e2e', '--', '--reset'],
  assert: ['seed:assert-e2e'],
});

export function administrativeSeedProfile(mode, parent) {
  if (!Object.hasOwn(commands, mode)) throw new Error('Unknown administrative seed operation');
  if (
    parent.NODE_ENV === 'production' ||
    parent.VERCEL ||
    parent.VERCEL_ENV === 'production' ||
    parent.REQUIRE_RLS_INTEGRATION
  ) {
    throw new Error('Administrative seed refuses production or required-RLS profiles');
  }
  let target;
  try {
    target = new URL(parent.DATABASE_URL);
  } catch {
    throw new Error('Administrative seed requires an explicit local test database');
  }
  const synthetic = target.pathname === '/interdomestik_test';
  const localSupabase = target.pathname === '/postgres' && target.port === '54322';
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.username !== 'postgres' ||
    !target.password ||
    !target.port ||
    target.search ||
    target.hash ||
    (!synthetic && !localSupabase)
  ) {
    throw new Error('Administrative seed target must be the local synthetic or Supabase database');
  }
  // Explicit values prevent seed dotenv loading from restoring the application profile.
  // Only this fixed bootstrap child receives the administrative principal.
  const env = {
    ...parent,
    NODE_ENV: parent.NODE_ENV || 'development',
    VERCEL: '',
    VERCEL_ENV: parent.VERCEL_ENV || '',
    REQUIRE_RLS_INTEGRATION: '',
    DATABASE_URL_RLS: parent.DATABASE_URL,
    E2E_DATABASE_URL_RLS: parent.DATABASE_URL,
    DB_RLS_ROLE: '',
  };
  return { args: [...commands[mode]], env };
}

export function runAdministrativeSeed(mode, parent = process.env) {
  const { args, env } = administrativeSeedProfile(mode, parent);
  const result = spawnSync('pnpm', args, {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    env,
    shell: false,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3)
    throw new Error('Expected one fixed administrative seed operation');
  process.exitCode = runAdministrativeSeed(process.argv[2]);
}
