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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
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

const requireFromHere = createRequire(import.meta.url);
const { ResolverFactory, CachedInputFileSystem } = requireFromHere('enhanced-resolve');
const ts = requireFromHere('typescript');

const PKG_NAME = '@fx/pkg';
const NODE_VERSION = process.version;
const ALL_ENVS = ['node-import', 'node-require', 'bundler-browser', 'types'];

function childEnv() {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function buildFixture(t, exportsField, files) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-exports-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkgDir = path.join(root, 'node_modules', '@fx', 'pkg');
  fs.mkdirSync(pkgDir, { recursive: true });
  const pkg = { name: PKG_NAME, version: '1.0.0', exports: exportsField };
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkg, null, 2));
  for (const file of files) {
    const abs = path.join(pkgDir, file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.endsWith('.d.ts') ? 'export {};\n' : 'export default 1;\n');
  }
  const importer = path.join(root, 'importer.mjs');
  fs.writeFileSync(importer, '');
  return { root, pkgDir, importer, pkg };
}

function runChild(args, cwd) {
  const out = execFileSync(process.execPath, args, { cwd, env: childEnv(), encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop());
}

// Node ESM: import.meta.resolve names the file Node selects, but it masks the
// two errors the import itself raises for that file (ERR_MODULE_NOT_FOUND and
// ERR_UNSUPPORTED_DIR_IMPORT; Node's initializeImportMeta returns error.url for
// them). The import is therefore run too, and either code is a refusal. Any
// other import error (an unknown extension, type stripping under node_modules)
// comes after resolution and is not a resolution verdict.
function nodeImportOracle(fixture, specs) {
  const script = `
    const NOT_FOUND = new Set(['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT']);
    const out = [];
    for (const spec of ${JSON.stringify(specs)}) {
      let file;
      try {
        file = new URL(import.meta.resolve(spec)).pathname;
      } catch (error) {
        out.push({ resolved: false, detail: String(error.code) });
        continue;
      }
      try {
        await import(spec);
        out.push({ resolved: true, file });
      } catch (error) {
        if (NOT_FOUND.has(error.code)) out.push({ resolved: false, detail: error.code, file });
        else out.push({ resolved: true, file, after: String(error.code) });
      }
    }
    console.log(JSON.stringify(out));
  `;
  return runChild(['--input-type=module', '-e', script], fixture.root);
}

// Node CJS: require.resolve applies the same exports algorithm, then checks the
// file; its MODULE_NOT_FOUND for a selected target that is absent is a refusal.
function nodeRequireOracle(fixture, specs) {
  const script = `
    const req = require('node:module').createRequire(${JSON.stringify(fixture.importer)});
    const out = [];
    for (const spec of ${JSON.stringify(specs)}) {
      try {
        out.push({ resolved: true, file: req.resolve(spec) });
      } catch (error) {
        out.push({ resolved: false, detail: String(error.code) });
      }
    }
    console.log(JSON.stringify(out));
  `;
  return runChild(['-e', script], fixture.root);
}

function bundlerBrowserOracle(fixture, specs) {
  const resolver = ResolverFactory.createResolver({
    fileSystem: new CachedInputFileSystem(fs, 4000),
    useSyncFileSystemCalls: true,
    conditionNames: ['browser', 'import', 'default'],
    exportsFields: ['exports'],
    mainFields: [],
    extensions: ['.js', '.ts', '.d.ts'],
  });
  return specs.map(spec => {
    try {
      const file = resolver.resolveSync({}, fixture.root, spec);
      return file ? { resolved: true, file } : { resolved: false, detail: 'false' };
    } catch (error) {
      return { resolved: false, detail: String(error.message).split('\n')[0] };
    }
  });
}

// TypeScript adds the types condition itself; only "resolves, and to which file"
// is compared.
function typesOracle(fixture, specs) {
  const options = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    allowJs: true,
  };
  return specs.map(spec => {
    const result = ts.resolveModuleName(spec, fixture.importer, options, ts.sys);
    return result.resolvedModule
      ? { resolved: true, file: result.resolvedModule.resolvedFileName }
      : { resolved: false, detail: 'unresolved' };
  });
}

const ORACLES = {
  'node-import': nodeImportOracle,
  'node-require': nodeRequireOracle,
  'bundler-browser': bundlerBrowserOracle,
  types: typesOracle,
};

function subpathOf(spec) {
  return spec === PKG_NAME ? '.' : `.${spec.slice(PKG_NAME.length)}`;
}

