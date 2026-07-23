import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
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

export function createTaskDatabase(name, container = 'supabase_db_interdomestik') {
  execFileSync('docker', [
    'exec',
    container,
    'createdb',
    '-U',
    'postgres',
    assertTaskDatabase(name),
  ]);
}

export function dropTaskDatabase(name, container = 'supabase_db_interdomestik') {
  execFileSync('docker', [
    'exec',
    container,
    'dropdb',
    '--force',
    '--if-exists',
    '-U',
    'postgres',
    assertTaskDatabase(name),
  ]);
}

export function databaseUrl(name, password = 'postgres') {
  return `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:54322/${assertTaskDatabase(name)}`;
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
  const portRoot = path.join(stateRoot, 'ports');
  fs.mkdirSync(portRoot, { recursive: true, mode: 0o700 });
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
