import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function runCli({ draft, changedFiles, expectedCount = changedFiles.length, includeFile = true }) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'pr-gate-policy-'));
  const eventPath = path.join(directory, 'event.json');
  const changedFilesPath = path.join(directory, 'changed-files.txt');
  writeFileSync(
    eventPath,
    JSON.stringify({ pull_request: { draft, changed_files: expectedCount, labels: [] } })
  );
  if (includeFile) writeFileSync(changedFilesPath, `${changedFiles.join('\n')}\n`);

  const result = spawnSync(
    process.execPath,
    [
      'scripts/ci/pr-gate-policy.mjs',
      '--event-name',
      'pull_request',
      '--event-path',
      eventPath,
      '--changed-files-path',
      changedFilesPath,
    ],
    { encoding: 'utf8' }
  );
  rmSync(directory, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  return Object.fromEntries(
    result.stdout
      .trim()
      .split('\n')
      .map(line => line.split(/=(.*)/su).slice(0, 2))
  );
}

test('CLI emits quick-lane GitHub outputs for an ordinary draft', () => {
  assert.deepEqual(runCli({ draft: true, changedFiles: ['apps/web/src/components/card.tsx'] }), {
    run_full: 'false',
    force_full: 'false',
    reason: 'ordinary-draft',
    high_risk_paths: '[]',
  });
});

test('CLI fails full when changed-file evidence is incomplete', () => {
  const result = runCli({
    draft: true,
    changedFiles: [],
    expectedCount: 1,
    includeFile: false,
  });
  assert.equal(result.run_full, 'true');
  assert.equal(result.force_full, 'true');
  assert.equal(result.reason, 'changed-files-incomplete');
});
