import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { writerMapDigest } from './current-authority-state-lib.mjs';

const script = new URL('./current-authority-format-audit.mjs', import.meta.url).pathname;
const marker =
  'The next active governed implementation goal is exactly one canonical tracker program: `IDA-WF01-ONE-APPROVAL-DELIVERY` (Tier 3; `runtime_authorized:true`).';
const envelopePath = 'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json';
const receiptPath = 'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json';
const projectionPath = 'docs/plans/current-authority-v1.json';
const writers = [
  projectionPath,
  'scripts/current-authority-state.mjs',
  'scripts/current-authority-state-lib.mjs',
  'scripts/current-authority-state.test.mjs',
  'scripts/current-authority-format-audit.mjs',
  'scripts/current-authority-format-audit.test.mjs',
  'scripts/ci/exact-delivery-lib.mjs',
  'scripts/ci/exact-delivery.mjs',
  'scripts/ci/exact-delivery.test.mjs',
  'docs/plans/current-program.md',
  'docs/plans/current-tracker.md',
];

function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function write(root, path, value) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'current-authority-audit-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Audit Test']);
  git(root, ['config', 'user.email', 'audit@example.test']);
  const oldProgram = '# Historical program\nRev 243\n';
  const oldTracker = '# Historical tracker\nRev 243\n';
  write(root, 'docs/plans/current-program.md', oldProgram);
  write(root, 'docs/plans/current-tracker.md', oldTracker);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'historical authority']);
  const commit = git(root, ['rev-parse', 'HEAD']);
  const entries = ['current-program.md', 'current-tracker.md'].map(name => {
    const path = `docs/plans/${name}`;
    const bytes = Buffer.from(readFileSync(join(root, path)));
    return {
      path,
      bytes: bytes.length,
      lineCount: bytes.toString('utf8').split('\n').length - 1,
      sha256: sha(bytes),
      gitBlobOid: git(root, ['rev-parse', `${commit}:${path}`]),
      immutableUrl: `https://github.com/interdomestik/interdomestik/blob/${commit}/${path}`,
      recoveryCommand: `git show ${commit}:${path}`,
    };
  });
  const manifestPath =
    'docs/plans/history/current-authority/2026-08-16-through-rev-243.manifest.json';
  write(
    root,
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        repository: 'interdomestik/interdomestik',
        sourceCommit: commit,
        throughRevision: 243,
        terminalState: { lifecycle: 'blocked_requires_current_authority', activeSlice: null },
        artifacts: entries,
      },
      null,
      2
    )}\n`
  );
  const manifestSha = sha(readFileSync(join(root, manifestPath)));
  const envelope = {
    approvalEnvelope: {
      children: [{ childId: 'S3-exact-authority', writerPaths: writers }],
    },
  };
  const receipt = { approvalId: 'test-receipt' };
  write(root, envelopePath, `${JSON.stringify(envelope, null, 2)}\n`);
  write(root, receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  write(
    root,
    projectionPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        programId: 'IDA-WF01-ONE-APPROVAL-DELIVERY',
        sourceMain: '0'.repeat(40),
        projectedRevision: 20,
        projectedChild: 'S3-exact-authority',
        projectedOperationSha256: '1'.repeat(64),
        envelopeSha256: sha(readFileSync(join(root, envelopePath))),
        approvalReceiptSha256: sha(readFileSync(join(root, receiptPath))),
        writerPaths: writers,
        writerMapSha256: writerMapDigest(writers),
        liveDispositionRequired: 'open',
        repositoryConsumptionRule: 'merged_closed_or_terminal_failure',
        successorAfterHealthCleanup: 'S4A-terminal-delivery',
      },
      null,
      2
    )}\n`
  );
  write(
    root,
    'docs/plans/current-program.md',
    `# Current Program\n\n## Current Phase\n\nSelection required.\n\n## M0-M5 Implementation Blueprint\n\nCompact roadmap.\n\n## Ordered Candidate Priorities\n\n| Priority | Candidate |\n| --- | --- |\n| 1 | B10 |\n\n## Selection Constraints\n\nOne slice.\n\n## Historical Authority\n\nManifest SHA-256: \`${manifestSha}\`.\n\n${marker}\n`
  );
  write(
    root,
    'docs/plans/current-tracker.md',
    `# Current Tracker\n\n## Active Queue\n\n| ID | Status | Owner | Work | Exit Criteria |\n| --- | --- | --- | --- | --- |\n| \`IDA-CI05\` | \`completed\` | platform | closeout | merged |\n\n## Proof Ledger\n\n| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| \`IDA-CI05\` | gate | manual | pr-1573 | main | pass | not_applicable | not_applicable | pass | closeout |\n\n## Next Selection\n\n${marker}\n\n## Historical Authority\n\nManifest SHA-256: \`${manifestSha}\`.\n`
  );
  return { root };
}

test('accepts compact authority and reconstructable Git history', () => {
  const { root } = fixture();
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /current-authority format audit passed/);
});

test('rejects append-only revision narratives', () => {
  const { root } = fixture();
  const path = join(root, 'docs/plans/current-program.md');
  writeFileSync(path, `${readFileSync(path, 'utf8')}\nRev 244 narrative\nRev 245 narrative\n`);
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /revision narratives/);
});

test('rejects a missing canonical authority section', () => {
  const { root } = fixture();
  const path = join(root, 'docs/plans/current-program.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace('## Current Phase', 'Current Phase'));
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing Current Phase section/);
});

test('rejects a repointed manifest in the canonical repository', () => {
  const { root } = fixture();
  git(root, ['remote', 'add', 'origin', 'https://github.com/interdomestik/interdomestik.git']);
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /source commit must match approved pre-compaction main/);
});

test('rejects projection writer drift from the approved envelope', () => {
  const { root } = fixture();
  const path = join(root, projectionPath);
  const value = JSON.parse(readFileSync(path, 'utf8'));
  value.writerPaths = value.writerPaths.slice(0, -1);
  value.writerMapSha256 = writerMapDigest(value.writerPaths);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /writer paths differ from envelope/);
});
