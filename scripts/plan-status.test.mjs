import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/plan-status.mjs');

function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

test('plan-status prints the current phase and queue from canonical files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-status-'));

  writeFile(
    root,
    'docs/plans/current-program.md',
    `# Current Program

## Current Phase

Canonical execution.

## Program Goals

1. One plan.
2. One tracker.
`
  );

  writeFile(
    root,
    'docs/plans/current-tracker.md',
    `# Current Tracker

## Active Queue

| ID | Status | Owner | Work | Exit Criteria |
| --- | --- | --- | --- | --- |
| \`PG1\` | \`completed\` | \`platform\` | Ship the policy. | Audit passes. |
`
  );

  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Current phase: Canonical execution\./);
  assert.match(result.stdout, /PG1 \[completed\] Ship the policy\./);
});

test('plan-status fails when canonical files are missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-status-missing-'));
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /plan:status failed: missing/);
});
