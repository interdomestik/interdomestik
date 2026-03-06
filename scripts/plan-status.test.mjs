import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTempRoot,
  programDoc,
  proofRow,
  queueRow,
  runScript,
  trackerDoc,
  writeFile,
} from './plan-test-helpers.mjs';

test('plan-status prints the current phase and queue from canonical files', () => {
  const root = createTempRoot('plan-status-');

  writeFile(root, 'docs/plans/current-program.md', programDoc());
  writeFile(root, 'docs/plans/current-tracker.md', trackerDoc([queueRow()], [proofRow()]));

  const result = runScript('scripts/plan-status.mjs', root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Current phase: Canonical execution\./);
  assert.match(result.stdout, /PG1 \[completed\] Ship the policy\./);
  assert.match(
    result.stdout,
    /PG1 proof: source=governance:policy exec=manual run=manual-20260305-governance/
  );
});

test('plan-status fails when canonical files are missing', () => {
  const root = createTempRoot('plan-status-missing-');
  const result = runScript('scripts/plan-status.mjs', root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /plan:status failed: missing/);
});

test('plan-status prints missing proof state when queue exists without proof rows', () => {
  const root = createTempRoot('plan-status-missing-proof-');

  writeFile(root, 'docs/plans/current-program.md', programDoc());
  writeFile(root, 'docs/plans/current-tracker.md', trackerDoc([queueRow()], []));

  const result = runScript('scripts/plan-status.mjs', root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Proof snapshot:/);
  assert.match(result.stdout, /PG1 proof: missing/);
});
