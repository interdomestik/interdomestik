import { PKG_NAME } from './exports-fixtures.mjs';

export const CASES_B = [
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
    // TypeScript resolves in two passes over the whole map: typed sources first,
    // then JavaScript. A JS entry before a typed one loses to it (B8).
    name: '11i array: a JS file first, a typed implementation second',
    exports: { '.': ['./a.js', './b.ts'] },
    files: ['a.js', 'b.ts'],
    expect: {
      [PKG_NAME]: {
        'node-import': './a.js',
        'node-require': './a.js',
        'bundler-browser': './a.js',
        types: './b.ts',
      },
    },
    edges: { [PKG_NAME]: { import: true, require: true, type: true } },
  },
  {
    name: '11j conditions: JS under import, a typed implementation under default',
    exports: { '.': { import: './a.js', default: './b.ts' } },
    files: ['a.js', 'b.ts'],
    expect: {
      [PKG_NAME]: {
        'node-import': './a.js',
        'node-require': './b.ts',
        'bundler-browser': './a.js',
        types: './b.ts',
      },
    },
    edges: { [PKG_NAME]: { import: true, require: true, type: true } },
  },
  {
    name: '11k array: only JS files, the first wins in the JavaScript pass',
    exports: { '.': ['./a.js', './b.js'] },
    files: ['a.js', 'b.js'],
    expect: {
      [PKG_NAME]: {
        'node-import': './a.js',
        'node-require': './a.js',
        'bundler-browser': './a.js',
        types: './a.js',
      },
    },
  },
  {
    // TypeScript maps a .jsx target to .tsx, then .ts, then .d.ts (B8).
    name: '11l a .jsx target with only the .ts source',
    exports: { '.': './e.jsx' },
    files: ['e.ts'],
    expect: {
      [PKG_NAME]: {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': 'missing',
        types: './e.ts',
      },
    },
    edges: { [PKG_NAME]: { import: false, require: false, type: true } },
  },
  {
    name: '11m a .js target with only its declaration, a .ts target with only its .js',
    exports: { './d': './d.js', './t': './t.ts', './s': './s.d.js' },
    files: ['d.d.ts', 't.js', 's.d.ts'],
    expect: {
      '@fx/pkg/d': {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': 'missing',
        types: './d.d.ts',
      },
      '@fx/pkg/t': {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': 'missing',
        types: './t.js',
      },
      // A stem ending in `.d` is no declaration: `s.d.js` names `s.d.ts`.
      '@fx/pkg/s': {
        'node-import': 'missing',
        'node-require': 'missing',
        'bundler-browser': 'missing',
        types: './s.d.ts',
      },
    },
    edges: {
      '@fx/pkg/d': { import: false, type: true },
      '@fx/pkg/t': { import: false, type: true },
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