// expect[spec][env]: the target ('./x.js') the specified semantics give, or a
// status string ('blocked' / 'not-exported') for a refusal.
const CASES = [
  {
    name: '1 require null, import target',
    exports: { require: null, import: './x.js' },
    files: ['x.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': './x.js',
        'node-require': 'blocked',
        'bundler-browser': './x.js',
        types: './x.js',
      },
    },
    edges: { [PKG_NAME]: { import: true, dynamic: true, require: false, type: true } },
  },
  {
    name: '2 node null, default shared',
    exports: { node: null, default: './shared.js' },
    files: ['shared.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': 'blocked',
        'node-require': 'blocked',
        'bundler-browser': './shared.js',
        types: './shared.js',
      },
    },
    edges: { [PKG_NAME]: { import: false, dynamic: false, require: false, type: true } },
  },
  {
    name: '3 node-addons null blocks both Node rows',
    exports: { 'node-addons': null, default: './d.js' },
    files: ['d.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': 'blocked',
        'node-require': 'blocked',
        'bundler-browser': './d.js',
        types: './d.js',
      },
    },
    edges: { [PKG_NAME]: { import: false, dynamic: false, require: false, type: true } },
  },
  {
    name: '4 types target, browser null, default',
    exports: { types: './t.d.ts', browser: null, default: './d.js' },
    files: ['t.d.ts', 'd.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': './d.js',
        'node-require': './d.js',
        'bundler-browser': 'blocked',
        types: './t.d.ts',
      },
    },
    edges: { [PKG_NAME]: { import: false, dynamic: false, require: true, type: true } },
  },
  {
    name: '5 browser and default',
    exports: { browser: './b.js', default: './d.js' },
    files: ['b.js', 'd.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': './d.js',
        'node-require': './d.js',
        'bundler-browser': './b.js',
        types: './d.js',
      },
    },
    edges: { [PKG_NAME]: { import: true, dynamic: true, require: true, type: true } },
  },
  {
    name: '6 pattern with trailer in the target',
    exports: { './icons/*': './icons/*.js' },
    files: ['icons/a.js'],
    expect: {
      '@fx/pkg/icons/a': {
        'node-import': './icons/a.js',
        'node-require': './icons/a.js',
        'bundler-browser': './icons/a.js',
        types: './icons/a.js',
      },
      [PKG_NAME]: {
        'node-import': 'not-exported',
        'node-require': 'not-exported',
        'bundler-browser': 'not-exported',
        types: 'not-exported',
      },
    },
    edges: { '@fx/pkg/icons/a': { import: true, require: true, type: true } },
  },
  {
    name: '7 null exact key under a matching pattern',
    exports: { './icons/*': './icons/*.js', './icons/secret': null },
    files: ['icons/a.js', 'icons/secret.js'],
    expect: {
      '@fx/pkg/icons/a': {
        'node-import': './icons/a.js',
        'node-require': './icons/a.js',
        'bundler-browser': './icons/a.js',
        types: './icons/a.js',
      },
      '@fx/pkg/icons/secret': {
        'node-import': 'blocked',
        'node-require': 'blocked',
        'bundler-browser': 'blocked',
        types: 'blocked',
      },
    },
    edges: { '@fx/pkg/icons/secret': { import: false, require: false, type: false } },
  },
  {
    name: '8 object root without "." is the root entry only',
    exports: { import: './x.js', default: './d.js' },
    files: ['x.js', 'd.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': './x.js',
        'node-require': './d.js',
        'bundler-browser': './x.js',
        types: './x.js',
      },
      '@fx/pkg/x': {
        'node-import': 'not-exported',
        'node-require': 'not-exported',
        'bundler-browser': 'not-exported',
        types: 'not-exported',
      },
    },
    edges: { [PKG_NAME]: { import: true, require: true, type: true } },
  },
  {
    name: '9 types .d.ts with default JS',
    exports: { '.': { types: './t.d.ts', default: './d.js' } },
    files: ['t.d.ts', 'd.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': './d.js',
        'node-require': './d.js',
        'bundler-browser': './d.js',
        types: './t.d.ts',
      },
    },
    edges: { [PKG_NAME]: { import: true, require: true, type: true } },
  },
  {
    name: '10 PATTERN_KEY_COMPARE prefers the longer prefix',
    exports: { './a/*': './one/*.js', './a/b/*': './two/*.js' },
    files: ['one/b/c.js', 'two/c.js', 'one/x.js'],
    expect: {
      '@fx/pkg/a/b/c': {
        'node-import': './two/c.js',
        'node-require': './two/c.js',
        'bundler-browser': './two/c.js',
        types: './two/c.js',
      },
      '@fx/pkg/a/x': {
        'node-import': './one/x.js',
        'node-require': './one/x.js',
        'bundler-browser': './one/x.js',
        types: './one/x.js',
      },
    },
  },
  {
    // The oracles disagree (Node 24.15.0, enhanced-resolve 5.25.1, TypeScript
    // 5.9): Node and enhanced-resolve select missing.js and refuse it, as its
    // file is absent; TypeScript checks each entry on disk and takes d.js. Each
    // row follows its own oracle; a value edge is refused (strictest verdict),
    // a type-only edge passes.
    name: '11 array target, first entry missing on disk',
    exports: { '.': ['./missing.js', './d.js'] },
    files: ['d.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': 'missing',
        types: './d.js',
      },
    },
    edges: { [PKG_NAME]: { import: false, dynamic: false, require: false, type: true } },
  },
  {
    name: '11b a target whose file is absent is refused everywhere',
    exports: { '.': './missing.js' },
    files: [],
    expect: {
      [PKG_NAME]: {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': 'missing',
        types: 'missing',
      },
    },
    edges: { [PKG_NAME]: { import: false, dynamic: false, require: false, type: false } },
  },
  {
    // Node and enhanced-resolve take the first matching condition and refuse
    // its absent file; TypeScript falls through to the next condition.
    name: '11c condition target missing on disk, default present',
    exports: { '.': { import: './missing.js', default: './d.js' } },
    files: ['d.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': 'missing',
        'node-require': './d.js',
        'bundler-browser': 'missing',
        types: './d.js',
      },
    },
    edges: { [PKG_NAME]: { import: false, dynamic: false, require: true, type: true } },
  },
  {
    // TypeScript maps a .js target to its .ts source; Node and enhanced-resolve
    // need the named file.
    name: '11d a .js target with only the .ts source present',
    exports: { '.': './d.js' },
    files: ['d.ts'],
    expect: {
      [PKG_NAME]: {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': 'missing',
        types: './d.ts',
      },
    },
    edges: { [PKG_NAME]: { import: false, require: false, type: true } },
  },
  {
    // enhanced-resolve appends its extensions to an extensionless target; Node
    // and TypeScript do not.
    name: '11e an extensionless target',
    exports: { '.': './d' },
    files: ['d.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': './d.js',
        types: 'missing',
      },
    },
    edges: { [PKG_NAME]: { import: false, require: false, type: false } },
  },
  {
    // TypeScript passes over a null condition value; Node blocks on it only
    // when the condition is active, and no Node or browser row has `types`.
    name: '11f a null types condition, default present',
    exports: { '.': { types: null, default: './d.js' } },
    files: ['d.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': './d.js',
        'node-require': './d.js',
        'bundler-browser': './d.js',
        types: './d.js',
      },
    },
    edges: { [PKG_NAME]: { import: true, require: true, type: true } },
  },
  {
    name: '11g a null import condition: Node and the bundler block, TypeScript falls through',
    exports: { '.': { import: null, default: './d.js' } },
    files: ['d.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': 'blocked',
        'node-require': './d.js',
        'bundler-browser': 'blocked',
        types: './d.js',
      },
    },
    edges: { [PKG_NAME]: { import: false, dynamic: false, require: true, type: true } },
  },
  {
    // TypeScript maps .jsx, .mjs and .cjs targets to their typed sources too.
    name: '11h typed sources of .jsx, .mjs and .cjs targets',
    exports: { './a': './a.jsx', './b': './b.mjs', './c': './c.cjs', './e': './e.ts' },
    files: ['a.tsx', 'b.d.mts', 'c.cts', 'e.d.ts'],
    expect: {
      '@fx/pkg/a': {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': 'missing',
        types: './a.tsx',
      },
      '@fx/pkg/b': {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': 'missing',
        types: './b.d.mts',
      },
      '@fx/pkg/c': {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': 'missing',
        types: './c.cts',
      },
      '@fx/pkg/e': {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': 'missing',
        types: 'missing',
      },
    },
  },
  {
    name: '12 array target skips an unmatched condition object',
    exports: { '.': [{ node: './n.js' }, './d.js'] },
    files: ['n.js', 'd.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': './n.js',
        'node-require': './n.js',
        'bundler-browser': './d.js',
        types: './d.js',
      },
    },
  },
  {
    // Observed oracle difference: enhanced-resolve 5.25.1 throws an internal
    // TypeError ("Invalid value used as weak map key") on any null entry of an
    // array target, so it refuses. Node (both rows) and TypeScript skip the null
    // entry, as the specified semantics do. Out of the oracle comparison for
    // bundler-browser only.
    name: '12b array target skips a null entry (bundler-browser excluded from oracle comparison: enhanced-resolve crashes on null array entries)',
    exports: { '.': [null, './d.js'] },
    files: ['d.js'],
    oracleEnvs: ['node-import', 'node-require', 'types'],
    expect: {
      [PKG_NAME]: {
        'node-import': './d.js',
        'node-require': './d.js',
        'bundler-browser': './d.js',
        types: './d.js',
      },
    },
  },
  {
    name: '13 nested conditions fall through an unmatched inner object',
    exports: { '.': { node: { require: './r.js' }, default: './d.js' } },
    files: ['r.js', 'd.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': './d.js',
        'node-require': './r.js',
        'bundler-browser': './d.js',
        types: './d.js',
      },
    },
  },
  {
    name: '14 unmodelled condition is inactive',
    exports: { '.': { 'react-server': './rs.js', development: './dev.js', default: './d.js' } },
    files: ['rs.js', 'dev.js', 'd.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': './d.js',
        'node-require': './d.js',
        'bundler-browser': './d.js',
        types: './d.js',
      },
    },
  },
  {
    name: '15 string root shorthand, subpath not exported',
    exports: './d.js',
    files: ['d.js', 'other.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': './d.js',
        'node-require': './d.js',
        'bundler-browser': './d.js',
        types: './d.js',
      },
      '@fx/pkg/other.js': {
        'node-import': 'not-exported',
        'node-require': 'not-exported',
        'bundler-browser': 'not-exported',
        types: 'not-exported',
      },
    },
  },
  {
    name: '16 star replaced everywhere in the target, pattern trailer in the key',
    exports: { './icons/*.js': './icons/*/*.js' },
    files: ['icons/a/a.js'],
    expect: {
      '@fx/pkg/icons/a.js': {
        'node-import': './icons/a/a.js',
        'node-require': './icons/a/a.js',
        'bundler-browser': './icons/a/a.js',
        types: './icons/a/a.js',
      },
      '@fx/pkg/icons/a': {
        'node-import': 'not-exported',
        'node-require': 'not-exported',
        'bundler-browser': 'not-exported',
        types: 'not-exported',
      },
    },
  },
];

