import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const script = new URL('./current-authority-format-audit.mjs', import.meta.url).pathname;
const marker =
  'The next active governed implementation goal is blocked pending a fresh current-authority/design-gate selection; resolver target is `blocked_requires_current_authority`, `activeSlice=null`.';

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
  write(
    root,
    'docs/plans/current-program.md',
    `# Current Program\n\n## Current Phase\n\nSelection required.\n\n## Ordered Candidate Priorities\n\n| Priority | Candidate |\n| --- | --- |\n| 1 | B10 |\n\n## Selection Constraints\n\nOne slice.\n\n## Historical Authority\n\nManifest SHA-256: \`${manifestSha}\`.\n\n${marker}\n`
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
