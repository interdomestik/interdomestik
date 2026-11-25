import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { evaluateModularityGuard } from './lib/modularity-guard.mjs';
import { isSemanticGovernanceDocument, MODULARITY_POLICY } from './modularity-guard-policy.mjs';
import { createTempRoot, writeFile } from './plan-test-helpers.mjs';

test('semantic governance path inventory is exact', () => {
  const governed = [
    'AGENTS.md',
    'docs/plans/current-program.md',
    'docs/plans/current-tracker.md',
    'docs/plans/history/2026-09-22-current-program-ledger.md',
    'docs/plans/history/2026-09-22-current-tracker-ledger.md',
  ];
  assert.equal(governed.every(isSemanticGovernanceDocument), true);
  assert.equal(isSemanticGovernanceDocument('docs/plans/other.md'), false);
});

// Pins the byte cap on its own: both documents stay far below the 1,000-line limit.
test('governance documents are accepted at 136 KiB and refused one byte above', () => {
  const cap = 136 * 1024;
  assert.equal(MODULARITY_POLICY.governanceDoc.maxBytes, cap);
  const root = createTempRoot('modularity-governance-bytes-');
  const git = args => execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '-q']);
  git(['config', 'user.email', 'tests@example.com']);
  git(['config', 'user.name', 'Tests']);
  writeFile(root, 'README.md', '# Seed\n');
  git(['add', '.']);
  git(['commit', '-qm', 'seed']);
  const base = git(['rev-parse', 'HEAD']);
  const document = bytes => `# Gate\n${'x'.repeat(bytes - 8)}\n`;
  writeFile(root, 'docs/at-cap.md', document(cap));
  writeFile(root, 'docs/over-cap.md', document(cap + 1));

  const result = evaluateModularityGuard({ root, baseRef: base });

  assert.deepEqual(
    result.violations.map(item => `${item.file}:${item.reason}`),
    ['docs/over-cap.md:governance-budget']
  );
});
