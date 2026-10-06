import type { dbAdmin } from '@interdomestik/database';
import type { Browser, Page, TestInfo } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, lstat, writeFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { withFreshPage } from './login-handoff-page';

export type OwnedExpiryFixture = {
  url: string;
  db: Pick<typeof dbAdmin, 'select' | 'update'>;
};
const root = path.resolve(__dirname, '../../../../..');
function parsedURL(raw: string) {
  try {
    const value = new URL(raw);
    return ['postgres:', 'postgresql:'].includes(value.protocol) ? value : null;
  } catch {
    return null;
  }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function knownLane(url: URL, env: NodeJS.ProcessEnv) {
  return (
    (url.hostname === '127.0.0.1' &&
      url.port === '55438' &&
      url.pathname === '/interdomestik_test') ||
    (url.hostname === '127.0.0.1' && url.port === '54322' && url.pathname === '/postgres') ||
    ((env.CI === '1' || env.CI === 'true') &&
      ['127.0.0.1', 'ci-postgres'].includes(url.hostname) &&
      url.port === '5432' &&
      url.pathname === '/interdomestik_test')
  );
}

export function selectExpiryFixture(env: NodeJS.ProcessEnv) {
  const explicit = env.LOGIN_HANDOFF_FIXTURE_DATABASE_URL;
  if (explicit) {
    const url = parsedURL(explicit);
    if (
      url?.hostname !== '127.0.0.1' ||
      url.port !== '5432' ||
      url.pathname !== '/interdomestik_test'
    )
      throw new Error('isolated expiry fixture target rejected');
    return { url: explicit, bootstrap: true };
  }
  const configured = env.DATABASE_URL;
  const configuredURL = configured ? parsedURL(configured) : null;
  if (configured && configuredURL && knownLane(configuredURL, env))
    return { url: configured, bootstrap: false };
  if ((env.CI === '1' || env.CI === 'true') && env.PLAYWRIGHT === '1') {
    // This is the workflow-declared spare service, never the configured remote URL.
    return {
      url: 'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test',
      bootstrap: true,
    };
  }
  throw new Error('isolated expiry fixture selection rejected');
}

function signalOwned(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

const setupTimeoutMs = 60_000;
const readinessTimeoutMs = 15_000;
const cleanupTimeoutMs = 5_000;
export const isolatedExpiryAdditionalTimeoutMs =
  2 * setupTimeoutMs + readinessTimeoutMs + cleanupTimeoutMs;

async function stopOwned(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  try {
    signalOwned(child.pid, 'SIGTERM');
    await Promise.race([
      exited,
      new Promise<void>(resolve => {
        timer = setTimeout(resolve, cleanupTimeoutMs);
      }),
    ]);
    if (child.exitCode === null && child.signalCode === null) signalOwned(child.pid, 'SIGKILL');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function pnpmLauncher() {
  const script = process.env.npm_execpath;
  if (!script || !path.isAbsolute(script) || path.basename(script) !== 'pnpm.cjs')
    throw new Error('isolated expiry package launcher missing');
  const fixed = await realpath(script);
  const owned = await lstat(fixed);
  if (!owned.isFile() || ![0, process.getuid?.()].includes(owned.uid) || (owned.mode & 0o022) !== 0)
    throw new Error('isolated expiry package launcher ownership mismatch');
  return fixed;
}

async function runSetup(command: 'db:migrate' | 'seed:e2e', env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [await pnpmLauncher(), command], {
    cwd: root,
    env,
    detached: true,
    stdio: 'ignore',
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const exit = await Promise.race([
      new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('isolated expiry setup deadline')),
          setupTimeoutMs
        );
      }),
    ]);
    if (exit !== 0) throw new Error('isolated expiry setup failed');
  } finally {
    if (timer) clearTimeout(timer);
    await stopOwned(child);
  }
}

