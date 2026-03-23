import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { captureCiFailureMemory, parseArgs, selectFirstMappedFailure } from './memory-capture-ci-failure.mjs';
import { resolveTrustedExecutable } from './script-support.mjs';

function makeChecksPayload(checks) {
  return checks.map(check => ({
    bucket: 'pass',
    completedAt: '2026-03-23T12:00:00Z',
    description: '',
    link: 'https://example.test/check',
    name: 'unknown',
    startedAt: '2026-03-23T11:59:00Z',
    state: 'SUCCESS',
    workflow: 'CI',
    ...check,
  }));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

test('captures ci.static.failure from failing static checks', () => {
  const payload = captureCiFailureMemory({
    checksPayload: makeChecksPayload([
      {
        bucket: 'fail',
        name: 'CI / static',
        workflow: 'CI',
        description: 'TypeScript or lint checks failed',
      },
    ]),
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.event.event_type, 'ci.static.failure');
  assert.equal(payload.capture.source_id, 'ci_static_failure');
  assert.equal(payload.capture.record.scope.file_path, 'package.json');
});

test('captures ci.e2e_gate.failure from failing gate checks', () => {
  const payload = captureCiFailureMemory({
    checksPayload: makeChecksPayload([
      {
        bucket: 'fail',
        name: 'CI / e2e-gate',
        workflow: 'CI',
        description: 'Gate failed',
      },
    ]),
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.event.event_type, 'ci.e2e_gate.failure');
  assert.equal(payload.capture.source_id, 'ci_e2e_gate_failure');
  assert.equal(payload.capture.record.scope.tenant, 'tenant_mk');
});

test('stays passive when no failing check maps to a capture source', () => {
  const payload = captureCiFailureMemory({
    checksPayload: makeChecksPayload([
      {
        bucket: 'fail',
        name: 'Security / gitleaks',
        workflow: 'Security',
        description: 'Secrets scan failed',
      },
    ]),
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.event, null);
  assert.equal(payload.capture, null);
  assert.match(payload.message, /no mapped failing check/i);
});

test('selectFirstMappedFailure returns the first mapped failing check', () => {
  const mapped = selectFirstMappedFailure(
    makeChecksPayload([
      {
        bucket: 'fail',
        name: 'Security / gitleaks',
        workflow: 'Security',
        description: 'Secrets scan failed',
      },
      {
        bucket: 'fail',
        name: 'CI / e2e-gate',
        workflow: 'CI',
        description: 'Gate failed',
      },
    ])
  );

  assert.equal(mapped.event_type, 'ci.e2e_gate.failure');
  assert.equal(mapped.check.name, 'CI / e2e-gate');
});

test('CLI writes event and capture artifacts from a checks json file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-capture-ci-'));
  const checksPath = path.join(tempDir, 'checks.json');
  const eventPath = path.join(tempDir, 'event.json');
  const capturePath = path.join(tempDir, 'capture.json');

  writeJson(
    checksPath,
    makeChecksPayload([
      {
        bucket: 'fail',
        name: 'CI / static',
        workflow: 'CI',
        description: 'TypeScript or lint checks failed',
      },
    ])
  );

  try {
    execFileSync(
      process.execPath,
      [
        path.resolve('scripts/plan-conformance/memory-capture-ci-failure.mjs'),
        '--checks-json',
        checksPath,
        '--event-out',
        eventPath,
        '--capture-out',
        capturePath,
      ],
      { stdio: 'ignore' }
    );

    const eventPayload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const capturePayload = JSON.parse(fs.readFileSync(capturePath, 'utf8'));

    assert.equal(eventPayload.event_type, 'ci.static.failure');
    assert.equal(capturePayload.source_id, 'ci_static_failure');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('parseArgs reads explicit capture inputs and all flag', () => {
  const args = parseArgs([
    '--checks-json',
    'checks.json',
    '--pr',
    '382',
    '--source-map',
    'sources.json',
    '--event-out',
    'event.json',
    '--capture-out',
    'capture.json',
    '--all',
  ]);

  assert.equal(args.checksJsonPath, 'checks.json');
  assert.equal(args.prRef, '382');
  assert.equal(args.sourceMapPath, 'sources.json');
  assert.equal(args.eventOut, 'event.json');
  assert.equal(args.captureOut, 'capture.json');
  assert.equal(args.requiredOnly, false);
});

test('resolveTrustedExecutable returns an absolute path from trusted locations', () => {
  const executablePath = resolveTrustedExecutable(['gh']);

  assert.equal(path.isAbsolute(executablePath), true);
  assert.match(executablePath, /\/(usr|opt)\//);
});

test('prefers branch diff base when explicit base arg is supplied', async () => {
  const { parseArgs: parsePrecheckArgs } = await import('./memory-precheck.mjs');

  const args = parsePrecheckArgs(['--base', 'origin/release']);
  assert.equal(args.baseRef, 'origin/release');
});
