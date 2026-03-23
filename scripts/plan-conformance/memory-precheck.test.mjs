import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { computeDeterministicMemoryId } from './memory-id.mjs';
import {
  parseArgs,
  resolveTrustedExecutable,
  runMemoryPrecheck,
  safeGitDiffNameOnly,
} from './memory-precheck.mjs';

function makeRecord(overrides = {}) {
  const record = {
    id: '',
    status: 'candidate',
    store_type: 'procedural',
    trigger_signature: 'release_gate.no_go',
    risk_class: 'high',
    scope: { file_path: 'package.json' },
    lesson: 'Run the release gate before trusting package-level verification changes.',
    verification_commands: ['pnpm pr:verify'],
    promotion_rule: 'hitl_required',
    supersedes: [],
    conflicts_with: [],
    created_at: '2026-03-23T10:00:00.000Z',
    updated_at: '2026-03-23T10:00:00.000Z',
    ...overrides,
  };

  record.id = computeDeterministicMemoryId(record);
  return record;
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function setupFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-precheck-'));
  const registryPath = path.join(tempDir, 'registry.jsonl');
  const rulesPath = path.join(tempDir, 'rules.json');
  const outPath = path.join(tempDir, 'out.json');

  const records = [
    makeRecord({
      trigger_signature: 'release_gate.no_go',
      scope: { file_path: 'package.json' },
      lesson: 'Verify release and PR verification command changes with the full precheck path.',
      verification_commands: ['pnpm pr:verify'],
    }),
    makeRecord({
      trigger_signature: 'tenant.isolation.hard_stop',
      risk_class: 'critical',
      scope: { table: 'claim', tenant: 'tenant_mk' },
      lesson: 'Tenant-sensitive changes must rerun the RLS and gate suites.',
      verification_commands: ['pnpm db:rls:test:required', 'pnpm e2e:gate'],
    }),
  ];

  fs.writeFileSync(registryPath, `${records.map(record => JSON.stringify(record)).join('\n')}\n`, 'utf8');
  writeJson(rulesPath, {
    version: '1.0.0',
    rules: [
      {
        id: 'package-scripts',
        match: { path_prefix: 'package.json' },
        query: { trigger_signature: 'release_gate.no_go', scope: { file_path: 'package.json' } },
      },
      {
        id: 'tenant-domain',
        match: { path_prefix: 'packages/database/' },
        query: {
          trigger_signature: 'tenant.isolation.hard_stop',
          scope: { table: 'claim', tenant: 'tenant_mk' },
        },
      },
    ],
  });

  return { tempDir, registryPath, rulesPath, outPath, records };
}

test('returns advisory hits for changed files that match configured rules', () => {
  const fixture = setupFixture();

  try {
    const result = runMemoryPrecheck({
      changedFiles: ['package.json'],
      registryPath: fixture.registryPath,
      rulesPath: fixture.rulesPath,
      outPath: fixture.outPath,
    });

    assert.equal(result.ok, true);
    assert.equal(result.matched_rule_count, 1);
    assert.equal(result.retrievals.length, 1);
    assert.deepEqual(result.retrievals[0].hits.map(hit => hit.id), [fixture.records[0].id]);

    const written = JSON.parse(fs.readFileSync(fixture.outPath, 'utf8'));
    assert.equal(written.retrievals.length, 1);
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('stays passive and reports no matches when changed files do not map to a rule', () => {
  const fixture = setupFixture();

  try {
    const result = runMemoryPrecheck({
      changedFiles: ['README.md'],
      registryPath: fixture.registryPath,
      rulesPath: fixture.rulesPath,
      outPath: fixture.outPath,
    });

    assert.equal(result.ok, true);
    assert.equal(result.matched_rule_count, 0);
    assert.equal(result.retrievals.length, 0);
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('CLI writes advisory output for explicit changed files', () => {
  const fixture = setupFixture();

  try {
    execFileSync(
      process.execPath,
      [
        path.resolve('scripts/plan-conformance/memory-precheck.mjs'),
        '--registry',
        fixture.registryPath,
        '--rules',
        fixture.rulesPath,
        '--out',
        fixture.outPath,
        '--changed',
        'package.json',
      ],
      { stdio: 'ignore' }
    );

    const written = JSON.parse(fs.readFileSync(fixture.outPath, 'utf8'));
    assert.equal(written.matched_rule_count, 1);
    assert.equal(written.retrievals[0].hits[0].id, fixture.records[0].id);
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('parseArgs collects repeated changed flags and explicit paths', () => {
  const args = parseArgs([
    '--changed',
    'package.json',
    '--changed',
    'scripts/plan-conformance/memory-precheck.mjs',
    '--registry',
    'custom-registry.jsonl',
    '--rules',
    'custom-rules.json',
    '--out',
    'custom-out.json',
    '--limit',
    '5',
  ]);

  assert.deepEqual(args.changedFiles, [
    'package.json',
    'scripts/plan-conformance/memory-precheck.mjs',
  ]);
  assert.equal(args.registryPath, 'custom-registry.jsonl');
  assert.equal(args.rulesPath, 'custom-rules.json');
  assert.equal(args.outPath, 'custom-out.json');
  assert.equal(args.limit, 5);
});

test('resolveTrustedExecutable returns an absolute path from trusted locations', () => {
  const executablePath = resolveTrustedExecutable(['git']);

  assert.equal(path.isAbsolute(executablePath), true);
  assert.match(executablePath, /\/(usr|opt)\//);
});

test('parseArgs accepts an explicit base ref for diff-aware retrieval', () => {
  const args = parseArgs(['--base', 'origin/release']);

  assert.equal(args.baseRef, 'origin/release');
});

test('safeGitDiffNameOnly falls back safely when git diff cannot run', () => {
  const files = safeGitDiffNameOnly('refs/does-not-exist');

  assert.ok(Array.isArray(files));
});
