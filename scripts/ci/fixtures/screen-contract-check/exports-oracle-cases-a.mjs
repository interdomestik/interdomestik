import { PKG_NAME } from './exports-fixtures.mjs';

// expect[spec][env]: the target ('./x.js') the specified semantics give, or a
// status string ('blocked' / 'not-exported') for a refusal.
export const CASES_A = [
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
];
