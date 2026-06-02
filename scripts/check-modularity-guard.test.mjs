import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createTempRoot, writeFile } from './plan-test-helpers.mjs';
import { evaluateModularityGuard, parseNameStatus } from './lib/modularity-guard.mjs';

function git(root, args) {
  return execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function initRepo(prefix) {
  const root = createTempRoot(prefix);
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'tests@example.com']);
  git(root, ['config', 'user.name', 'Tests']);
  return root;
}

function commitAll(root, message = 'seed') {
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', message]);
  return git(root, ['rev-parse', 'HEAD']);
}

function lines(count, prefix = 'line') {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`).join('\n') + '\n';
}

function resultFor(root, base) {
  return evaluateModularityGuard({ root, baseRef: base });
}

test('fails when a new checked file exceeds the modularity line limit', () => {
  const root = initRepo('modularity-new-');
  writeFile(root, 'README.md', 'seed\n');
  const base = commitAll(root);
  writeFile(root, 'scripts/oversized-new.mjs', lines(151));

  const result = resultFor(root, base);

  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'scripts/oversized-new.mjs');
  assert.equal(result.violations[0].reason, 'new-file-over-limit');
});

test('fails when an oversized legacy file grows beyond its base line count', () => {
  const root = initRepo('modularity-legacy-growth-');
  writeFile(root, 'apps/web/src/legacy.ts', lines(151));
  const base = commitAll(root);
  writeFile(root, 'apps/web/src/legacy.ts', lines(152));

  const result = resultFor(root, base);

  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].baseLines, 151);
  assert.equal(result.violations[0].currentLines, 152);
  assert.equal(result.violations[0].reason, 'legacy-file-grew');
});

test('allows an oversized legacy file when edited without line-count growth', () => {
  const root = initRepo('modularity-legacy-stable-');
  writeFile(root, 'apps/web/src/legacy.ts', lines(151, 'before'));
  const base = commitAll(root);
  writeFile(root, 'apps/web/src/legacy.ts', lines(151, 'after'));

  const result = resultFor(root, base);

  assert.deepEqual(result.violations, []);
  assert.equal(result.checkedFiles, 1);
});

test('parses rename entries and reports growth on the surviving path', () => {
  const root = initRepo('modularity-rename-');
  writeFile(root, 'apps/web/src/old-name.ts', lines(151));
  const base = commitAll(root);
  git(root, ['mv', 'apps/web/src/old-name.ts', 'apps/web/src/new-name.ts']);
  fs.appendFileSync(path.join(root, 'apps/web/src/new-name.ts'), 'extra\n');

  const result = resultFor(root, base);

  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'apps/web/src/new-name.ts');
  assert.equal(result.violations[0].oldPath, 'apps/web/src/old-name.ts');
});

test('keeps explicit generated and lockfile exceptions out of enforcement', () => {
  const root = initRepo('modularity-exceptions-');
  writeFile(root, 'README.md', 'seed\n');
  const base = commitAll(root);
  writeFile(root, 'pnpm-lock.yaml', lines(400));
  writeFile(root, 'packages/database/drizzle/generated.ts', lines(400));

  const result = resultFor(root, base);

  assert.deepEqual(result.violations, []);
  assert.equal(result.checkedFiles, 0);
});

test('parseNameStatus reads the new path for renamed files', () => {
  const entries = parseNameStatus('R100\0old path.ts\0new path.ts\0A\0added.ts\0');

  assert.deepEqual(entries, [
    { file: 'new path.ts', oldPath: 'old path.ts', status: 'R' },
    { file: 'added.ts', oldPath: null, status: 'A' },
  ]);
});

test('skips with a warning when no base ref can be resolved', () => {
  const root = initRepo('modularity-no-base-');

  const result = evaluateModularityGuard({ root, env: {} });

  assert.equal(result.status, 'skipped');
  assert.match(result.warning, /no base ref resolved/);
});
