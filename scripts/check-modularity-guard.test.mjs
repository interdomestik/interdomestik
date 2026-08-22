import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createTempRoot, writeFile } from './plan-test-helpers.mjs';
import { evaluateModularityGuard, parseNameStatus } from './lib/modularity-guard.mjs';
import { FILE_CLASSES, classifyModularityFile } from './modularity-guard-policy.mjs';

const DEFAULT_EXEC_BUFFER_BYTES = 1024 * 1024;
const GIT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const LARGE_LINE_PAYLOAD_BYTES = 7500;

function git(root, args) {
  return execFileSync('/usr/bin/git', args, {
    cwd: root,
    encoding: 'utf8',
  }).trim();
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

function largeLines(count) {
  return (
    Array.from(
      { length: count },
      (_, index) => `line-${index + 1}-${'x'.repeat(LARGE_LINE_PAYLOAD_BYTES)}`
    ).join('\n') + '\n'
  );
}

function resultFor(root, base) {
  return evaluateModularityGuard({ root, baseRef: base });
}

test('allows a cohesive production module at the 151-line advisory checkpoint', () => {
  const root = initRepo('modularity-new-');
  writeFile(root, 'README.md', 'seed\n');
  const base = commitAll(root);
  writeFile(root, 'scripts/oversized-new.mjs', lines(151));

  const result = resultFor(root, base);

  assert.deepEqual(result.violations, []);
  assert.equal(result.advisories[0].file, 'scripts/oversized-new.mjs');
  assert.equal(result.advisories[0].reason, 'production-modularity-checkpoint');
});

test('requires review or a split when production code crosses 300 lines', () => {
  const root = initRepo('modularity-legacy-growth-');
  writeFile(root, 'apps/web/src/legacy.ts', lines(300));
  const base = commitAll(root);
  writeFile(root, 'apps/web/src/legacy.ts', lines(301));

  const result = resultFor(root, base);

  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].baseLines, 300);
  assert.equal(result.violations[0].currentLines, 301);
  assert.equal(result.violations[0].reason, 'production-review-required');
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

test('compares oversized legacy files larger than the default exec buffer', () => {
  const root = initRepo('modularity-large-legacy-');
  const largeLegacyContent = largeLines(151);
  const largeLegacyBytes = Buffer.byteLength(largeLegacyContent, 'utf8');
  assert.ok(largeLegacyBytes > DEFAULT_EXEC_BUFFER_BYTES);
  assert.ok(largeLegacyBytes < GIT_MAX_BUFFER_BYTES);

  writeFile(root, 'apps/web/src/large-legacy.ts', largeLegacyContent);
  const base = commitAll(root);
  writeFile(
    root,
    'apps/web/src/large-legacy.ts',
    largeLegacyContent.replace('line-1-', 'updated-1-')
  );

  const result = resultFor(root, base);

  assert.deepEqual(result.violations, []);
  assert.equal(result.checkedFiles, 1);
});

test('parses rename entries and reports growth on the surviving path', () => {
  const root = initRepo('modularity-rename-');
  writeFile(root, 'apps/web/src/old-name.ts', lines(300));
  const base = commitAll(root);
  git(root, ['mv', 'apps/web/src/old-name.ts', 'apps/web/src/new-name.ts']);
  fs.appendFileSync(path.join(root, 'apps/web/src/new-name.ts'), 'extra\n');

  const result = resultFor(root, base);

  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'apps/web/src/new-name.ts');
  assert.equal(result.violations[0].oldPath, 'apps/web/src/old-name.ts');
  assert.equal(result.violations[0].reason, 'production-review-required');
});

test('keeps explicit generated and lockfile exceptions out of enforcement', () => {
  const root = initRepo('modularity-exceptions-');
  writeFile(root, 'README.md', 'seed\n');
  const base = commitAll(root);
  writeFile(root, 'pnpm-lock.yaml', lines(400));
  writeFile(root, 'packages/database/drizzle/generated.ts', lines(400));

  const result = resultFor(root, base);

  assert.deepEqual(result.violations, []);
  assert.equal(result.classCounts[FILE_CLASSES.generatedOrLock], 2);
});

