import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { computeDeterministicMemoryId } from './memory-id.mjs';
import { determineRegisterAction, registerCapturedMemory } from './memory-register-capture.mjs';

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeJsonl(filePath, records) {
  fs.writeFileSync(filePath, records.map(record => JSON.stringify(record)).join('\n') + '\n', 'utf8');
}

function makeCapture(recordOverrides = {}) {
  const record = {
    id: '',
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
  };
  record.id = recordOverrides.id ?? computeDeterministicMemoryId(record);

  return {
    source_id: 'ci_static_failure',
    event_type: 'ci.static.failure',
    record,
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
    assert.equal(result.record.id, makeCapture().record.id);
    assert.match(result.append_line, new RegExp(makeCapture().record.id));
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
    assert.equal(JSON.parse(lines[0]).id, makeCapture().record.id);
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
    assert.equal(decision.record.id, makeCapture().record.id);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('determineRegisterAction avoids nested ternary ambiguity', () => {
  assert.equal(determineRegisterAction({ exists: true, apply: false }), 'already_registered');
  assert.equal(determineRegisterAction({ exists: false, apply: true }), 'appended');
  assert.equal(determineRegisterAction({ exists: false, apply: false }), 'append_ready');
  assert.equal(
    determineRegisterAction({ exists: true, apply: true, payloadMatch: false }),
    'payload_mismatch'
  );
});

function reversedKeys(value) {
  return Object.fromEntries(Object.entries(value).reverse());
}

function registerAgainst(existing, capturePayload, apply) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-register-capture-'));
  const registryPath = path.join(tempDir, 'registry.jsonl');
  writeJsonl(registryPath, [existing]);
  const before = fs.readFileSync(registryPath);

  try {
    const result = registerCapturedMemory({ capturePayload, registryPath, apply });
    return { result, unchanged: before.equals(fs.readFileSync(registryPath)) };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test('identical replay ignores timestamps and top-level or nested key order', () => {
  const scope = { file_path: 'package.json', route: '/member' };
  const capture = makeCapture({ scope, ä: 1, Z: 2 });
  const existing = reversedKeys({
    ...capture.record,
    scope: reversedKeys(scope),
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
  });

  const { result, unchanged } = registerAgainst(existing, capture, true);

  assert.equal(result.action, 'already_registered');
  assert.equal(result.exists, true);
  assert.equal(result.payload_match, true);
  assert.deepEqual(result.payload_differences, []);
  assert.equal(unchanged, true);
});

for (const [name, change, field] of [
  ['promotion rule', { promotion_rule: 'hitl_required' }, 'promotion_rule'],
  ['verification commands', { verification_commands: ['pnpm check:all'] }, 'verification_commands'],
  ['promoted status', { status: 'validated' }, 'status'],
  ['registry-only field', { approved_by: 'owner' }, 'approved_by'],
  [
    'nested __proto__ key',
    { scope: JSON.parse('{"file_path":"package.json","__proto__":"x"}') },
    'scope',
  ],
  ['top-level __proto__ field', JSON.parse('{"__proto__":{}}'), '__proto__'],
  ['mixed-case and non-ASCII fields', { ä: 1, Z: 1, Ä: 1, a: 1 }, ['Z', 'a', 'Ä', 'ä']],
]) {
  test(`same id with different ${name} is a payload mismatch and never written`, () => {
    const capture = makeCapture();
    const { result, unchanged } = registerAgainst({ ...capture.record, ...change }, capture, true);

    assert.equal(result.ok, true);
    assert.equal(result.action, 'payload_mismatch');
    assert.equal(result.exists, true);
    assert.equal(result.payload_match, false);
    assert.deepEqual(result.payload_differences, [field].flat());
    assert.equal(result.append_line, '');
    assert.equal(unchanged, true);
  });
}

test('capture-only field is a payload mismatch', () => {
  const existing = makeCapture().record;
  const capture = makeCapture({ id_seed_version: 'v1' });
  assert.equal(capture.record.id, existing.id);

  const { result, unchanged } = registerAgainst(existing, capture, true);

  assert.equal(result.action, 'payload_mismatch');
  assert.deepEqual(result.payload_differences, ['id_seed_version']);
  assert.equal(unchanged, true);
});

test('new records report no payload comparison', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-register-capture-'));
  const registryPath = path.join(tempDir, 'registry.jsonl');
  writeJsonl(registryPath, []);

  try {
    const result = registerCapturedMemory({ capturePayload: makeCapture(), registryPath });
    assert.equal(result.payload_match, null);
    assert.deepEqual(result.payload_differences, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI keeps exit code 0 and writes nothing on payload mismatch with --apply', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-register-capture-'));
  const capturePath = path.join(tempDir, 'capture.json');
  const registryPath = path.join(tempDir, 'registry.jsonl');
  const outPath = path.join(tempDir, 'decision.json');
  const capture = makeCapture();

  writeJson(capturePath, capture);
  writeJsonl(registryPath, [{ ...capture.record, promotion_rule: 'hitl_required' }]);
  const before = fs.readFileSync(registryPath);

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
    assert.equal(decision.action, 'payload_mismatch');
    assert.deepEqual(decision.payload_differences, ['promotion_rule']);
    assert.ok(before.equals(fs.readFileSync(registryPath)));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('invalid captures are rejected instead of being appended', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-register-capture-'));
  const registryPath = path.join(tempDir, 'registry.jsonl');
  writeJsonl(registryPath, []);

  try {
    const result = registerCapturedMemory({
      capturePayload: makeCapture({ id: 'not-deterministic' }),
      registryPath,
      apply: true,
    });

    assert.equal(result.ok, false);
    assert.equal(result.action, 'invalid_capture');
    assert.ok(Array.isArray(result.validation_problems));
    assert.equal(fs.readFileSync(registryPath, 'utf8').trim(), '');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
