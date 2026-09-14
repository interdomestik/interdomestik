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
const OTHER = 'apps/web/src/x.tsx';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SKIP_DIRS = new Set(
  '__mocks__ __tests__ build dist e2e fixtures node_modules stories test tests'.split(' ')
);
const FORBIDDEN =
  /\b(?:(?:activate|cancel|create|issue|pay|record|save|settle|submit|transition|update)\w*(?:Airline|Claim(?:Status)?|Payout|Recovery|Settlement|Subscription|SuccessFee)|activateSponsoredMembership)\w*/u;

function isSource(file) {
  return (
    /\.[cm]?[jt]sx?$/u.test(file) &&
    !/(?:\.d\.[cm]?ts|\.(?:fixture|mock|spec|stories|test)\.[cm]?[jt]sx?)$/u.test(file) &&
    file !== TEST_UI &&
    (file.startsWith('apps/web/src/') || /^packages\/[^/]+\/src\//u.test(file)) &&
    !file.split('/').some(segment => SKIP_DIRS.has(segment))
  );
}

function scan(source, name = 'x.tsx') {
  const nodes = [];
  const hookKeys = new Set();
  const mutationKeys = new Set();
  const collect = node => {
    nodes.push(node);
    ts.forEachChild(node, collect);
  };
  collect(ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true));
  const member = node =>
    ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
      ? (node.name ?? node.argumentExpression)
      : ts.isCallExpression(node)
        ? node.expression
        : ts.isBindingElement(node) || ts.isImportSpecifier(node) || ts.isExportSpecifier(node)
          ? (node.propertyName ?? node.name)
          : null;
  const nameOf = outer => {
    if (!outer) return false;
    const node = ts.skipOuterExpressions(outer);
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
    return ts.isComputedPropertyName(node) ? nameOf(node.expression) : false;
  };
  const hookKey = node => nameOf(node) === 'useOptimistic' || hookKeys.has(nameOf(node));
  const mutationKey = node => mutationKeys.has(nameOf(node)) || FORBIDDEN.test(nameOf(node) || '');
  let size;
  do {
    size = hookKeys.size + mutationKeys.size;
    for (const node of nodes)
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (hookKey(node.initializer)) hookKeys.add(node.name.text);
        if (mutationKey(node.initializer)) mutationKeys.add(node.name.text);
      }
  } while (hookKeys.size + mutationKeys.size !== size);
  return {
    forbidden: nodes.some(node => mutationKey(member(node))),
    hook: nodes.some(
      node => (ts.isIdentifier(node) && node.text === 'useOptimistic') || hookKey(member(node))
    ),
  };
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
    const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
    if (isSource(relative)) files.push({ absolute, relative });
  }
}

function consumers(root) {
  const files = [];
  for (const sourceRoot of ['apps/web/src', 'packages'])
    walk(root, path.join(root, sourceRoot), files);
  return files
    .filter(file => scan(fs.readFileSync(file.absolute, 'utf8'), file.relative).hook)
    .map(file => file.relative)
    .sort();
}

const boundary = discovered => ({
  unexpected: discovered.filter(file => file !== AUDITED),
  missing: discovered.includes(AUDITED) ? [] : [AUDITED],
});

test('i18n', () => {
  for (const locale of ['en', 'mk', 'sq', 'sr'])
    assert.equal(
      owner(`apps/web/src/messages/${locale}/notifications.json`),
      't410-notification-acknowledgement-i18n-contract'
    );

  assert.equal(owner('apps/web/src/messages/de/notifications.json'), null);
  assert.equal(owner('apps/web/src/messages/en/unrelated.json'), null);
});

test('AST', () => {
  assert.ok(!scan('// useOptimistic\nconst note="useOptimistic"').hook);
  for (const source of `import{'useOptimistic'as useFast}from'react'|export{'useOptimistic'as useFast}from'react'|import*as R from'react';R.useOptimistic([])|React[("useOptimistic")]()|const alias=key;React[alias]();const key=\`useOptimistic\`|const C=()=> <b/>;const{"useOptimistic":hook}=React`.split(
    '|'
  ))
    assert.ok(scan(source).hook);
  assert.ok(
    !scan('//cancelClaim\n"cancelClaim";({cancelClaim:0});a[("safe"/*cancelClaim*/)]').forbidden
  );
  assert.ok(
    `import{'cancelClaim'as x}from'x'|export{'cancelClaim'as x}from'x'|a.cancelClaim()|const a=b,b=c,c='cancelClaim';x[a]|const key='cancelClaim',{[key]:x}=a|function cancelClaim(){}cancelClaim()`
      .split('|')
      .every(source => scan(source).forbidden)
  );
});

test('guard', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't410-'));
  const write = (file, source) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  };
  try {
    write(AUDITED, "import { useOptimistic } from 'react';");
    write(OTHER, "import * as React from 'react'; React.useOptimistic([]);");
    assert.deepEqual(boundary(consumers(root)), { unexpected: [OTHER], missing: [] });
    assert.ok(
      'updateClaimStatus cancelClaimCore createClaimFromSavedDraft cancelSubscriptionCore saveStaffRecoveryDecisionCore saveSuccessFeeCollection issuePayoutSettlement submitAirlineClaim activateSponsoredMembership'
        .split(' ')
        .every(name => scan(`import{${name}}from'x'`).forbidden)
    );
    write(AUDITED, 'export const settled = true;');
    assert.deepEqual(boundary(consumers(root)), { unexpected: [OTHER], missing: [AUDITED] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repo', () => {
  assert.ok(isSource('packages/x/src/a.mjs') && !isSource(TEST_UI));
  assert.deepEqual(boundary(consumers(ROOT)), { unexpected: [], missing: [] });
  assert.ok(!scan(fs.readFileSync(path.join(ROOT, AUDITED), 'utf8'), AUDITED).forbidden);
});
