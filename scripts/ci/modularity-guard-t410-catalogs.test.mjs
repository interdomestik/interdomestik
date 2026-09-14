import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { structuredArtifactOwner as owner } from '../modularity-guard-policy.mjs';

const AUDITED = 'apps/web/src/components/notifications/notification-center.tsx';
const TEST_UI = 'apps/web/src/components/notifications/notification-test-ui.tsx';
const OTHER = 'apps/web/src/components/claims/status.tsx';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SKIP_DIRS = new Set(
  '__mocks__ __tests__ build dist e2e fixtures node_modules stories test tests'.split(' ')
);
const FORBIDDEN =
  /\b(?:(?:activate|cancel|issue|pay|record|save|settle|submit|transition|update)\w*(?:Airline|Claim(?:Status)?|Payout|Recovery|Settlement|SuccessFee)|activateSponsoredMembership)\w*/u;

const toPosix = value => value.replaceAll(path.sep, '/');

function isSource(file) {
  return (
    /\.[cm]?[jt]sx?$/u.test(file) &&
    !/\.d\.[cm]?ts$/u.test(file) &&
    !/\.(?:fixture|mock|spec|stories|test)\.[cm]?[jt]sx?$/u.test(file) &&
    file !== TEST_UI &&
    (file.startsWith('apps/web/src/') || /^packages\/[^/]+\/src\//u.test(file)) &&
    !file.split('/').some(segment => SKIP_DIRS.has(segment))
  );
}

function hasHook(source, name) {
  const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
  const keys = new Set();
  const vars = [];
  const hookKey = outer => {
    const node = ts.skipOuterExpressions(outer);
    return (
      (ts.isStringLiteralLike(node) && node.text === 'useOptimistic') ||
      (ts.isIdentifier(node) && keys.has(node.text)) ||
      (ts.isComputedPropertyName(node) && hookKey(node.expression))
    );
  };
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      vars.push(node);
    ts.forEachChild(node, collect);
  };
  collect(ast);
  let size;
  do {
    size = keys.size;
    for (const node of vars) {
      if (hookKey(node.initializer)) keys.add(node.name.text);
    }
  } while (keys.size !== size);
  let found = false;
  const visit = node => {
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

function walk(root, directory, files) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(root, absolute, files);
      continue;
    }
    if (entry.isSymbolicLink()) continue;
    const relative = toPosix(path.relative(root, absolute));
    if (isSource(relative)) files.push({ absolute, relative });
  }
}

function consumers(root) {
  const files = [];
  for (const sourceRoot of ['apps/web/src', 'packages'])
    walk(root, path.join(root, sourceRoot), files);
  return files
    .filter(file => hasHook(fs.readFileSync(file.absolute, 'utf8'), file.relative))
    .map(file => file.relative)
    .sort((left, right) => left.localeCompare(right));
}

function boundary(discovered) {
  return {
    unexpected: discovered.filter(file => file !== AUDITED),
    missing: discovered.includes(AUDITED) ? [] : [AUDITED],
  };
}

test('owns the T410 locale catalogs', () => {
  for (const locale of ['en', 'mk', 'sq', 'sr']) {
    const path = `apps/web/src/messages/${locale}/notifications.json`;
    assert.equal(owner(path), 't410-notification-acknowledgement-i18n-contract');
  }

  assert.equal(owner('apps/web/src/messages/de/notifications.json'), null);
  assert.equal(owner('apps/web/src/messages/en/unrelated.json'), null);
});

test('finds hook syntax but not comments or strings', () => {
  assert.equal(hasHook('// useOptimistic\nconst note = "useOptimistic";', 'a.ts'), false);
  for (const [source, file] of [
    ["import {'useOptimistic' as useFast} from 'react';", 'a.ts'],
    ["import * as R from 'react'; R.useOptimistic([]);", 'a.tsx'],
    ['React[("useOptimistic")]();', 'a.ts'],
    [
      'function C(){const alias=key;return React[alias]()} const key=`useOptimistic` as const;',
      'a.jsx',
    ],
    ['const {"useOptimistic": hook} = React;', 'a.js'],
  ]) {
    assert.equal(hasHook(source, file), true);
  }
});

test('covers production modules, not the test helper', () => {
  for (const file of [
    'apps/web/src/claims/status.jsx',
    'apps/web/src/claims/generated/status.tsx',
    'apps/web/src/claims/status-test-ui.tsx',
    'packages/x/src/a.mjs',
    'packages/x/src/a.cjs',
  ]) {
    assert.ok(isSource(file));
  }
  assert.equal(isSource(TEST_UI), false);
});

test('reports boundary violations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't410-'));
  const write = (file, source) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  };
  try {
    write(AUDITED, "import { useOptimistic } from 'react';");
    write(OTHER, "import * as React from 'react'; React.useOptimistic([]);");
    const discovered = consumers(root);
    assert.deepEqual(discovered, [OTHER, AUDITED]);
    assert.deepEqual(boundary(discovered), {
      unexpected: [OTHER],
      missing: [],
    });
    for (const name of 'updateClaimStatus cancelClaimCore saveStaffRecoveryDecisionCore saveSuccessFeeCollection issuePayoutSettlement submitAirlineClaim activateSponsoredMembership'.split(
      ' '
    ))
      assert.match(name, FORBIDDEN);
    write(AUDITED, 'export const settled = true;');
    assert.deepEqual(boundary(consumers(root)), {
      unexpected: [OTHER],
      missing: [AUDITED],
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repository has only the audited consumer', () => {
  const discovered = consumers(ROOT);
  assert.deepEqual(boundary(discovered), { unexpected: [], missing: [] });
  assert.deepEqual(discovered, [AUDITED]);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, AUDITED), 'utf8'), FORBIDDEN);
});
