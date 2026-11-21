// Tests for scripts/ci/screen-contract/exports.mjs.
//
// The oracle tests build a real package fixture on disk and compare the
// module's verdict, environment by environment, with the resolver that
// environment stands for:
//   node-import      Node's own ESM resolver (import.meta.resolve, child process)
//   node-require     Node's own CJS resolver (createRequire().resolve, child process)
//   bundler-browser  enhanced-resolve with conditionNames browser/import/default
//   types            TypeScript resolveModuleName, moduleResolution Bundler
// Child processes run with process.execPath, no --conditions, no --no-addons,
// and without NODE_OPTIONS / NODE_TEST_CONTEXT from the test runner.
// Each oracle's verdict is compared as the oracle gives it: a refusal for a
// missing file is a refusal. Where the oracles disagree on one case, each row
// still matches its own oracle, and an edge passes only if every row that
// applies to it resolves (checkEdge, the strictest verdict).

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { ScanError, byCodeUnit } from './server-mutation/ast.mjs';
import {
  ENVIRONMENTS,
  checkEdge,
  environmentsFor,
  resolveEnvironment,
  resolveExports,
  unmodelledConditions,
  validateExports,
} from './screen-contract/exports.mjs';
import {
  ALL_ENVS,
  NODE_VERSION,
  PKG_NAME,
  buildFixture,
  moduleVerdict,
  subpathOf,
  typesOracle,
} from './fixtures/screen-contract-check/exports-fixtures.mjs';

test('ENVIRONMENTS are the four named, frozen condition sets', () => {
  assert.deepEqual(Object.keys(ENVIRONMENTS).sort(byCodeUnit), [...ALL_ENVS].sort(byCodeUnit));
  assert.deepEqual([...ENVIRONMENTS['node-import']].sort(byCodeUnit), [
    'default',
    'import',
    'module-sync',
    'node',
    'node-addons',
  ]);
  assert.deepEqual([...ENVIRONMENTS['node-require']].sort(byCodeUnit), [
    'default',
    'module-sync',
    'node',
    'node-addons',
    'require',
  ]);
  assert.deepEqual([...ENVIRONMENTS['bundler-browser']].sort(byCodeUnit), [
    'browser',
    'default',
    'import',
  ]);
  assert.deepEqual([...ENVIRONMENTS.types].sort(byCodeUnit), ['default', 'import', 'types']);
  assert.ok(Object.isFrozen(ENVIRONMENTS));
  for (const env of ALL_ENVS) assert.ok(Object.isFrozen(ENVIRONMENTS[env]), env);
});

test('environmentsFor maps each edge kind and rejects an unknown one', () => {
  assert.deepEqual(environmentsFor('import'), ['node-import', 'bundler-browser', 'types']);
  assert.deepEqual(environmentsFor('dynamic'), ['node-import', 'bundler-browser', 'types']);
  assert.deepEqual(environmentsFor('require'), ['node-require', 'types']);
  assert.deepEqual(environmentsFor('type'), ['types']);
  assert.throws(() => environmentsFor('nope'), ScanError);
  assert.throws(() => environmentsFor(undefined), ScanError);
});

test('malformed exports are input errors', () => {
  const bad = [
    ['target without ./', { '.': 'd.js' }],
    ['root string without ./', 'lib/d.js'],
    ['absolute target', { '.': '/abs/d.js' }],
    ['mixed . and condition keys', { '.': './d.js', import: './x.js' }],
    ['mixed keys in a nested level', { '.': { './x': './x.js', default: './d.js' } }],
    ['../ in target', { '.': './../d.js' }],
    ['.. segment later in target', { '.': './lib/../../d.js' }],
    ['node_modules segment', { '.': './node_modules/x/d.js' }],
    ['encoded node_modules segment', { '.': './%6Eode_modules/x/d.js' }],
    ['. segment', { '.': './lib/./d.js' }],
    ['number target', { '.': 1 }],
    ['boolean exports', true],
    ['numeric condition key', { '.': { 0: './d.js' } }],
    ['array entry without ./', { '.': ['not-relative.js', './d.js'] }],
    ['root array entry without ./', ['lib/d.js', './d.js']],
    ['.. segment in an array entry', { '.': ['./lib/../../d.js', './d.js'] }],
    ['node_modules segment in an array entry', { '.': ['./node_modules/x/d.js', './d.js'] }],
    ['array entry inside a condition', { '.': { import: ['/abs/d.js', './d.js'] } }],
    ['nested array entry', { '.': [['bad.js'], './d.js'] }],
    ['number array entry', { '.': [1, './d.js'] }],
  ];
  for (const [label, exportsField] of bad) {
    const pkg = { name: PKG_NAME, exports: exportsField };
    assert.throws(() => validateExports(pkg, 'fixture'), ScanError, label);
    assert.throws(() => resolveExports(pkg, '.', ENVIRONMENTS['node-import']), ScanError, label);
  }
  assert.doesNotThrow(() =>
    validateExports({ name: PKG_NAME, exports: { '.': './a//b.js' } }, 'fixture')
  );
});

test('a package without exports: bare specifier passes, any subpath is no-exports', () => {
  for (const pkg of [{ name: PKG_NAME }, { name: PKG_NAME, exports: null }]) {
    for (const env of ALL_ENVS) {
      assert.deepEqual(resolveExports(pkg, '.', ENVIRONMENTS[env]), {
        status: 'resolved',
        target: null,
      });
      assert.deepEqual(resolveExports(pkg, './button', ENVIRONMENTS[env]), {
        status: 'no-exports',
      });
    }
    const exists = () => true;
    assert.equal(checkEdge(pkg, '.', 'import', exists).ok, true);
    assert.equal(checkEdge(pkg, './button', 'type', exists).ok, false);
  }
});

