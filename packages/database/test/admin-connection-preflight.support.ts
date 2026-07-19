import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import postgres from 'postgres';
import type { AdminConnectionAuthority } from '../src/admin-connection-preflight';

const exec = promisify(execFile);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const IMPORT = /from ['"][^'"]*admin-connection-preflight['"]/;

export type FixtureReceipt = Readonly<{
  imageId: string;
  containerName: string;
  port: number;
  databasePrefix: 'interdomestik_admin_config_p0a0b_';
  expectedRolsuper: false;
  expectedRolbypassrls: false;
  startedAt: string;
  removedAt?: string;
}>;

export type AdminFixture = Awaited<ReturnType<typeof startAdminFixture>>;

export function findAdminPreflightImports() {
  const files: string[] = [];
  const scan = (dir: URL, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = `${prefix}/${entry.name}`;
      const next = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);
      if (entry.isDirectory()) scan(next, relative);
      else if (/\.tsx?$/.test(relative) && IMPORT.test(readFileSync(next, 'utf8')))
        files.push(relative);
    }
  };
  scan(new URL('../../', import.meta.url), 'packages');
  return files.sort((left, right) => left.localeCompare(right));
}

async function docker(...args: string[]): Promise<string> {
  return (await exec('docker', args, { timeout: 60_000 })).stdout.trim();
}

async function connectEventually(port: number) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const sql = postgres({ host: '127.0.0.1', port, database: 'postgres', username: 'postgres' });
    try {
      await sql`SELECT 1`;
      return sql;
    } catch {
      await sql.end({ timeout: 0 });
      await delay(100);
    }
  }
  throw new Error('DISPOSABLE_POSTGRES_NOT_READY');
}

export async function startAdminFixture() {
  const suffix = randomBytes(6).toString('hex');
  const containerName = `ida-p0a0b-ecea-${suffix}`;
  const database = `interdomestik_admin_config_p0a0b_${suffix}`;
  const owner = `p0a0b_owner_${suffix}`;
  const nonowner = `p0a0b_nonowner_${suffix}`;
  const password = randomBytes(18).toString('hex');
  const startedAt = new Date().toISOString();
  await docker(
    'run',
    '--detach',
    '--rm',
    '--name',
    containerName,
    '--env',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '--publish',
    '127.0.0.1::5432',
    'postgres:16'
  );
  const port = Number(
    await docker('port', containerName, '5432/tcp').then(v => v.split(':').at(-1))
  );
  const bootstrap = await connectEventually(port);
  try {
    await bootstrap.unsafe(`CREATE ROLE ${owner} LOGIN NOSUPERUSER NOBYPASSRLS NOREPLICATION`);
    await bootstrap.unsafe(`CREATE ROLE ${nonowner} LOGIN NOSUPERUSER NOBYPASSRLS NOREPLICATION`);
    await bootstrap.unsafe(`CREATE DATABASE ${database} OWNER ${owner}`);
  } finally {
    await bootstrap.end({ timeout: 1 });
  }
  const observer = postgres({
    host: '127.0.0.1',
    port,
    database,
    username: 'postgres',
    max: 1,
    connection: { application_name: `p0a0b_observer_${suffix}` },
  });
  const endpointSha256 = sha256(`127.0.0.1:${port}`);
  const authorityBase = {
    environmentClass: 'local_scratch' as const,
    endpointSha256,
    caSha256: sha256(''),
    expectedRolsuper: false as const,
    expectedRolbypassrls: false as const,
  };
  const authority: AdminConnectionAuthority = Object.freeze({
    ...authorityBase,
    receiptSha256: sha256(JSON.stringify(authorityBase)),
  });
  const envFor = (username: string) =>
    Object.freeze({
      DATABASE_URL: `postgres://${username}:${password}@127.0.0.1:${port}/${database}`,
      NODE_ENV: 'test',
      ADMIN_DB_LOCAL_SCRATCH: '1',
    });
  const receipt: FixtureReceipt = Object.freeze({
    imageId: await docker('image', 'inspect', 'postgres:16', '--format', '{{.Id}}'),
    containerName,
    port,
    databasePrefix: 'interdomestik_admin_config_p0a0b_',
    expectedRolsuper: false,
    expectedRolbypassrls: false,
    startedAt,
  });
  const waitForNoSession = async (pid?: number) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const rows = pid
        ? await observer`SELECT count(*)::int AS count FROM pg_stat_activity WHERE pid = ${pid}`
        : await observer`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = 'interdomestik_admin_config_v1'`;
      if (rows[0]?.count === 0) return;
      await delay(50);
    }
    throw new Error('ADMIN_DB_FIXTURE_SESSION_RETAINED');
  };
  const stop = async (): Promise<FixtureReceipt> => {
    await observer.end({ timeout: 1 });
    await docker('rm', '--force', containerName);
    return Object.freeze({ ...receipt, removedAt: new Date().toISOString() });
  };
  return Object.freeze({
    authority,
    ownerEnv: envFor(owner),
    nonownerEnv: envFor(nonowner),
    waitForNoSession,
    stop,
  });
}
