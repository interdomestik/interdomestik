#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Z620_EXECUTABLES } from './managed-executables.mjs';
import {
  createTaskDatabase,
  dropTaskDatabase,
  reserveE2ePort,
  taskDatabaseName,
} from './z620-resource-lib.mjs';
import { resolveStateRoot } from './z620-resource-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(
  process.argv.slice(2).map(argument => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=') || true];
  })
);
const sha = String(
  args.sha ||
    execFileSync(Z620_EXECUTABLES.git, ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
);
const lane = String(args.lane || 'e2e');
const attempt = String(args.attempt || 'r1');
const stateRoot = resolveStateRoot(args['state-root'], root);
const database = taskDatabaseName(sha, lane, attempt);
const reservation = await reserveE2ePort(stateRoot, `${database}:${process.pid}`);
let created = false;

try {
  createTaskDatabase(database);
  created = true;
  execFileSync(Z620_EXECUTABLES.docker, [
    'exec',
    'supabase_db_interdomestik',
    'psql',
    '-U',
    'postgres',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'select 1',
  ]);
  console.log(JSON.stringify({ status: 'pass', database, port: reservation.port }));
} finally {
  if (created) dropTaskDatabase(database);
  reservation.release();
}
