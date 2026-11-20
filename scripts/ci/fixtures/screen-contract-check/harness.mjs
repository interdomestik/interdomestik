// Fixture harness of the screen-contract contract tests: throwaway source trees and git repositories
// in the OS temp directory. It never reads the real tree's findings.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lintTree, linted } from '../../screen-contract/lint.mjs';

export const FIXTURES = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(FIXTURES, '../../../..');
export const SCANNER = path.join(REPO_ROOT, 'scripts/ci/screen-contract-check.mjs');

const pkg = (name, exportsMap) => JSON.stringify({ name, private: true, exports: exportsMap });

// The minimum every tree needs: the web tsconfig with its `@/` mapping and a few packages.
export const BASE_FILES = Object.freeze({
  'scripts/ci/screen-contract/consent-registry.json': '{ "version": 1, "entries": [] }\n',
  'apps/web/tsconfig.json':
    '{\n  // comment\n  "compilerOptions": { "paths": { "@/*": ["./src/*"] } },\n}\n',
  'packages/database/package.json': pkg('@interdomestik/database', {
    '.': './src/index.ts',
    './schema': './src/schema/index.ts',
  }),
  'packages/database/src/index.ts': 'export const db = 1;\n',
  'packages/database/src/schema/index.ts': 'export const things = 1;\n',
  'packages/ui/package.json': pkg('@interdomestik/ui', {
    '.': './src/index.ts',
    './button': './src/components/button.tsx',
    './icons/*': './src/icons/*.tsx',
  }),
  'packages/ui/src/index.ts': "export * from './components/button';\n",
  'packages/ui/src/components/button.tsx': 'export const Button = () => null;\n',
  'packages/ui/src/components/avatar.tsx': 'export const Avatar = () => null;\n',
  'packages/ui/src/icons/star.tsx': 'export const Star = () => null;\n',
  'packages/domain-claims/package.json': pkg('@interdomestik/domain-claims', {
    '.': './src/index.ts',
  }),
  'packages/domain-claims/src/index.ts': 'export const claims = 1;\n',
});

export function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel);
    if (text === null) {
      fs.rmSync(abs, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  return root;
}

export function tempDir(t, prefix = 'scc-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export const tree = (t, files, base = BASE_FILES) => writeTree(tempDir(t), { ...base, ...files });

export async function lint(root) {
  return lintTree(root, linted(root));
}

export const ids = (result, check) => result[check].items.map(item => item.id).sort();

export function git(root, ...args) {
  return execFileSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

export function repo(t, files) {
  const root = tree(t, files);
  git(root, 'init', '--quiet', '--initial-branch=main');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'fixture');
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'base');
  return root;
}

export function commit(root, files, message = 'change') {
  writeTree(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}
