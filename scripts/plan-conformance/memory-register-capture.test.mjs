import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerCapturedMemory } from './memory-register-capture.mjs';

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeJsonl(filePath, records) {
  fs.writeFileSync(filePath, records.map(record => JSON.stringify(record)).join('\n') + '\n', 'utf8');
}

function makeCapture(recordOverrides = {}) {
  return {
    source_id: 'ci_static_failure',
    event_type: 'ci.static.failure',
    record: {
      id: 'mem_capture_one',
      status: 'candidate',
      store_type: 'procedural',
      trigger_signature: 'ci.static.failure',
      risk_class: 'high',
      scope: { file_path: 'package.json' },
      lesson: 'Re-run local fast verification before trusting static CI failures.',
      verification_commands: ['pnpm check:fast'],
      promotion_rule: 'owner_approval',
      supersedes: [],
      conflicts_with: [],
      created_at: '2026-03-23T12:00:00.000Z',
      updated_at: '2026-03-23T12:00:00.000Z',
      ...recordOverrides,
    },
  };
}

test('returns append-ready output for a new captured memory record', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-register-capture-'));
  const registryPath = path.join(tempDir, 'registry.jsonl');

  writeJsonl(registryPath, []);

  try {
    const result = registerCapturedMemory({
      capturePayload: makeCapture(),
      registryPath,
      apply: false,
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, 'append_ready');
    assert.equal(result.exists, false);
    assert.equal(result.record.id, 'mem_capture_one');
    assert.match(result.append_line, /"mem_capture_one"/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('detects duplicates and avoids append when record id already exists', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-register-capture-'));
  const registryPath = path.join(tempDir, 'registry.jsonl');
  const existing = makeCapture().record;

  writeJsonl(registryPath, [existing]);

  try {
    const result = registerCapturedMemory({
      capturePayload: makeCapture(),
      registryPath,
      apply: false,
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, 'already_registered');
    assert.equal(result.exists, true);
    assert.equal(result.append_line, '');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('apply mode appends the new record to the registry', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-register-capture-'));
  const registryPath = path.join(tempDir, 'registry.jsonl');
  writeJsonl(registryPath, []);

  try {
    const result = registerCapturedMemory({
      capturePayload: makeCapture(),
      registryPath,
      apply: true,
    });

    assert.equal(result.action, 'appended');
    const lines = fs.readFileSync(registryPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).id, 'mem_capture_one');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI writes a decision artifact and can append on demand', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-register-capture-'));
  const capturePath = path.join(tempDir, 'capture.json');
  const registryPath = path.join(tempDir, 'registry.jsonl');
  const outPath = path.join(tempDir, 'decision.json');

  writeJson(capturePath, makeCapture());
  writeJsonl(registryPath, []);

  try {
    execFileSync(
      process.execPath,
      [
        path.resolve('scripts/plan-conformance/memory-register-capture.mjs'),
        '--capture',
        capturePath,
        '--registry',
        registryPath,
        '--out',
        outPath,
        '--apply',
      ],
      { stdio: 'ignore' }
    );

    const decision = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(decision.action, 'appended');
    assert.equal(decision.record.id, 'mem_capture_one');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
