import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendAuditEntry, verifyAuditChain } from './log.mjs';

function makeRecord(overrides = {}) {
  return {
    step_id: 'A1.1',
    epic_id: 'A1',
    mode: 'advisory',
    files_changed: ['scripts/plan-conformance/gate.mjs'],
    checks: [{ name: 'pnpm security:guard', status: 'pass', required: true }],
    result: 'pass',
    variance: false,
    decision: 'continue',
    owner: 'platform',
    timestamp: '2026-03-03T12:00:00.000Z',
    ...overrides,
  };
}

test('conformance log remains append-only and auditable', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-conformance-log-'));
  const auditPath = path.join(tempRoot, 'conformance.jsonl');
  const logMdPath = path.join(tempRoot, 'conformance.md');

  appendAuditEntry({
    record: makeRecord(),
    auditPath,
    logMdPath,
  });

  appendAuditEntry({
    record: makeRecord({
      step_id: 'A1.2',
      timestamp: '2026-03-03T12:05:00.000Z',
      files_changed: ['scripts/plan-conformance/log.mjs'],
    }),
    auditPath,
    logMdPath,
  });

  const verification = verifyAuditChain(auditPath);
  assert.equal(verification.ok, true);
  assert.equal(verification.entries.length, 2);

  const markdown = fs.readFileSync(logMdPath, 'utf8');
  assert.ok(markdown.includes('A1.1'));
  assert.ok(markdown.includes('A1.2'));
});

test('audit verification fails on tampered hash chain', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-conformance-log-'));
  const auditPath = path.join(tempRoot, 'conformance.jsonl');
  const logMdPath = path.join(tempRoot, 'conformance.md');

  const first = appendAuditEntry({
    record: makeRecord(),
    auditPath,
    logMdPath,
  });

  const tampered = {
    ...first,
    owner: 'tampered-owner',
  };

  fs.writeFileSync(auditPath, `${JSON.stringify(tampered)}\n`, 'utf8');

  const verification = verifyAuditChain(auditPath);
  assert.equal(verification.ok, false);
  assert.ok(/hash mismatch|hash chain mismatch/.test(verification.reason));
});
