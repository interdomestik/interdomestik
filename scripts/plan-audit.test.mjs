import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/plan-audit.mjs');

function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function runAudit(root) {
  return spawnSync(process.execPath, [SCRIPT_PATH, '--root', root], {
    encoding: 'utf8',
  });
}

function authoritativeDoc(role, filePath, extra = '') {
  return `---
plan_role: ${role}
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-03-05
---

# ${filePath}

Authoritative content.
${extra}`;
}

function inputDoc(
  status,
  extraFrontMatter = '',
  body = '> Status: Input only.\n\n# Input\n\nContext only.\n'
) {
  return `---
plan_role: input
status: ${status}
source_of_truth: false
owner: platform
last_reviewed: 2026-03-05
${extraFrontMatter}---

${body}`;
}

test('passes with one canonical plan, one tracker, one execution log, and governed inputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-audit-pass-'));

  writeFile(
    root,
    'docs/plans/current-program.md',
    authoritativeDoc('canonical_plan', 'current-program')
  );
  writeFile(root, 'docs/plans/current-tracker.md', authoritativeDoc('tracker', 'current-tracker'));
  writeFile(root, 'docs/plans/current-log.md', authoritativeDoc('execution_log', 'current-log'));
  writeFile(
    root,
    'docs/plans/legacy-plan.md',
    inputDoc(
      'superseded',
      'superseded_by: docs/plans/current-program.md\n',
      '> Status: Superseded by current program.\n\n# Legacy\n\nHistorical only.\n'
    )
  );
  writeFile(
    root,
    'docs/plans/constraint.md',
    inputDoc(
      'active',
      '',
      '> Status: Active supporting input.\n\n# Constraint\n\nNo live queue here.\n'
    )
  );

  const result = runAudit(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /plan:audit passed/);
});

test('fails when multiple active trackers exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-audit-duplicate-'));

  writeFile(
    root,
    'docs/plans/current-program.md',
    authoritativeDoc('canonical_plan', 'current-program')
  );
  writeFile(root, 'docs/plans/current-tracker.md', authoritativeDoc('tracker', 'current-tracker'));
  writeFile(root, 'docs/plans/other-tracker.md', authoritativeDoc('tracker', 'other-tracker'));
  writeFile(root, 'docs/plans/current-log.md', authoritativeDoc('execution_log', 'current-log'));

  const result = runAudit(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected exactly 1 active tracker source of truth/);
});

test('fails when a superseded doc omits superseded_by', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-audit-superseded-'));

  writeFile(
    root,
    'docs/plans/current-program.md',
    authoritativeDoc('canonical_plan', 'current-program')
  );
  writeFile(root, 'docs/plans/current-tracker.md', authoritativeDoc('tracker', 'current-tracker'));
  writeFile(root, 'docs/plans/current-log.md', authoritativeDoc('execution_log', 'current-log'));
  writeFile(
    root,
    'docs/plans/legacy.md',
    inputDoc('superseded', '', '> Status: Superseded.\n\n# Legacy\n\nHistorical only.\n')
  );

  const result = runAudit(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /superseded documents must declare a valid superseded_by path/);
});

test('fails when an active input doc still claims live execution markers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-audit-live-marker-'));

  writeFile(
    root,
    'docs/plans/current-program.md',
    authoritativeDoc('canonical_plan', 'current-program')
  );
  writeFile(root, 'docs/plans/current-tracker.md', authoritativeDoc('tracker', 'current-tracker'));
  writeFile(root, 'docs/plans/current-log.md', authoritativeDoc('execution_log', 'current-log'));
  writeFile(
    root,
    'docs/plans/input.md',
    inputDoc(
      'active',
      '',
      '> Status: Active supporting input.\n\n# Input\n\n## Top 12 Next Actions\n\nShould fail.\n'
    )
  );

  const result = runAudit(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /active input docs may not present live execution markers/);
});

test('fails when the local current task file does not redirect to canonical status', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-audit-local-task-'));

  writeFile(
    root,
    'docs/plans/current-program.md',
    authoritativeDoc('canonical_plan', 'current-program')
  );
  writeFile(root, 'docs/plans/current-tracker.md', authoritativeDoc('tracker', 'current-tracker'));
  writeFile(root, 'docs/plans/current-log.md', authoritativeDoc('execution_log', 'current-log'));
  writeFile(
    root,
    '.agent/tasks/current_task.md',
    `---
task_name: legacy
---

# Current Task
`
  );

  const result = runAudit(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local task file must declare status: superseded/);
});