test('unmodelledConditions lists unmodelled keys and resolution falls through to default', () => {
  const pkg = {
    name: PKG_NAME,
    exports: { '.': { 'react-server': './rs.js', default: './d.js' } },
  };
  assert.deepEqual(unmodelledConditions(pkg), ['react-server']);
  for (const env of ALL_ENVS) {
    assert.deepEqual(resolveExports(pkg, '.', ENVIRONMENTS[env]), {
      status: 'resolved',
      target: './d.js',
    });
  }
  const nested = {
    name: PKG_NAME,
    exports: {
      './a': [{ 'edge-light': './e.js' }, { production: { worker: './w.js' } }, './a.js'],
      './b': { node: './n.js', import: './i.js', types: './t.d.ts', development: './dev.js' },
    },
  };
  assert.deepEqual(unmodelledConditions(nested), [
    'development',
    'edge-light',
    'production',
    'worker',
  ]);
  assert.deepEqual(unmodelledConditions({ name: PKG_NAME }), []);
  assert.deepEqual(unmodelledConditions({ name: PKG_NAME, exports: './d.js' }), []);
});

test('pattern semantics beyond the oracle fixtures', () => {
  const env = ENVIRONMENTS['node-import'];
  const pkg = {
    name: PKG_NAME,
    exports: {
      './x/*': './x/*.js',
      './x/*/deep': null,
      './two/*/*': './never.js',
      './exact': './exact.js',
    },
  };
  // A pattern key with two stars is ignored, as in Node.
  assert.deepEqual(resolveExports(pkg, './two/a/b', env), { status: 'not-exported' });
  // The pattern needs a non-empty match.
  assert.deepEqual(resolveExports(pkg, './x/', env), { status: 'not-exported' });
  // A null pattern result is final.
  assert.deepEqual(resolveExports(pkg, './x/q/deep', env), { status: 'blocked' });
  // An invalid segment in the matched part is refused.
  assert.deepEqual(resolveExports(pkg, './x/../secret', env), { status: 'not-exported' });
  assert.deepEqual(resolveExports(pkg, './x/a/node_modules/b', env), { status: 'not-exported' });
  assert.deepEqual(resolveExports(pkg, './exact', env), {
    status: 'resolved',
    target: './exact.js',
  });
  // An empty array resolves to null, as in Node.
  assert.deepEqual(resolveExports({ name: PKG_NAME, exports: { '.': [] } }, '.', env), {
    status: 'blocked',
  });
  // An array of only nulls ends blocked; an invalid string in an array is an input error.
  assert.deepEqual(resolveExports({ name: PKG_NAME, exports: { '.': [null] } }, '.', env), {
    status: 'blocked',
  });
  assert.throws(
    () => resolveExports({ name: PKG_NAME, exports: { '.': ['bad.js'] } }, '.', env),
    ScanError
  );
  // Conditions given as a Set work like an array.
  assert.deepEqual(
    resolveExports(
      { name: PKG_NAME, exports: { import: './i.js', default: './d.js' } },
      '.',
      new Set(['import'])
    ),
    { status: 'resolved', target: './i.js' }
  );
  assert.throws(() => resolveExports(pkg, 'x', env), ScanError);
});

test('checkEdge needs a file check, and an unknown environment is an input error', () => {
  const pkg = { name: PKG_NAME, exports: { '.': './d.js' } };
  assert.throws(() => checkEdge(pkg, '.', 'import'), ScanError);
  assert.throws(() => resolveEnvironment(pkg, '.', 'nope', () => true), ScanError);
  assert.deepEqual(
    checkEdge(pkg, '.', 'type', () => false),
    {
      ok: false,
      environments: { types: { status: 'missing' } },
    }
  );
});

const TARGET_EXTS = [
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.d.ts',
  '.d.mts',
  '.d.cts',
  '.json',
  '',
];
const FILE_EXTS = TARGET_EXTS.filter(Boolean);
const fileSets = () => [
  ...FILE_EXTS.map(ext => [ext]),
  ...FILE_EXTS.flatMap((a, i) => FILE_EXTS.slice(i + 1).map(b => [a, b])),
];

// Every target extension against every one or two typed or JS files beside it: the types row
// takes the file TypeScript takes, or refuses where it refuses (B8).
test(`types row: TypeScript's file for every target extension and file pair (node ${NODE_VERSION})`, t => {
  const exportsMap = {};
  const files = [];
  TARGET_EXTS.forEach((targetExt, ti) => {
    fileSets().forEach((set, si) => {
      const dir = `m${ti}-${si}`;
      exportsMap[`./${dir}`] = `./${dir}/e${targetExt}`;
      for (const ext of set) files.push(`${dir}/e${ext}`);
    });
  });
  const fixture = buildFixture(t, exportsMap, files);
  const specs = Object.keys(exportsMap).map(key => `${PKG_NAME}${key.slice(1)}`);
  const results = typesOracle(fixture, specs);
  specs.forEach((spec, index) => {
    const oracle = results[index];
    const verdict = moduleVerdict(fixture, spec, 'types');
    const dir = subpathOf(spec).slice(2) + '/';
    const label = `${exportsMap[subpathOf(spec)]} beside ${files.filter(f => f.startsWith(dir))}: oracle ${JSON.stringify(oracle)}, module ${JSON.stringify(verdict)}`;
    assert.equal(oracle.resolved, verdict.status === 'resolved', label);
    if (oracle.resolved)
      assert.ok(oracle.file.endsWith(path.join(fixture.pkgDir, verdict.target.slice(2))), label);
  });
});
