import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const AUDITED = ['apps/web/src/components/notifications/notification-center.tsx'];
const TEST_UI = 'apps/web/src/components/notifications/notification-test-ui.tsx';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SKIP_DIRS = new Set([
  '__mocks__',
  '__tests__',
  'build',
  'dist',
  'e2e',
  'fixtures',
  'node_modules',
  'stories',
  'test',
  'tests',
]);

const toPosix = value => value.split(path.sep).join('/');

function isProduction(file) {
  const base = path.basename(file);
  const relative = toPosix(file);
  return (
    /\.[cm]?[jt]sx?$/u.test(base) &&
    !/\.d\.[cm]?ts$/u.test(base) &&
    !/\.(?:fixture|mock|spec|stories|test)\.[cm]?[jt]sx?$/u.test(base) &&
    relative !== TEST_UI &&
    (relative.startsWith('apps/web/src/') || /^packages\/[^/]+\/src\//u.test(relative)) &&
    !relative.split('/').some(segment => SKIP_DIRS.has(segment))
  );
}

function containsHook(source, name) {
  const kind =
    ts.ScriptKind[`${/\.[cm]?js/u.test(name) ? 'J' : 'T'}S${name.endsWith('x') ? 'X' : ''}`];
  const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, kind);
  const hookKeys = new Set();
  const hookKey = node =>
    (ts.isStringLiteralLike(node) && node.text === 'useOptimistic') ||
    (ts.isIdentifier(node) && hookKeys.has(node.text)) ||
    (ts.isComputedPropertyName(node) && hookKey(node.expression));
  let found = false;
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isStringLiteralLike(node.initializer) &&
      node.initializer.text === 'useOptimistic'
    ) {
      hookKeys.add(node.name.text);
    }
    if (
      (ts.isIdentifier(node) && node.text === 'useOptimistic') ||
      (ts.isElementAccessExpression(node) && hookKey(node.argumentExpression)) ||
      (ts.isBindingElement(node) && node.propertyName && hookKey(node.propertyName)) ||
      (ts.isImportSpecifier(node) && node.propertyName && hookKey(node.propertyName))
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
}

function walkProduction(root, directory, files) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkProduction(root, absolute, files);
      continue;
    }
    if (entry.isSymbolicLink()) continue;
    const relative = toPosix(path.relative(root, absolute));
    if (isProduction(relative)) files.push({ absolute, relative });
  }
}

function findConsumers(root) {
  const files = [];
  for (const sourceRoot of ['apps/web/src', 'packages']) {
    walkProduction(root, path.join(root, sourceRoot), files);
  }
  return files
    .filter(file => containsHook(fs.readFileSync(file.absolute, 'utf8'), file.relative))
    .map(file => file.relative)
    .sort((left, right) => left.localeCompare(right));
}

function boundary(discovered) {
  return {
    unexpected: discovered.filter(file => !AUDITED.includes(file)),
    missing: AUDITED.filter(file => !discovered.includes(file)),
  };
}

test('T410 owns only the canonical notification locale catalogs', () => {
  for (const locale of ['en', 'mk', 'sq', 'sr']) {
    const path = `apps/web/src/messages/${locale}/notifications.json`;
    assert.equal(structuredArtifactOwner(path), 't410-notification-acknowledgement-i18n-contract');
  }

  assert.equal(structuredArtifactOwner('apps/web/src/messages/de/notifications.json'), null);
  assert.equal(structuredArtifactOwner('apps/web/src/messages/en/unrelated.json'), null);
});

test('recognizes React hook imports and calls without matching comments or strings', () => {
  assert.equal(containsHook('// useOptimistic\nconst note = "useOptimistic";', 'a.ts'), false);
  for (const [source, file] of [
    ["import {'useOptimistic' as useFast} from 'react';", 'a.ts'],
    ["import * as R from 'react'; R.useOptimistic([]);", 'a.tsx'],
    ["const hook = React['useOptimistic'];", 'a.ts'],
    ['const key = `useOptimistic`; const {[key]: hook} = React;', 'a.jsx'],
    ['const {"useOptimistic": hook} = React;', 'a.js'],
  ]) {
    assert.equal(containsHook(source, file), true);
  }
});

test('covers supported production modules and only established test scaffolding', () => {
  for (const file of [
    'apps/web/src/claims/status.jsx',
    'apps/web/src/claims/generated/status.tsx',
    'apps/web/src/claims/status-test-ui.tsx',
  ]) {
    assert.equal(isProduction(file), true);
  }
  assert.equal(isProduction(TEST_UI), false);
});

test('reports unregistered and stale consumers while excluding test modules', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't410-optimistic-boundary-'));
  const write = (relativePath, source) => {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source);
  };
  try {
    write(AUDITED[0], "import { useOptimistic } from 'react';");
    write(
      'apps/web/src/components/claims/status.tsx',
      "import * as React from 'react'; React.useOptimistic([]);"
    );
    write(
      'apps/web/src/components/claims/status.test.tsx',
      "import { useOptimistic } from 'react';"
    );
    const discovered = findConsumers(root);
    assert.deepEqual(discovered, ['apps/web/src/components/claims/status.tsx', AUDITED[0]]);
    assert.deepEqual(boundary(discovered), {
      unexpected: ['apps/web/src/components/claims/status.tsx'],
      missing: [],
    });
    write(AUDITED[0], 'export const settled = true;');
    assert.deepEqual(boundary(findConsumers(root)), {
      unexpected: ['apps/web/src/components/claims/status.tsx'],
      missing: AUDITED,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repository has exactly the audited reversible optimistic consumer', () => {
  const discovered = findConsumers(ROOT);
  assert.deepEqual(boundary(discovered), { unexpected: [], missing: [] });
  assert.deepEqual(discovered, AUDITED);
});
