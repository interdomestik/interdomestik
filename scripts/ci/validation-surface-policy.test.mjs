import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { createTempRoot, runScript, writeFile } from '../plan-test-helpers.mjs';
import { evaluateValidationSurface } from './validation-surface-policy-lib.mjs';

test('manual dispatch always runs heavy validation', () => {
  assert.deepEqual(
    evaluateValidationSurface({
      eventName: 'workflow_dispatch',
      changedFiles: [],
    }),
    {
      shouldRun: true,
      reason: 'manual_dispatch',
      nonProductOnlyPaths: [],
    }
  );
});

test('docs-only PR skips heavy validation', () => {
  assert.deepEqual(
    evaluateValidationSurface({
      eventName: 'pull_request',
      changedFiles: ['docs/plans/current-program.md', 'README.md'],
    }),
    {
      shouldRun: false,
      reason: 'non_product_only_pr',
      nonProductOnlyPaths: ['docs/plans/current-program.md', 'README.md'],
    }
  );
});

test('workflow-only PR skips heavy validation', () => {
  assert.deepEqual(
    evaluateValidationSurface({
      eventName: 'pull_request',
      changedFiles: ['.github/workflows/pilot-gate.yml', '.github/actions/setup/action.yml'],
    }),
    {
      shouldRun: false,
      reason: 'non_product_only_pr',
      nonProductOnlyPaths: ['.github/workflows/pilot-gate.yml', '.github/actions/setup/action.yml'],
    }
  );
});

test('planning governance helper scripts still skip heavy validation', () => {
  assert.deepEqual(
    evaluateValidationSurface({
      eventName: 'pull_request',
      changedFiles: ['scripts/plan-test-helpers.mjs', 'docs/plans/current-program.md'],
    }),
    {
      shouldRun: false,
      reason: 'non_product_only_pr',
      nonProductOnlyPaths: ['scripts/plan-test-helpers.mjs', 'docs/plans/current-program.md'],
    }
  );
});

test('CI policy script changes still run heavy validation', () => {
  assert.deepEqual(
    evaluateValidationSurface({
      eventName: 'pull_request',
      changedFiles: [
        'scripts/ci/validation-surface-policy.mjs',
        '.github/workflows/pilot-gate.yml',
      ],
    }),
    {
      shouldRun: true,
      reason: 'runtime_sensitive_surface',
      nonProductOnlyPaths: ['.github/workflows/pilot-gate.yml'],
    }
  );
});

test('runtime-sensitive product changes still run heavy validation', () => {
  assert.deepEqual(
    evaluateValidationSurface({
      eventName: 'pull_request',
      changedFiles: ['apps/web/src/features/member/home.tsx', 'docs/plans/current-program.md'],
    }),
    {
      shouldRun: true,
      reason: 'runtime_sensitive_surface',
      nonProductOnlyPaths: ['docs/plans/current-program.md'],
    }
  );
});

test('missing changed files defaults to running heavy validation', () => {
  assert.deepEqual(
    evaluateValidationSurface({
      eventName: 'pull_request',
      changedFiles: [],
    }),
    {
      shouldRun: true,
      reason: 'no_changed_files_detected',
      nonProductOnlyPaths: [],
    }
  );
});

test('CLI prints GitHub output fields for docs-only PRs', () => {
  const root = createTempRoot('validation-surface-policy-cli-');
  const changedFilesPath = path.join(root, 'changed-files.txt');

  writeFile(root, 'changed-files.txt', 'docs/plans/current-program.md\nREADME.md\n');

  const result = runScript('scripts/ci/validation-surface-policy.mjs', root, [
    '--event-name',
    'pull_request',
    '--changed-files-path',
    changedFilesPath,
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^should_run=false$/m);
  assert.match(result.stdout, /^reason=non_product_only_pr$/m);
  assert.match(
    result.stdout,
    /non_product_only_paths=\["docs\/plans\/current-program\.md","README\.md"\]/
  );
});
