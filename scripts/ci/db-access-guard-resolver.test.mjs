import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const NODE_NEXT_CASES = [
  ['./tools/list-tools.js', 'tools/list-tools.ts'],
  ['./leaf.js', 'leaf.tsx'],
  ['./leaf.jsx', 'leaf.tsx'],
  ['./leaf.jsx', 'leaf.ts'],
  ['./leaf.mjs', 'leaf.mts'],
  ['./leaf.cjs', 'leaf.cts'],
  ['./leaf.ts', 'leaf.ts'],
  ['./leaf.js', 'leaf.js'],
  ['./leaf.mjs', 'leaf.mjs'],
  ['./leaf.cjs', 'leaf.cjs'],
  ['./leaf', 'leaf.ts'],
  ['./leaf', 'leaf/index.ts'],
];
function mountResolverRead(root, specifier) {
  const mounted = 'packages/qa/src/server.ts';
  writeFixture(root, mounted, [
    `import {read} from ${JSON.stringify(specifier)};`,
    'export function run(){return read();}',
  ]);
  return { status: runGuard(root).status, report: readReport(root), mounted };
}
function writeResolverLeaf(root, file, ambient = false) {
  writeFixture(
    root,
    file,
    ambient
      ? 'import {db} from "@interdomestik/database";export function read(){return db.select();}'
      : 'export function read(){return "safe";}'
  );
}
function assertResolverRemount(outcome, file) {
  assert.equal(outcome.status, 1, file);
  assert.ok(
    outcome.report.failingNewEntries.some(
      entry => entry.file === file && entry.mountedFrom === outcome.mounted
    ),
    JSON.stringify(outcome.report)
  );
}

test('changed QA roots resolve executable NodeNext substitutions and retain literal/index lookups', () => {
  for (const [specifier, leaf] of NODE_NEXT_CASES) {
    const file = 'packages/qa/src/' + leaf;
    for (const ambient of [false, true]) {
      const root = createTempRepo();
      writeResolverLeaf(root, file, ambient);
      sealFixture(root);
      const outcome = mountResolverRead(root, specifier);
      if (ambient) assertResolverRemount(outcome, file);
      else assert.equal(outcome.status, 0, `${file} ${JSON.stringify(outcome.report)}`);
    }
  }
});

test('NodeNext TS precedence cannot hide ambient source behind coexisting literal JS', () => {
  for (const [specifier, leaf] of NODE_NEXT_CASES.slice(0, 6)) {
    const root = createTempRepo();
    const file = 'packages/qa/src/' + leaf;
    writeResolverLeaf(root, 'packages/qa/src/' + specifier.slice(2));
    writeResolverLeaf(root, file, true);
    sealFixture(root);
    assertResolverRemount(mountResolverRead(root, specifier), file);
  }
});

test('missing, declaration-only and appended explicit suffixes stay incomplete', () => {
  for (const [specifier, file] of [
    ['./gone.js', undefined],
    ['./types.js', 'types.d.ts'],
    ['./types.mjs', 'types.d.mts'],
    ['./types.cjs', 'types.d.cts'],
    ['./types.d.js', 'types.d.ts'],
    ['./odd.js', 'odd.js.ts'],
    ['./odd.js', 'odd.js/index.ts'],
  ]) {
    const root = createTempRepo();
    if (file) writeResolverLeaf(root, 'packages/qa/src/' + file);
    sealFixture(root);
    const outcome = mountResolverRead(root, specifier);
    assert.equal(outcome.status, 1, specifier);
    assert.ok(
      outcome.report.incomplete.some(item => /unresolved module initialization/u.test(item.reason)),
      JSON.stringify(outcome.report)
    );
  }
});

test('trusted wildcard exports replace every target star with literal dollar subpaths', () => {
  for (const part of ['plain', 'x$&', 'x$$', "x$'", 'x$`']) {
    for (const ambient of [false, true]) {
      const root = createTempRepo();
      const file = `packages/kit/src/${part}/${part}.ts`;
      writeFixture(
        root,
        'packages/kit/package.json',
        JSON.stringify({ name: '@interdomestik/kit', exports: { './*': './src/*/*.ts' } })
      );
      writeResolverLeaf(root, file, ambient);
      sealFixture(root);
      const outcome = mountResolverRead(root, '@interdomestik/kit/' + part);
      if (ambient) assertResolverRemount(outcome, file);
      else assert.equal(outcome.status, 0, JSON.stringify(outcome.report));
    }
  }
});

test('runtime declaration imports never prove execution while genuine type-only imports remain erased', () => {
  for (const suffix of ['ts', 'mts', 'cts']) {
    const declaration = `packages/qa/src/types.d.${suffix}`;
    for (const specifier of [`./types.d.${suffix}`, './types.d', '@interdomestik/declarations']) {
      const root = createTempRepo();
      writeFixture(
        root,
        declaration,
        'export declare function read():string;export interface Item{id:string;}'
      );
      writeFixture(
        root,
        `packages/declarations/src/index.d.${suffix}`,
        'export declare function read():string;export interface Item{id:string;}'
      );
      writeFixture(
        root,
        'packages/declarations/package.json',
        JSON.stringify({
          name: '@interdomestik/declarations',
          exports: { '.': `./src/index.d.${suffix}` },
        })
      );
      sealFixture(root);
      const outcome = mountResolverRead(root, specifier);
      assert.equal(outcome.status, 1, `${specifier} ${JSON.stringify(outcome.report)}`);
      assert.ok(
        outcome.report.incomplete.some(item =>
          /unresolved module initialization/u.test(item.reason)
        )
      );
      writeFixture(root, 'packages/qa/src/server.ts', [
        `import type {Item} from ${JSON.stringify(specifier)};`,
        'export function run(){return "safe";}',
      ]);
      assert.equal(runGuard(root).status, 0, JSON.stringify(readReport(root)));
    }
  }
});