test('classifies every normative typed surface and fails closed on unknown text', () => {
  const cases = {
    'scripts/tool.mjs': FILE_CLASSES.productionCode,
    'scripts/tool.test.mjs': FILE_CLASSES.focusedTest,
    'config/policy.json': FILE_CLASSES.structuredArtifact,
    'docs/plans/gate.md': FILE_CLASSES.governanceDoc,
    '.github/workflows/ci.yml': FILE_CLASSES.workflowYaml,
    'pnpm-lock.yaml': FILE_CLASSES.generatedOrLock,
    'notes/evidence.txt': FILE_CLASSES.unknown,
  };
  for (const [file, className] of Object.entries(cases)) {
    assert.equal(classifyModularityFile(file), className);
  }
});

test('enforces focused-test, structured-artifact, and governance budgets', () => {
  const root = initRepo('modularity-typed-budgets-');
  writeFile(root, 'README.md', '# Seed\n');
  const base = commitAll(root);
  writeFile(root, 'scripts/large.test.mjs', lines(301));
  writeFile(
    root,
    'scripts/ci/large.json',
    `${JSON.stringify({ payload: 'x'.repeat(128 * 1024) }, null, 2)}\n`
  );
  writeFile(root, 'docs/gate.md', `# Gate\n${lines(1000)}`);

  const result = resultFor(root, base);

  assert.deepEqual(result.violations.map(item => item.reason).sort(), [
    'governance-budget',
    'structured-byte-budget',
    'test-split-required',
  ]);
});

test('structured artifacts require an owner and repository-Prettier canonical JSON', () => {
  const root = initRepo('modularity-structured-');
  writeFile(root, 'README.md', '# Seed\n');
  const base = commitAll(root);
  writeFile(root, 'config/unowned.json', '{}\n');
  writeFile(root, 'scripts/ci/noncanonical.json', '{ "value": true } \n');
  writeFile(
    root,
    'docs/plans/canonical.json',
    `${JSON.stringify({ values: ['x'.repeat(80), 'y'.repeat(80)] }, null, 2)}\n`
  );

  const result = resultFor(root, base);

  assert.equal(result.checkedFiles, 3);
  assert.deepEqual(result.violations.map(item => item.reason).sort(), [
    'structured-noncanonical-json',
    'structured-owner-required',
  ]);
});

test('governance documents cannot silently remove baseline headings', () => {
  const root = initRepo('modularity-governance-');
  writeFile(root, 'docs/protocol.md', '# Protocol\n\n## Invariant\n');
  const base = commitAll(root);
  writeFile(root, 'docs/protocol.md', '# Protocol\n');

  const result = resultFor(root, base);

  assert.equal(result.violations[0].reason, 'governance-invariant-removal');
});

test('workflow YAML has no line cap but rejects inline complexity growth', () => {
  const root = initRepo('modularity-workflow-');
  writeFile(root, '.github/workflows/ci.yml', `jobs:\n  first:\n    steps:\n      - run: one\n`);
  const base = commitAll(root);
  writeFile(
    root,
    '.github/workflows/ci.yml',
    `${lines(400, `# ${'x'.repeat(400)}`)}jobs:\n  first:\n    steps:\n      - run: one\n      - uses: two\n`
  );

  const result = resultFor(root, base);

  assert.equal(result.violations[0].className, FILE_CLASSES.workflowYaml);
  assert.equal(result.violations[0].reason, 'workflow-complexity-growth');
});

test('unknown checked text fails closed', () => {
  const root = initRepo('modularity-unknown-');
  writeFile(root, 'README.md', 'seed\n');
  const base = commitAll(root);
  writeFile(root, 'notes/evidence.txt', 'unknown\n');

  const result = resultFor(root, base);

  assert.equal(result.violations[0].reason, 'unclassified-text');
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
