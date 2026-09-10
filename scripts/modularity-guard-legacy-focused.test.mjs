import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

import { evaluateModularityGuard } from './lib/modularity-guard.mjs';
import { createTempRoot, writeFile } from './plan-test-helpers.mjs';

const TARGET = 'packages/domain-claims/src/staff-claims/update-status.test.ts';
const git = (root, args) =>
  execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();
const resultFor = (root, base) => evaluateModularityGuard({ root, baseRef: base });

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

test('admits the pinned legacy staff test only while lines and bytes do not grow', () => {
  const baseline = fs.readFileSync(TARGET, 'utf8');
  const { root, base } = repository('modularity-pinned-focused-', baseline);

  writeFile(root, TARGET, baseline.replace('inspect', 'inspecT'));
  let result = resultFor(root, base);
  assert.deepEqual(result.violations, []);
  assert.equal(result.advisories[0].reason, 'legacy-focused-test-stable');

  writeFile(root, TARGET, baseline.split('\n').slice(0, -2).join('\n') + '\n');
  assert.deepEqual(resultFor(root, base).violations, []);

  for (const content of [
    `${baseline}extra line\n`,
    baseline.replace('inspect', 'inspect-expanded'),
    `${`${'x'.repeat(100)}\n`.repeat(300)}`,
  ]) {
    writeFile(root, TARGET, content);
    assert.equal(resultFor(root, base).violations[0].reason, 'test-split-required');
  }
});

test('rejects a different baseline and an unrelated oversized test', () => {
  const baseline = fs.readFileSync(TARGET, 'utf8');
  const wrongBaseline = baseline.replace('inspect', 'inspecT');
  const { root, base } = repository('modularity-wrong-focused-', wrongBaseline);
  writeFile(root, TARGET, baseline);
  writeFile(root, 'packages/other/update-status.test.ts', 'line\n'.repeat(804));

  assert.deepEqual(
    resultFor(root, base)
      .violations.map(item => item.file)
      .sort(),
    [TARGET, 'packages/other/update-status.test.ts'].sort()
  );
});