const fileExistsIn = pkgDir => target => {
  const abs = path.join(pkgDir, target);
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
};

function moduleVerdict(fixture, spec, env) {
  return resolveEnvironment(fixture.pkg, subpathOf(spec), env, fileExistsIn(fixture.pkgDir));
}

for (const testCase of CASES) {
  test(`oracle ${testCase.name} (node ${NODE_VERSION})`, t => {
    const fixture = buildFixture(t, testCase.exports, testCase.files);
    const specs = Object.keys(testCase.expect);
    const oracleEnvs = testCase.oracleEnvs ?? ALL_ENVS;

    for (const env of ALL_ENVS) {
      for (const spec of specs) {
        const expected = testCase.expect[spec][env];
        const verdict = moduleVerdict(fixture, spec, env);
        if (expected.startsWith('./')) {
          assert.deepEqual(verdict, { status: 'resolved', target: expected }, `${spec} ${env}`);
        } else {
          assert.deepEqual(verdict, { status: expected }, `${spec} ${env}`);
        }
      }
    }

    for (const env of oracleEnvs) {
      const results = ORACLES[env](fixture, specs);
      specs.forEach((spec, index) => {
        const oracle = results[index];
        const verdict = moduleVerdict(fixture, spec, env);
        const label = `${spec} under ${env}: oracle ${JSON.stringify(oracle)}, module ${JSON.stringify(verdict)}`;
        assert.equal(oracle.resolved, verdict.status === 'resolved', label);
        if (oracle.resolved) {
          const want = path.join(fixture.pkgDir, verdict.target.slice(2));
          assert.ok(oracle.file.endsWith(want), label);
        }
      });
    }

    for (const [spec, edges] of Object.entries(testCase.edges ?? {})) {
      for (const [edgeKind, ok] of Object.entries(edges)) {
        const result = checkEdge(
          fixture.pkg,
          subpathOf(spec),
          edgeKind,
          fileExistsIn(fixture.pkgDir)
        );
        assert.equal(result.ok, ok, `${spec} ${edgeKind}: ${JSON.stringify(result)}`);
        assert.deepEqual(
          Object.keys(result.environments).sort(byCodeUnit),
          environmentsFor(edgeKind).slice().sort(byCodeUnit)
        );
      }
    }
  });
}

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
