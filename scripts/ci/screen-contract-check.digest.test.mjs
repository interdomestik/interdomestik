import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { evaluatorDigest, evaluatorFiles, toolVersions } from './screen-contract/evaluate.mjs';
import { SCANNER_ROOT } from './screen-contract/lint.mjs';
import { REPO_ROOT, tempDir } from './fixtures/screen-contract-check/harness.mjs';

const SETTINGS = { unit: 'u', predicate: 'p', coverageMin: { file: 1 } };

function copyEvaluator(t) {
  const root = tempDir(t, 'scc-digest-');
  for (const rel of evaluatorFiles(SCANNER_ROOT)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.copyFileSync(path.join(SCANNER_ROOT, rel), path.join(root, rel));
  }
  return root;
}

test('digest: the inventory names the CLI, the config, every rule and the imported WP-02 modules (H2, H5)', () => {
  const files = evaluatorFiles();
  for (const rel of [
    'scripts/ci/screen-contract-check.mjs',
    'apps/web/eslint.screen-contract.config.mjs',
    'apps/web/eslint/screen-contract/consent-control-registered.mjs',
    'scripts/ci/screen-contract/transfer.mjs',
    'scripts/ci/screen-contract/exports.mjs',
    'scripts/ci/server-mutation/baseline.mjs',
  ])
    assert.ok(files.includes(rel), rel);
  assert.equal(SCANNER_ROOT, REPO_ROOT);
  assert.ok(toolVersions()['eslint-plugin-jsx-a11y'] === '6.10.2');
});

test('digest: one changed line in each verdict source changes it (H7, §3)', t => {
  const versions = toolVersions();
  const root = copyEvaluator(t);
  const before = evaluatorDigest(SETTINGS, root, versions);
  assert.equal(evaluatorDigest(SETTINGS, root, versions), before);
  const mutations = [
    [
      'scripts/ci/screen-contract/transfer.mjs',
      'occurrences.splice(at, 1);',
      'occurrences.splice(at, 0);',
    ],
    [
      'scripts/ci/screen-contract/transfer.mjs',
      'if (listed.has(fileOfKey(item)))',
      'if (!listed.has(fileOfKey(item)))',
    ],
    [
      'scripts/ci/server-mutation/baseline.mjs',
      'return { new: multisetMinus(current, admitted)',
      'return { new: multisetMinus(admitted, current)',
    ],
    [
      'scripts/ci/screen-contract-check.mjs',
      "const DEFAULT_REPORT = 'tmp/",
      "const DEFAULT_REPORT = 'tmp2/",
    ],
  ];
  let previous = before;
  for (const [rel, from, to] of mutations) {
    const file = path.join(root, rel);
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.includes(from), `${rel} no longer contains ${from}`);
    fs.writeFileSync(file, text.replace(from, to));
    const after = evaluatorDigest(SETTINGS, root, versions);
    assert.notEqual(after, previous, rel);
    previous = after;
  }
  assert.notEqual(evaluatorDigest({ ...SETTINGS, predicate: 'q' }, root, versions), previous);
  assert.notEqual(evaluatorDigest(SETTINGS, root, { ...versions, eslint: '0.0.0' }), previous);
});
