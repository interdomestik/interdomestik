import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('ordinary plan-status has no Lean resolver dependency', () => {
  const source = readFileSync(new URL('./plan-status.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /lean-current-authority|resolveRepositoryAuthority/u);
});

test('plan-status prints current phase, queue and proof from canonical files', () => {
  const root = createTempRoot('plan-status-');
  writeFile(root, 'docs/plans/current-program.md', programDoc());
  writeFile(root, 'docs/plans/current-tracker.md', trackerDoc([queueRow()], [proofRow()]));

  const result = runScript('scripts/plan-status.mjs', root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Current phase: Canonical execution\./u);
  assert.match(result.stdout, /Legacy authority: explicit-only/u);
  assert.match(result.stdout, /PG1 \[completed\] Ship the policy\./u);
  assert.match(
    result.stdout,
    /PG1 proof: source=governance:policy exec=manual run=manual-20260305-governance/u
  );
});

test('plan-status prints only the current-phase summary and preserves wrapped goals', () => {
  const root = createTempRoot('plan-status-wrapped-');
  writeFile(
    root,
    'docs/plans/current-program.md',
    programDoc('Current repair.\n\nHistorical evidence follows.', [
      'Keep the complete wrapped\n   goal text.',
      'Keep the second goal.',
    ])
  );
  writeFile(root, 'docs/plans/current-tracker.md', trackerDoc([queueRow()], [proofRow()]));

  const result = runScript('scripts/plan-status.mjs', root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Current phase: Current repair\./u);
  assert.doesNotMatch(result.stdout, /Historical evidence follows/u);
  assert.match(result.stdout, /Keep the complete wrapped goal text\./u);
  assert.match(result.stdout, /Keep the second goal\./u);
});

test('plan-status fails when canonical files are missing', () => {
  const root = createTempRoot('plan-status-missing-');
  const result = runScript('scripts/plan-status.mjs', root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /plan:status failed: missing/u);
});

test('plan-status prints missing proof state when queue exists without proof rows', () => {
  const root = createTempRoot('plan-status-missing-proof-');
  writeFile(root, 'docs/plans/current-program.md', programDoc());
  writeFile(root, 'docs/plans/current-tracker.md', trackerDoc([queueRow()], []));

  const result = runScript('scripts/plan-status.mjs', root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Proof snapshot:/u);
  assert.match(result.stdout, /PG1 proof: missing/u);
});
