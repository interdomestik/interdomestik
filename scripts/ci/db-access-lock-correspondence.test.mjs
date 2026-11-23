// The checkout's first-party lockfile links match the manifests exactly, in both directions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { lockManifestProblems } from './db-access-lock-correspondence.mjs';
import { rootDir } from './db-access-guard-test-utils.mjs';

const LOCK = `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      left-pad:
        specifier: 1.0.0
        version: 1.0.0

  packages/a:
    dependencies:
      '@interdomestik/b':
        specifier: workspace:*
        version: link:../b

  packages/b:
    devDependencies:
      left-pad:
        specifier: 1.0.0
        version: 1.0.0

packages: {}
`;
const MANIFESTS = {
  'package.json': { name: 'root', devDependencies: { 'left-pad': '1.0.0' } },
  'packages/a/package.json': {
    name: '@interdomestik/a',
    dependencies: { '@interdomestik/b': 'workspace:*' },
  },
  'packages/b/package.json': { name: '@interdomestik/b', devDependencies: { 'left-pad': '1.0.0' } },
};

// An importer with no first-party link in either direction.
const UNLINKED_C = LOCK.replace(
  '\npackages: {}\n',
  '\n  packages/c:\n    devDependencies:\n      left-pad:\n        specifier: 1.0.0\n        version: 1.0.0\n\npackages: {}\n'
);

function repo(t, { lock = LOCK, manifests = {}, raw = {}, mutate } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-correspondence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  if (lock !== null) write('pnpm-lock.yaml', lock);
  for (const [file, value] of Object.entries({ ...MANIFESTS, ...manifests }))
    if (value !== null) write(file, JSON.stringify(value));
  for (const [file, text] of Object.entries(raw)) write(file, text);
  mutate?.(root);
  return root;
}

test('the real checkout: every first-party link is declared and every declaration is linked', () => {
  assert.deepEqual(lockManifestProblems(rootDir), []);
});

test('the minimal fixtures are consistent', t => {
  assert.deepEqual(lockManifestProblems(repo(t)), []);
  const c = { 'packages/c/package.json': { name: '@interdomestik/c' } };
  assert.deepEqual(lockManifestProblems(repo(t, { lock: UNLINKED_C, manifests: c })), []);
});

test('missing, empty, unparseable and valid-but-empty inputs are problems', t => {
  const cases = {
    'missing lockfile': { lock: null },
    'unparseable lockfile': { lock: `${LOCK}\n` },
    'missing manifest': { manifests: { 'packages/a/package.json': null } },
    'empty manifest': { raw: { 'packages/a/package.json': '' } },
    'unparseable manifest': { raw: { 'packages/a/package.json': '{' } },
    'array manifest': { raw: { 'packages/a/package.json': '[]' } },
    'valid-but-empty manifest': { manifests: { 'packages/a/package.json': {} } },
    'valid-but-empty manifest without links': {
      lock: UNLINKED_C,
      manifests: { 'packages/c/package.json': {} },
    },
    'valid-but-empty root manifest': { manifests: { 'package.json': {} } },
    'empty name without links': {
      lock: UNLINKED_C,
      manifests: { 'packages/c/package.json': { name: '' } },
    },
    'no root importer': {
      lock: LOCK.replace(
        '\n  .:\n    devDependencies:\n      left-pad:\n        specifier: 1.0.0\n        version: 1.0.0\n',
        '\n'
      ),
    },
  };
  for (const [name, options] of Object.entries(cases))
    assert.notDeepEqual(lockManifestProblems(repo(t, options)), [], name);
});

test('one-sided, misplaced or non-workspace declarations are problems', t => {
  const cases = {
    'declared, not linked': {
      manifests: {
        'packages/b/package.json': {
          name: '@interdomestik/b',
          devDependencies: { 'left-pad': '1.0.0' },
          dependencies: { '@interdomestik/a': 'workspace:*' },
        },
      },
    },
    'linked, not declared': {
      manifests: { 'packages/a/package.json': { name: '@interdomestik/a' } },
    },
    'other block': {
      manifests: {
        'packages/a/package.json': {
          name: '@interdomestik/a',
          devDependencies: { '@interdomestik/b': 'workspace:*' },
        },
      },
    },
    'registry specifier': {
      manifests: {
        'packages/a/package.json': {
          name: '@interdomestik/a',
          dependencies: { '@interdomestik/b': '^1.0.0' },
        },
      },
    },
    'target named differently': {
      manifests: { 'packages/b/package.json': { name: '@interdomestik/c' } },
    },
    'package directory without an importer': {
      manifests: { 'packages/c/package.json': { name: '@interdomestik/c' } },
    },
    'root claims a package name': {
      manifests: {
        'package.json': { name: '@interdomestik/b', devDependencies: { 'left-pad': '1.0.0' } },
      },
    },
    'array dependencies block': {
      manifests: { 'packages/b/package.json': { name: '@interdomestik/b', dependencies: [] } },
    },
    'string dependencies block': {
      manifests: { 'packages/b/package.json': { name: '@interdomestik/b', dependencies: 'x' } },
    },
    'non-string specifier': {
      manifests: {
        'packages/a/package.json': {
          name: '@interdomestik/a',
          dependencies: { '@interdomestik/b': 1 },
        },
      },
    },
    'wrong lock target': { lock: LOCK.replace('version: link:../b', 'version: link:../a') },
    'malformed scoped name in the lockfile': {
      lock: LOCK.replace("'@interdomestik/b':", "'@interdomestik/../b':"),
    },
  };
  for (const [name, options] of Object.entries(cases))
    assert.notDeepEqual(lockManifestProblems(repo(t, options)), [], name);
});

test('symlinked manifests, target directories and lockfiles are problems', t => {
  const cases = {
    'symlinked manifest': root => {
      fs.rmSync(path.join(root, 'packages/a/package.json'));
      fs.symlinkSync(
        path.join(root, 'packages/b/package.json'),
        path.join(root, 'packages/a/package.json')
      );
    },
    'symlinked target directory': root => {
      fs.renameSync(path.join(root, 'packages/b'), path.join(root, 'b-real'));
      fs.symlinkSync(path.join(root, 'b-real'), path.join(root, 'packages/b'));
    },
    'symlinked package directory without an importer': root => {
      fs.mkdirSync(path.join(root, 'c-real'));
      fs.writeFileSync(path.join(root, 'c-real/package.json'), '{"name":"@interdomestik/c"}');
      fs.symlinkSync(path.join(root, 'c-real'), path.join(root, 'packages/c'));
    },
    'symlinked lockfile': root => {
      fs.renameSync(path.join(root, 'pnpm-lock.yaml'), path.join(root, 'lock-real.yaml'));
      fs.symlinkSync(path.join(root, 'lock-real.yaml'), path.join(root, 'pnpm-lock.yaml'));
    },
  };
  for (const [name, mutate] of Object.entries(cases))
    assert.notDeepEqual(lockManifestProblems(repo(t, { mutate })), [], name);
});
