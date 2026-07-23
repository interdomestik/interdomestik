import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertTaskDatabase,
  databaseUrl,
  reserveE2ePort,
  taskDatabaseName,
} from './z620-resource-lib.mjs';

test('builds a bounded task-owned database name', () => {
  const name = taskDatabaseName('ABCDEF1234567890', 'e2e-gate', 'r1');
  assert.equal(name, 'interdomestik_ci_abcdef123456_e2e_gate_r1');
  assert.ok(name.length <= 63);
});

test('rejects unsafe task identifiers and non-task databases', () => {
  assert.throws(() => taskDatabaseName('../main', 'e2e', 'r1'), /Invalid sha/);
  assert.throws(() => assertTaskDatabase('postgres'), /non-task database/);
  assert.throws(() => assertTaskDatabase('interdomestik_ci_safe;drop'), /non-task database/);
});

test('builds a URL only for a task-owned database', () => {
  const url = databaseUrl('interdomestik_ci_abcdef_e2e_r1', 'p@ss');
  assert.equal(url, 'postgresql://postgres:p%40ss@127.0.0.1:54322/interdomestik_ci_abcdef_e2e_r1');
});

test('reserves distinct ports and releases only its own locks', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-resource-'));
  const first = await reserveE2ePort(stateRoot, 'first', 3180, 3181);
  const second = await reserveE2ePort(stateRoot, 'second', 3180, 3181);
  assert.notEqual(first.port, second.port);
  first.release();
  const third = await reserveE2ePort(stateRoot, 'third', first.port, first.port);
  assert.equal(third.port, first.port);
  second.release();
  third.release();
  fs.rmSync(stateRoot, { recursive: true, force: true });
});
