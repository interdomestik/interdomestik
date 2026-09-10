import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { evaluateModularityGuard } from './lib/modularity-guard.mjs';
import { createTempRoot, writeFile } from './plan-test-helpers.mjs';

const TARGET = 'packages/domain-claims/src/staff-claims/update-status.test.ts';
const BASE = '86269dbf807f69a778e9418a6d8306aab012318c';
const git = (root, args) =>
  execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();
const resultFor = (root, base) => evaluateModularityGuard({ root, baseRef: base });
const baseline = () =>
  execFileSync('/usr/bin/git', ['show', `${BASE}:${TARGET}`], { encoding: 'utf8' });

function repository(prefix, baseline) {
  const root = createTempRoot(prefix);
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'tests@example.com']);
  git(root, ['config', 'user.name', 'Tests']);
  writeFile(root, TARGET, baseline);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'seed']);
  return { root, base: git(root, ['rev-parse', 'HEAD']) };
}

test('admits the pinned baseline only without growth', () => {
  const content = baseline();
  const { root, base } = repository('pinned-', content);

  writeFile(root, TARGET, content.replace('inspect', 'inspecT'));
  let result = resultFor(root, base);
  assert.deepEqual(result.violations, []);
  assert.equal(result.advisories[0].reason, 'legacy-focused-test-stable');

  writeFile(root, TARGET, content.split('\n').slice(0, -2).join('\n') + '\n');
  assert.deepEqual(resultFor(root, base).violations, []);

  for (const candidate of [
    `${content}extra line\n`,
    content.replace('inspect', 'inspect-expanded'),
    `${`${'x'.repeat(100)}\n`.repeat(300)}`,
  ]) {
    writeFile(root, TARGET, candidate);
    assert.equal(resultFor(root, base).violations[0].reason, 'test-split-required');
  }
});

test('rejects changed baselines and unrelated oversized tests', () => {
  const content = baseline();
  const { root, base } = repository('wrong-', content.replace('inspect', 'inspecT'));
  writeFile(root, TARGET, content);
  writeFile(root, 'packages/other/update-status.test.ts', 'line\n'.repeat(804));

  assert.deepEqual(
    resultFor(root, base)
      .violations.map(item => item.file)
      .sort(),
    [TARGET, 'packages/other/update-status.test.ts'].sort()
  );

  writeFile(root, TARGET, 'small\n');
  assert.ok(resultFor(root, base).violations.some(item => item.file === TARGET));
});
