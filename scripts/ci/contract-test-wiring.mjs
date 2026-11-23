import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { inputClosure } from './contract-test-inputs.mjs';

// Package-script and workspace wiring for the advisory pre-push selector
// (contract-test-affected.mjs): the hosted E2E command's entry points, and the workspace packages a
// test imports. Anything not derivable returns null, and the caller falls back to the full commands.

export const E2E_COMMAND = 'check:e2e-contracts';
export const CONTRACTS_COMMAND = 'test:ci:contracts:parallel';

export const git = (root, args) =>
  execFileSync('/usr/bin/git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
export const tracked = (root, ref) =>
  git(root, ['ls-tree', '-r', '-z', '--name-only', ref]).split('\0').filter(Boolean);

const MANIFEST = /^(?:packages|apps)\/[^/]+\/package\.json$/u;
const DEPENDENCY_KEYS = ['dependencies', 'devDependencies', 'peerDependencies'];

// One side's manifest, or null when it is missing, unreadable or unnamed there.
function readManifest(root, ref, file) {
  try {
    const manifest = JSON.parse(git(root, ['show', `${ref}:${file}`]));
    return typeof manifest.name === 'string' ? manifest : null;
  } catch {
    return null;
  }
}

// The directories of a package and of its workspace dependencies, transitively.
function packageDirs(manifests, name) {
  const dirs = new Set();
  const seen = new Set();
  const pending = [name];
  while (pending.length) {
    const next = pending.pop();
    if (seen.has(next) || !manifests.has(next)) continue;
    seen.add(next);
    manifests.get(next).dirs.forEach(dir => dirs.add(dir));
    pending.push(...manifests.get(next).deps);
  }
  return [...dirs];
}

// Workspace package name -> its directory and those of its workspace dependencies (transitively),
// from the package.json files tracked at either ref. A package missing on both sides stays
// unresolved, and a test importing it always runs.
export function workspacePackages(root, refs, paths) {
  const manifests = new Map();
  const files = [...paths.files].filter(file => MANIFEST.test(file));
  for (const file of files) {
    for (const manifest of refs.map(ref => readManifest(root, ref, file)).filter(Boolean)) {
      const entry = manifests.get(manifest.name) ?? { dirs: new Set(), deps: new Set() };
      entry.dirs.add(path.posix.dirname(file));
      for (const key of DEPENDENCY_KEYS) {
        Object.keys(manifest[key] ?? {}).forEach(dep => entry.deps.add(dep));
      }
      manifests.set(manifest.name, entry);
    }
  }
  return new Map([...manifests.keys()].map(name => [name, packageDirs(manifests, name)]));
}

// A side's package scripts, or null when its package.json is missing or unreadable.
function packageScripts(root, ref) {
  try {
    const scripts = JSON.parse(git(root, ['show', `${ref}:package.json`])).scripts;
    return scripts && typeof scripts === 'object' ? scripts : {};
  } catch {
    return null;
  }
}

// One word of a package-script step: no whitespace, quoting, expansion, globbing or redirection.
const WORD = /^[\w./:=@,+-]+$/u;

// `pnpm x` and `pnpm run x` both name the package script x; anything else is not a plain link.
function pnpmTarget(words) {
  if (words[0] !== 'pnpm') return null;
  const rest = words[1] === 'run' ? words.slice(2) : words.slice(1);
  return rest.length === 1 && !rest[0].startsWith('-') ? rest[0] : null;
}

// `node <entry> [args]`: the entry and every non-flag argument are closure roots (an argument
// may name a file the entry reads). An argument that escapes the repository is not derivable.
function nodeEntries([tool, entry, ...args]) {
  if (tool !== 'node' || !entry || entry.startsWith('-')) return null;
  const roots = [entry, ...args.filter(arg => !arg.startsWith('-'))].map(arg =>
    path.posix.normalize(arg)
  );
  return roots.some(root => root.startsWith('..') || path.posix.isAbsolute(root)) ? null : roots;
}

function stepEntries(scripts, step, seen, stack) {
  const words = step.trim().split(' ');
  if (!words.every(word => WORD.test(word))) return null;
  const linked = pnpmTarget(words);
  return linked ? commandScripts(scripts, linked, seen, stack) : nodeEntries(words);
}

// The `node` entry points behind a package script, following `pnpm <script>` links. Returns null
// when any `&&` step is not exactly a plain link or `node <entry> [args]` of plain words; the
// caller then falls back to the full commands.
export function commandScripts(scripts, name, seen = new Set(), stack = new Set()) {
  if (stack.has(name) || typeof scripts[name] !== 'string') return null;
  // Only spaces separate words: a newline or tab anywhere (even beside `&&`) is not derivable.
  if (/[^\S ]/u.test(scripts[name])) return null;
  seen.add(name);
  stack.add(name);
  const entries = [];
  for (const step of scripts[name].split('&&')) {
    const found = stepEntries(scripts, step, seen, stack);
    if (!found) return null;
    entries.push(...found);
  }
  stack.delete(name);
  return entries;
}

// The E2E command's entry points on both sides; null when its wiring is not derivable.
export function e2eWiring(root, mergeBase, read, paths) {
  const [before, after] = [packageScripts(root, mergeBase), packageScripts(root, 'HEAD')];
  if (!before || !after) return { full: 'package.json is missing or unreadable on one side' };
  // Every package script on either side's E2E chain, plus the contracts command: a changed
  // definition means the hosted commands changed, so both run in full.
  const wiring = new Set([CONTRACTS_COMMAND]);
  const chainBefore = commandScripts(before, E2E_COMMAND, wiring);
  const chain = commandScripts(after, E2E_COMMAND, wiring);
  const rewired = [...wiring].some(key => before[key] !== after[key]);
  if (rewired) return { full: 'package.json contract or E2E command wiring changed' };
  if (!chain || !chainBefore) return { closure: null };
  const closure = { files: new Set(), dirs: new Set() };
  for (const script of chain) {
    // A tracked directory argument is a directory input; anything else roots a closure.
    if (paths.dirs.has(script)) {
      closure.dirs.add(`${script}/`);
      continue;
    }
    const found = inputClosure(script, read, paths);
    found.files.forEach(file => closure.files.add(file));
    found.dirs.forEach(dir => closure.dirs.add(dir));
  }
  return { closure };
}
