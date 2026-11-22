import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createTempRepo, runGuard } from './db-access-guard-test-utils.mjs';

test('a guard run that hits its time limit fails as a timeout, not as a missing report', () => {
  const root = createTempRepo();
  assert.throws(() => runGuard(root, [], { timeoutMs: 1 }), /guard harness timed out after 1 ms/u);
  assert.equal(fs.existsSync(path.join(root, 'tmp/db-access-guard/report.json')), false);
});

test('a guard run within its time limit still returns the harness exit status', () => {
  const root = createTempRepo();
  const result = runGuard(root);
  assert.equal(result.status, 0, result.stderr);
});
