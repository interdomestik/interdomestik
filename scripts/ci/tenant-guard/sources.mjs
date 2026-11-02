import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { workspaceDirs } from './resolution.mjs';

const GIT = '/usr/bin/git';

export const SOURCE = /\.[cm]?[jt]sx?$/u;
const GENERATED = /(^|\/)(node_modules|dist|build|coverage|test-results|\.next|\.turbo)(\/|$)/u;
const ROOTS = ['apps/web/src', 'packages'];
const MAX_FILES = 15000;
const MAX_BYTES = 64 * 1024 * 1024;

function bounded(sources) {
  let bytes = 0;
  for (const text of sources.values()) bytes += Buffer.byteLength(text);
  if (sources.size > MAX_FILES || bytes > MAX_BYTES)
    throw new Error('incomplete: source bound exceeded');
  return sources;
}

/** The working tree's sources under the guarded roots. Symlinks and path escapes fail closed. */
export function currentSources(repoRoot) {
  const sources = new Map();
  const realRoot = fs.realpathSync(repoRoot);
  const walk = relative => {
    const full = path.join(repoRoot, relative);
    if (!fs.existsSync(full)) return;
    for (const item of fs.readdirSync(full, { withFileTypes: true })) {
      const file = `${relative}/${item.name}`;
      if (GENERATED.test(file)) continue;
      if (item.isSymbolicLink()) throw new Error(`incomplete: source symlink ${file}`);
      if (item.isDirectory()) walk(file);
      else if (SOURCE.test(file)) {
        const real = fs.realpathSync(path.join(repoRoot, file));
        if (!real.startsWith(realRoot + path.sep))
          throw new Error(`incomplete: path escape ${file}`);
        sources.set(file, fs.readFileSync(real, 'utf8'));
      }
    }
  };
  for (const root of ROOTS) walk(root);
  return bounded(sources);
}

/** The trusted tree's sources, read from git by commit and verified against the pinned tree id. */
export function trustedSources(repoRoot, { commit, tree }) {
  const git = (args, input) =>
    execFileSync(GIT, args, { cwd: repoRoot, input, maxBuffer: 256 * 1024 * 1024 }).toString(
      'utf8'
    );
  const actualTree = git(['rev-parse', `${commit}^{tree}`]).trim();
  if (tree && actualTree !== tree)
    throw new Error(`trusted commit ${commit} has tree ${actualTree}, pinned ${tree}`);
  const files = git(['ls-tree', '-r', '--name-only', '-z', commit, '--', ...ROOTS])
    .split('\0')
    .filter(file => file && SOURCE.test(file) && !GENERATED.test(file));
  const sources = new Map();
  if (files.length === 0) return sources;
  const batch = execFileSync(GIT, ['cat-file', '--batch'], {
    cwd: repoRoot,
    input: files.map(file => `${commit}:${file}\n`).join(''),
    maxBuffer: 512 * 1024 * 1024,
  });
  let offset = 0;
  for (const file of files) {
    const headerEnd = batch.indexOf(0x0a, offset);
    const header = batch.subarray(offset, headerEnd).toString('utf8');
    const [, type, size] = header.split(' ');
    if (type !== 'blob') throw new Error(`incomplete: trusted ${file} is ${header}`);
    const start = headerEnd + 1;
    sources.set(file, batch.subarray(start, start + Number(size)).toString('utf8'));
    offset = start + Number(size) + 1;
  }
  return bounded(sources);
}

/** Workspace packages: name, directory, exports and main, from each apps/* and packages/* manifest. */
export function workspacePackages(repoRoot) {
  const packages = new Map();
  for (const dir of workspaceDirs(repoRoot)) {
    const manifest = path.join(repoRoot, dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (pkg.name)
      packages.set(pkg.name, {
        name: pkg.name,
        dir,
        exports: pkg.exports ?? null,
        main: pkg.main ?? null,
      });
  }
  return packages;
}

export const APP_ALIASES = [['@/', 'apps/web/src/']];
