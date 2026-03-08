import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { createTempRoot, runScript, writeFile } from '../plan-test-helpers.mjs';
import { evaluateValidationSurface } from './validation-surface-policy-lib.mjs';

function decision(shouldRun, reason, nonProductOnlyPaths = []) {
  return {
    shouldRun,
    reason,
    nonProductOnlyPaths,
  };
}

const DECISION_SCENARIOS = [
  [
    'manual dispatch defaults to heavy validation when changed files are unavailable',
    'workflow_dispatch',
    [],
    decision(true, 'manual_dispatch'),
  ],
  [
    'manual dispatch skips heavy validation for docs-only branches when changed files are available',
    'workflow_dispatch',
    ['docs/plans/current-program.md', 'README.md'],
    decision(false, 'non_product_only_pr', ['docs/plans/current-program.md', 'README.md']),
  ],
  [
    'manual dispatch still runs heavy validation for runtime-sensitive branches when changed files are available',
    'workflow_dispatch',
    ['apps/web/src/features/member/home.tsx', 'docs/plans/current-program.md'],
    decision(true, 'runtime_sensitive_surface', ['docs/plans/current-program.md']),
  ],
  [
    'docs-only PR skips heavy validation',
    'pull_request',
    ['docs/plans/current-program.md', 'README.md'],
    decision(false, 'non_product_only_pr', ['docs/plans/current-program.md', 'README.md']),
  ],
  [
    'workflow-only PR skips heavy validation',
    'pull_request',
    ['.github/workflows/pilot-gate.yml', '.github/actions/setup/action.yml'],
    decision(false, 'non_product_only_pr', [
      '.github/workflows/pilot-gate.yml',
      '.github/actions/setup/action.yml',
    ]),
  ],
  [
    'planning governance helper scripts still skip heavy validation',
    'pull_request',
    ['scripts/plan-test-helpers.mjs', 'docs/plans/current-program.md'],
    decision(false, 'non_product_only_pr', [
      'scripts/plan-test-helpers.mjs',
      'docs/plans/current-program.md',
    ]),
  ],
  [
    'CI orchestration-only changes skip heavy validation',
    'pull_request',
    ['scripts/ci/validation-surface-policy.mjs', '.github/workflows/pilot-gate.yml'],
    decision(false, 'non_product_only_pr', [
      'scripts/ci/validation-surface-policy.mjs',
      '.github/workflows/pilot-gate.yml',
    ]),
  ],
  [
    'runtime-sensitive product changes still run heavy validation',
    'pull_request',
    ['apps/web/src/features/member/home.tsx', 'docs/plans/current-program.md'],
    decision(true, 'runtime_sensitive_surface', ['docs/plans/current-program.md']),
  ],
  [
    'product changes alongside CI orchestration still run heavy validation',
    'pull_request',
    ['apps/web/src/features/member/home.tsx', 'scripts/multi-agent/orchestrator.sh'],
    decision(true, 'runtime_sensitive_surface', ['scripts/multi-agent/orchestrator.sh']),
  ],
  [
    'missing changed files defaults to running heavy validation',
    'pull_request',
    [],
    decision(true, 'no_changed_files_detected'),
  ],
];

DECISION_SCENARIOS.forEach(([name, eventName, changedFiles, expected]) => {
  test(name, () => {
    assert.deepEqual(evaluateValidationSurface({ eventName, changedFiles }), expected);
  });
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
