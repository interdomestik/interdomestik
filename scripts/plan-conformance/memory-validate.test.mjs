import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { computeDeterministicMemoryId } from './memory-id.mjs';
import { validateMemoryRegistry } from './memory-validate.mjs';

function validRecord(overrides = {}) {
  const base = {
    status: 'candidate',
    store_type: 'episodic',
    trigger_signature: 'no_go.release_gate',
    risk_class: 'high',
    scope: {
      file_path: 'scripts/release-gate/run.ts',
      tenant: 'tenant_mk',
    },
    lesson: 'Do not skip required production checks.',
    verification_commands: ['pnpm release:gate:prod'],
    promotion_rule: 'hitl_required',
    supersedes: [],
    conflicts_with: [],
    created_at: '2026-03-03T12:00:00.000Z',
    updated_at: '2026-03-03T12:00:00.000Z',
  };

  const merged = {
    ...base,
    ...overrides,
  };

  if (!merged.id) {
    merged.id = computeDeterministicMemoryId(merged);
  }

  return merged;
}

test('accepts a valid memory record lifecycle shape', () => {
  const result = validateMemoryRegistry([validRecord()]);
  assert.equal(result.ok, true);
  assert.equal(result.problems.length, 0);
});

test('rejects invalid status model values', () => {
  const result = validateMemoryRegistry([
    validRecord({ status: 'draft', id: 'mem_custom' }),
  ]);

  assert.equal(result.ok, false);
  assert.ok(result.problems.some(problem => problem.errors.some(error => error.includes('status'))));
});

test('rejects duplicate ids and invalid scope key', () => {
  const duplicateId = 'mem_dup_shared';
  const result = validateMemoryRegistry([
    validRecord({ id: duplicateId, scope: { unknown: 'x' } }),
    validRecord({ id: duplicateId, trigger_signature: 'other.signature' }),
  ]);

  assert.equal(result.ok, false);
  assert.ok(result.problems.some(problem => problem.errors.some(error => error.includes('scope key'))));
  assert.ok(result.problems.some(problem => problem.errors.some(error => error.includes('duplicate ids'))));
});

test('rejects non-deterministic id', () => {
  const record = validRecord({ id: 'mem_wrong_id' });
  const result = validateMemoryRegistry([record]);

  assert.equal(result.ok, false);
  assert.ok(
    result.problems.some(problem =>
      problem.errors.some(error => error.includes('deterministic seed'))
    )
  );
});

test('CLI report path works with valid empty registry', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-validate-'));
  const registryPath = path.join(tmpDir, 'registry.jsonl');
  const reportPath = path.join(tmpDir, 'report.json');
  fs.writeFileSync(registryPath, '', 'utf8');

  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(
    process.execPath,
    ['scripts/plan-conformance/memory-validate.mjs', '--registry', registryPath, '--report', reportPath],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    }
  );

  assert.equal(child.status, 0);
  assert.ok(fs.existsSync(reportPath));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.ok, true);
  assert.equal(report.count, 0);
});