async function bootstrapSpare(
  identity: { tables: number; started: string },
  url: string,
  env: NodeJS.ProcessEnv
) {
  const directory = path.join(tmpdir(), `ida-expiry-${digest(root + url)}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const owner = await lstat(directory);
  if (owner.isSymbolicLink() || owner.uid !== process.getuid?.() || (owner.mode & 0o777) !== 0o700)
    throw new Error('isolated expiry bootstrap ownership mismatch');
  const marker = path.join(directory, 'bootstrap.json');
  if (identity.tables === 0) {
    await runSetup('db:migrate', env);
    await runSetup('seed:e2e', env);
    await writeFile(marker, JSON.stringify({ started: identity.started }), {
      mode: 0o600,
      flag: 'wx',
    });
    return;
  }
  const owned = await lstat(marker);
  if (
    owned.isSymbolicLink() ||
    !owned.isFile() ||
    owned.uid !== owner.uid ||
    (owned.mode & 0o777) !== 0o600 ||
    JSON.parse(await readFile(marker, 'utf8')).started !== identity.started
  )
    throw new Error('isolated expiry spare service was not bootstrapped by this fixture');
}

async function awaitOwnedRuntime(child: ChildProcess, port: number) {
  let tail = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('isolated expiry runtime readiness deadline')),
        readinessTimeoutMs - 5000
      );
      child.once('error', () => reject(new Error('isolated expiry runtime start failed')));
      child.once('exit', () => reject(new Error('isolated expiry runtime exited')));
      child.stdout?.on('data', chunk => {
        tail = (tail + String(chunk)).slice(-256);
        if (/Ready in \d+(?:ms|s)/.test(tail)) resolve();
      });
    });
    const response = await fetch(`http://127.0.0.1:${port}/robots.txt`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || child.exitCode !== null || child.signalCode !== null)
      throw new Error('isolated expiry runtime failed readiness');
  } finally {
    if (timer) clearTimeout(timer);
    tail = '';
  }
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('isolated expiry port missing');
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  return address.port; // Binding race fails startup; teardown never targets another listener.
}

export async function withIsolatedExpiry(
  browser: Browser,
  info: TestInfo,
  run: (page: Page, fixture: OwnedExpiryFixture, isolatedInfo: TestInfo) => Promise<void>
) {
  const selected = selectExpiryFixture(process.env);
  const postgres = createRequire(path.join(root, 'packages/database/package.json'))('postgres') as (
    url: string,
    options: object
  ) => typeof dbAdmin.$client;
  const sql = postgres(selected.url, { max: 1, connect_timeout: 5, onnotice: () => {} });
  let server: ChildProcess | undefined;
  try {
    const [identity] = await sql`select current_database() as name,
      pg_postmaster_start_time()::text as started,
      (select count(*)::int from pg_tables where schemaname='public') as tables`;
    if (selected.bootstrap && identity.name !== 'interdomestik_test')
      throw new Error('isolated expiry spare database mismatch');
    const port = await freePort();
    const base = new URL(info.project.use.baseURL as string);
    base.port = String(port);
    const env = {
      ...process.env,
      DATABASE_URL: selected.url,
      DATABASE_URL_RLS: selected.url,
      E2E_DATABASE_URL: selected.url,
      E2E_DATABASE_URL_RLS: selected.url,
      PORT: String(port),
      PW_PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NEXT_PUBLIC_APP_URL: base.origin,
      BETTER_AUTH_URL: base.origin,
      BETTER_AUTH_TRUSTED_ORIGINS: `http://127.0.0.1:${port},http://localhost:${port},${base.origin}`,
      INTERDOMESTIK_AUTOMATED: '1',
      INTERDOMESTIK_LOCAL_E2E: '1',
      PLAYWRIGHT: '1',
      NEXT_PUBLIC_BILLING_TEST_MODE: '1',
    };
    if (selected.bootstrap)
      await bootstrapSpare(identity as { tables: number; started: string }, selected.url, env);
    const artifact = path.join(root, 'apps/web/.next/standalone/.build-stamp.json');
    const before = digest(await readFile(artifact, 'utf8'));
    server = spawn('/bin/bash', [path.join(root, 'scripts/e2e-webserver.sh')], {
      cwd: root,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    await awaitOwnedRuntime(server, port);
    const isolatedInfo = {
      ...info,
      project: {
        ...info.project,
        use: { ...info.project.use, baseURL: base.href },
      },
    } as TestInfo;
    await withFreshPage(browser, isolatedInfo, true, page =>
      run(page, { url: selected.url, db: drizzle(sql) }, isolatedInfo)
    );
    if (digest(await readFile(artifact, 'utf8')) !== before)
      throw new Error('isolated expiry build changed');
    info.annotations.push({
      type: 'isolated-expiry-runtime',
      description: JSON.stringify({
        normalUI: true,
        sameBuild: true,
        bootstrap: selected.bootstrap,
        unknownDatabaseContacted: false,
        port,
        ownershipVerified: true,
      }),
    });
  } finally {
    try {
      if (server) await stopOwned(server);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}
