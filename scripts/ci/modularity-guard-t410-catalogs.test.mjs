import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const AUDITED_OPTIMISTIC_MODULES = [
  'apps/web/src/components/notifications/notification-center.tsx',
];
const SOURCE_ROOTS = ['apps/web/src', 'packages'];
const EXCLUDED_DIRECTORIES = new Set([
  '__mocks__',
  '__tests__',
  'build',
  'dist',
  'e2e',
  'fixtures',
  'generated',
  'node_modules',
  'stories',
  'test',
  'tests',
]);

const toPosix = value => value.split(path.sep).join('/');

function isProductionModule(relativePath) {
  const base = path.basename(relativePath);
  return (
    /\.tsx?$/u.test(base) &&
    !base.endsWith('.d.ts') &&
    !/\.(?:fixture|generated|mock|spec|stories|test)\.tsx?$/u.test(base) &&
    !toPosix(relativePath)
      .split('/')
      .some(segment => EXCLUDED_DIRECTORIES.has(segment))
  );
}

function importsOrCallsUseOptimistic(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const namespaces = new Set();
  let namedImport = false;

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'react') continue;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) namespaces.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      namedImport ||= bindings.elements.some(
        element => (element.propertyName ?? element.name).text === 'useOptimistic'
      );
    }
  }
  if (namedImport) return true;

  let called = false;
  const visit = node => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      namespaces.has(node.expression.expression.text) &&
      node.expression.name.text === 'useOptimistic'
    ) {
      called = true;
      return;
    }
    if (!called) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return called;
}

function walkProductionModules(root, directory, files) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) walkProductionModules(root, absolutePath, files);
      continue;
    }
    if (entry.isSymbolicLink()) continue;
    const relativePath = toPosix(path.relative(root, absolutePath));
    if (isProductionModule(relativePath)) files.push({ absolutePath, relativePath });
  }
}

function findOptimisticModules(root) {
  const files = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    walkProductionModules(root, path.join(root, sourceRoot), files);
  }
  return files
    .filter(file =>
      importsOrCallsUseOptimistic(fs.readFileSync(file.absolutePath, 'utf8'), file.relativePath)
    )
    .map(file => file.relativePath)
    .sort((left, right) => left.localeCompare(right));
}

function optimisticBoundary(discovered, audited = AUDITED_OPTIMISTIC_MODULES) {
  return {
    unexpected: discovered.filter(file => !audited.includes(file)).sort(),
    missing: audited.filter(file => !discovered.includes(file)).sort(),
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
  assert.equal(
    importsOrCallsUseOptimistic('// useOptimistic\nconst note = "useOptimistic";', 'a.ts'),
    false
  );
  assert.equal(
    importsOrCallsUseOptimistic("import {useOptimistic as useFast} from 'react';", 'a.ts'),
    true
  );
  assert.equal(
    importsOrCallsUseOptimistic(
      "import * as R from 'react'; R.useOptimistic([], value => value);",
      'a.tsx'
    ),
    true
  );
});

test('reports unregistered and stale consumers while excluding test modules', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't410-optimistic-boundary-'));
  const write = (relativePath, source) => {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source);
  };
  try {
    write(AUDITED_OPTIMISTIC_MODULES[0], "import { useOptimistic } from 'react';");
    write(
      'apps/web/src/components/claims/status.tsx',
      "import * as React from 'react'; React.useOptimistic([]);"
    );
    write(
      'apps/web/src/components/claims/status.test.tsx',
      "import { useOptimistic } from 'react';"
    );
    const discovered = findOptimisticModules(root);
    assert.deepEqual(discovered, [
      'apps/web/src/components/claims/status.tsx',
      AUDITED_OPTIMISTIC_MODULES[0],
    ]);
    assert.deepEqual(optimisticBoundary(discovered), {
      unexpected: ['apps/web/src/components/claims/status.tsx'],
      missing: [],
    });
    write(AUDITED_OPTIMISTIC_MODULES[0], 'export const settled = true;');
    assert.deepEqual(optimisticBoundary(findOptimisticModules(root)), {
      unexpected: ['apps/web/src/components/claims/status.tsx'],
      missing: AUDITED_OPTIMISTIC_MODULES,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repository has exactly the audited reversible optimistic consumer', () => {
  const discovered = findOptimisticModules(process.cwd());
  assert.deepEqual(optimisticBoundary(discovered), { unexpected: [], missing: [] });
  assert.deepEqual(discovered, AUDITED_OPTIMISTIC_MODULES);
});
