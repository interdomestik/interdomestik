import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { evaluateModularityGuard } from './lib/modularity-guard.mjs';
import { createTempRoot, writeFile } from './plan-test-helpers.mjs';

const TARGET = 'packages/domain-claims/src/staff-claims/update-status.test.ts';
const git = (root, args) =>
  execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();

function repository(content) {
  const root = createTempRoot('focused-test-');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'tests@example.com']);
  git(root, ['config', 'user.name', 'Tests']);
  writeFile(root, TARGET, content);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'seed']);
  return { root, base: git(root, ['rev-parse', 'HEAD']) };
}

test('a split staff claim test follows the ordinary 300-line focused-test limit', () => {
  const { root, base } = repository('baseline\n'.repeat(785));
  writeFile(root, TARGET, 'test case\n'.repeat(299));
  assert.deepEqual(evaluateModularityGuard({ root, baseRef: base }).violations, []);

  writeFile(root, TARGET, 'test case\n'.repeat(301));
  const result = evaluateModularityGuard({ root, baseRef: base });
  assert.equal(result.violations[0].reason, 'test-split-required');
});
