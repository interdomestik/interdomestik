#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  createTaskDatabase,
  dropTaskDatabase,
  reserveE2ePort,
  taskDatabaseName,
} from './z620-resource-lib.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map(argument => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=') || true];
  })
);
const sha = String(
  args.sha || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
);
const lane = String(args.lane || 'e2e');
const attempt = String(args.attempt || 'r1');
const stateRoot = path.resolve(String(args['state-root'] || '/home/arben/ci/interdomestik/state'));
const database = taskDatabaseName(sha, lane, attempt);
const reservation = await reserveE2ePort(stateRoot, `${database}:${process.pid}`);
let created = false;

try {
  createTaskDatabase(database);
  created = true;
  execFileSync('docker', [
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
