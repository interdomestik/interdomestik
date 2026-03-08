import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { createTempRoot, runScript, writeFile } from '../plan-test-helpers.mjs';
import { evaluateAiEvalSurface } from './ai-eval-surface-lib.mjs';

function decision(shouldRun, reason, matchedPaths = []) {
  return {
    shouldRun,
    reason,
    matchedPaths,
  };
}

test('AI eval surface runs on PRs that touch AI workflow code', () => {
  assert.deepEqual(
    evaluateAiEvalSurface({
      eventName: 'pull_request',
      changedFiles: [
        'packages/domain-ai/src/claims/summary.ts',
        'apps/web/src/features/member/home.tsx',
      ],
    }),
    decision(true, 'ai_eval_surface_changed', ['packages/domain-ai/src/claims/summary.ts'])
  );
});

test('AI eval surface skips PRs that do not touch AI files', () => {
  assert.deepEqual(
    evaluateAiEvalSurface({
      eventName: 'pull_request',
      changedFiles: ['docs/plans/current-program.md', 'apps/web/src/features/member/home.tsx'],
    }),
    decision(false, 'no_ai_eval_surface_changes')
  );
});

test('AI eval surface defaults to running when changed files are unavailable', () => {
  assert.deepEqual(
    evaluateAiEvalSurface({
      eventName: 'pull_request',
      changedFiles: [],
    }),
    decision(true, 'no_changed_files_detected')
  );
});

test('AI eval surface CLI prints GitHub output fields', () => {
  const root = createTempRoot('ai-eval-surface-cli-');
  const changedFilesPath = path.join(root, 'changed-files.txt');

  writeFile(root, 'changed-files.txt', 'packages/domain-ai/src/telemetry.ts\nREADME.md\n');

  const result = runScript('scripts/ci/ai-eval-surface.mjs', root, [
    '--event-name',
    'pull_request',
    '--changed-files-path',
    changedFilesPath,
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^should_run=true$/m);
  assert.match(result.stdout, /^reason=ai_eval_surface_changed$/m);
  assert.match(result.stdout, /matched_paths=\["packages\/domain-ai\/src\/telemetry\.ts"\]/);
});
