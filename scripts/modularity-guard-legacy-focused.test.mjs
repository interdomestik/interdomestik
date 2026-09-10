import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { evaluateModularityGuard } from './lib/modularity-guard.mjs';
import { legacyFocusedTestContract } from './modularity-guard-policy.mjs';
import { createTempRoot, writeFile } from './plan-test-helpers.mjs';

const TARGET = 'packages/domain-claims/src/staff-claims/update-status.test.ts';
const git = (root, args) =>
  execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();
const resultFor = (root, base) => evaluateModularityGuard({ root, baseRef: base });
const sameSizeWrongDigest = () => {
  const rows = Array(804).fill('x');
  rows[0] = `inspect${'x'.repeat(27701)}`;
  return `${rows.join('\n')}\n`;
};

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

test('pins the approved legacy baseline identity', () => {
  assert.deepEqual(legacyFocusedTestContract(TARGET), {
    baseLines: 804,
    baseBytes: 29315,
    baseSha256: '2c9782b2d1ee5501049c2c59c309448c687f477eec4a88e8e19856675dafc627',
  });
});

test('rejects equal-sized impostors and unrelated oversized tests', () => {
  const content = sameSizeWrongDigest();
  assert.equal(Buffer.byteLength(content), 29315);
  const { root, base } = repository('wrong-', content);
  writeFile(root, TARGET, content.replace('inspect', 'inspecT'));
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
