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
const SKIP = new Set(
  '__mocks__ __tests__ build dist e2e fixtures node_modules stories test tests'.split(' ')
);
const MUTATION =
  /\b(?:(?:activate|cancel|create|issue|pay|record|save|settle|submit|transition|update)\w*(?:Airline|Claim(?:Status)?|Payout|Recovery|Settlement|Subscription|SuccessFee)|activateSponsoredMembership)\w*/u;

function isSource(file) {
  return (
    /\.[cm]?[jt]sx?$/u.test(file) &&
    !/(?:\.d\.[cm]?ts|\.(?:fixture|mock|spec|stories|test)\.[cm]?[jt]sx?)$/u.test(file) &&
    file !== TEST_UI &&
    /^(?:apps\/web|packages\/[^/]+)\/src\//u.test(file) &&
    !file.split('/').some(segment => SKIP.has(segment))
  );
}

function scan(source, name = 'x.tsx') {
  const nodes = [];
  const collect = node => {
    const erasedType =
      ts.isTypeNode(node) && (!ts.isExpressionWithTypeArguments(node) || ts.isPartOfTypeNode(node));
    if (erasedType || ts.isTypeOnlyImportOrExportDeclaration(node)) return;
    nodes.push(node);
    ts.forEachChild(node, collect);
  };
  const tree = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
  collect(tree);
  const options = { noLib: true, noResolve: true, allowJs: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = file => (file === name ? tree : undefined);
  const checker = ts.createProgram([name], options, host).getTypeChecker();
  // Literal aliases are data, resolved only for computed keys or to exclude data reads.
  const literal = (outer, seen = new Set()) => {
    if (!outer) return;
    const node = ts.skipOuterExpressions(outer);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (!ts.isIdentifier(node)) return;
    const symbol = ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : checker.getSymbolAtLocation(node);
    const declaration = symbol?.valueDeclaration;
    if (!declaration || seen.has(declaration) || !ts.isVariableDeclaration(declaration)) return;
    seen.add(declaration);
    return literal(declaration.initializer, seen);
  };
  const key = node => (ts.isComputedPropertyName(node) ? literal(node.expression) : node.text);
  // Capture callable references where introduced; later renaming cannot hide the file.
  const reference = node => {
    if (ts.isElementAccessExpression(node)) return literal(node.argumentExpression);
    if (
      ts.isBindingElement(node) ||
      ts.isImportSpecifier(node) ||
      ts.isExportSpecifier(node) ||
      (ts.isPropertyAssignment(node) && ts.isAssignmentTarget(node.parent))
    )
      return key(node.propertyName ?? node.name);
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    if (ts.isShorthandPropertyAssignment(node))
      return ts.isAssignmentTarget(node.parent) || literal(node.name) === undefined
        ? node.name.text
        : undefined;
    if (ts.isIdentifier(node) && ts.isInExpressionContext(node) && literal(node) === undefined)
      return node.text;
  };
  const references = nodes.map(reference);
  return {
    forbidden: references.some(name => MUTATION.test(name || '')),
    hook: references.includes('useOptimistic'),
  };
}

function walk(root, directory, files) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(root, absolute, files);
    } else if (entry.isFile()) {
      const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
      if (isSource(relative)) files.push(relative);
    }
  }
}

function consumers(root) {
  const files = [];
  for (const sourceRoot of ['apps/web/src', 'packages'])
    walk(root, path.join(root, sourceRoot), files);
  return files
    .filter(file => scan(fs.readFileSync(path.join(root, file), 'utf8'), file).hook)
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

test('AST references versus string data', () => {
  for (const [name, field] of [
    ['useOptimistic', 'hook'],
    ['cancelClaim', 'forbidden'],
  ])
    for (const [expected, cases] of [
      [
        true,
        [
          `import{'NAME'as hook}from'x'`,
          `export{'NAME'as hook}from'x'`,
          `x.NAME()`,
          `x[('NAME')]`,
          `const value={NAME}`,
          `const alias=key;x[alias];const key='NAME'`,
          `<b/>;const{'NAME':hook}=x`,
          `const {NAME}=x`,
          `const key='NAME',{[key]:hook=fallback}=x`,
          `let hook;({NAME:hook}=x);hook([],reducer)`,
          `let NAME;({NAME}=x)`,
          `const key='NAME';({[key]:hook=fallback}=x)`,
          `[{nested:{NAME:hook}}]=x`,
          `const a=x.NAME,b=a,c=b;c()`,
          `const callable=x.NAME<State>;callable(state)`,
          `class C extends (x.NAME(),Base) {}`,
        ],
      ],
      [
        false,
        [
          `//NAME\n'NAME';({NAME:0}as{NAME:number})`,
          `const label='NAME';return <span>{label}</span>`,
          `const event='NAME';analytics.track(event);event()`,
          `const key='NAME',alias=key;const value={alias};fn(alias)`,
          `({safe}= {NAME:hook});target={NAME:hook}`,
          `interface X{NAME():void};class X{NAME(){}}`,
          `interface X extends R.NAME{};class C implements R.NAME{}`,
          `type X=typeof React.NAME`,
          `import type {NAME} from 'react';export type {NAME}`,
          `import {type NAME} from 'react';export {type NAME}`,
          `const key='NAME';function f(){const key='safe';x[key]}`,
          `const a=b,b=a;x[a]`,
          `<Widget NAME='NAME'/>`,
        ],
      ],
    ])
      for (const source of cases) {
        const input = source.replaceAll('NAME', name);
        assert.equal(scan(input)[field], expected, input);
      }
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
