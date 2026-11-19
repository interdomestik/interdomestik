import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { prepareManagedSubdirectory } from './managed-paths.mjs';
import { safeId } from './z620-runner-lib.mjs';

const DB_PREFIX = 'interdomestik_ci_';

export function taskDatabaseName(sha, lane, attempt) {
  const shortSha = safeId(sha, 'sha')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12)
    .toLowerCase();
  const safeLane = safeId(lane, 'lane').replace(/[.-]/g, '_').toLowerCase();
  const safeAttempt = safeId(attempt, 'attempt').replace(/[.-]/g, '_').toLowerCase();
  const name = `${DB_PREFIX}${shortSha}_${safeLane}_${safeAttempt}`;
  if (!new RegExp(`^${DB_PREFIX}[a-z0-9_]+$`).test(name) || name.length > 63) {
    throw new Error('Task database name is not PostgreSQL-safe');
  }
  return name;
}

export function assertTaskDatabase(name) {
  if (!new RegExp(`^${DB_PREFIX}[a-z0-9_]+$`).test(name) || name.length > 63) {
    throw new Error('Refusing operation on non-task database');
  }
  return name;
}

const serverUrl = (database, password) =>
  `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:54322/${database}`;

// The Z620 container's server as the host sees it: a fixed loopback address and port, so the
// operation reaches that server and no other, whatever the Docker context or the libpq settings.
const ADMIN_DATABASE = 'postgres';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

// WP-04 residual (R-13): a client of its own until the guarded factory is admitted; it refuses any
// URL that does not target a loopback host before it constructs the driver.
async function withTaskAdminClient(password, work) {
  const url = new URL(serverUrl(ADMIN_DATABASE, password));
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('The task database admin client must target a loopback host');
  }
  const { default: postgres } = await import('postgres');
  const sql = postgres(url.toString(), {
    max: 1,
    connect_timeout: 10,
    debug: false,
    onnotice: () => {},
    connection: { application_name: 'interdomestik_z620_task_database' },
  });
  try {
    return await work(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function createTaskDatabase(name, password = 'postgres') {
  const database = assertTaskDatabase(name);
  await withTaskAdminClient(password, sql => sql`create database ${sql(database)}`);
}

export async function dropTaskDatabase(name, password = 'postgres') {
  const database = assertTaskDatabase(name);
  await withTaskAdminClient(
    password,
    sql => sql`drop database if exists ${sql(database)} with (force)`
  );
}

export function databaseUrl(name, password = 'postgres') {
  return serverUrl(assertTaskDatabase(name), password);
}

export function canListen(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

export async function reserveE2ePort(stateRoot, owner, start = 3100, end = 3199) {
  const portRoot = prepareManagedSubdirectory(stateRoot, 'ports', stateRoot);
  for (let port = start; port <= end; port += 1) {
    const lockPath = path.join(portRoot, `${port}.lock`);
    try {
      fs.mkdirSync(lockPath);
      if (!(await canListen(port))) {
        fs.rmdirSync(lockPath);
        continue;
      }
      fs.writeFileSync(
        path.join(lockPath, 'owner.json'),
        JSON.stringify({ owner, pid: process.pid })
      );
      return { port, release: () => fs.rmSync(lockPath, { recursive: true, force: true }) };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`No free E2E port in ${start}-${end}`);
}
