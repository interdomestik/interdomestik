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
const DEPENDENCY_KEYS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
// A pnpm alias (`"x": "workspace:@scope/name@*"` or `"npm:@scope/name@…"`) names its target; a
// relative spec (`workspace:../leaf`, `link:`, `file:`) names a directory.
const ALIAS_TARGET = /^(?:workspace|npm):(@[^@/]+\/[^@/]+)/u;
const RELATIVE_SPEC = /^(?:workspace|link|file):(\.\.?(?:\/.*)?)$/u;

function specTarget(spec, dir) {
  const alias = ALIAS_TARGET.exec(spec)?.[1];
  if (alias) return alias;
  const relative = RELATIVE_SPEC.exec(spec)?.[1];
  return relative ? `dir:${withoutTrailingSlashes(path.posix.join(dir, relative))}` : null;
}

// What a manifest in `dir` depends on: each key, an alias's target name, and a relative target as
// `dir:<path>`.
export function dependencyNames(manifest, dir = '.') {
  return DEPENDENCY_KEYS.flatMap(key =>
    Object.entries(manifest[key] ?? {}).flatMap(([name, spec]) => {
      const target = specTarget(String(spec), dir);
      return target ? [name, target] : [name];
    })
  );
}

// One side's manifest, or null when it is missing, unreadable or unnamed there.
function readManifest(root, ref, file) {
  try {
    const manifest = JSON.parse(git(root, ['show', `${ref}:${file}`]));
    return typeof manifest.name === 'string' ? manifest : null;
  } catch {
    return null;
  }
}

// The directories of a package and of its workspace dependencies, transitively. A `dir:` target
// counts as a directory, and as the package found there.
function packageDirs(manifests, name, byDir) {
  const dirs = new Set();
  const seen = new Set();
  const pending = [name];
  while (pending.length) {
    const next = pending.pop();
    if (next.startsWith('dir:')) {
      dirs.add(next.slice(4));
      if (byDir.has(next.slice(4))) pending.push(byDir.get(next.slice(4)));
      continue;
    }
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
  const byDir = new Map();
  const files = [...paths.files].filter(file => MANIFEST.test(file));
  for (const file of files) {
    const dir = path.posix.dirname(file);
    for (const manifest of refs.map(ref => readManifest(root, ref, file)).filter(Boolean)) {
      const entry = manifests.get(manifest.name) ?? { dirs: new Set(), deps: new Set() };
      entry.dirs.add(dir);
      byDir.set(dir, manifest.name);
      dependencyNames(manifest, dir).forEach(dep => entry.deps.add(dep));
      manifests.set(manifest.name, entry);
    }
  }
  return new Map([...manifests.keys()].map(name => [name, packageDirs(manifests, name, byDir)]));
}

// A side's package scripts, or null when its package.json is missing or unreadable.
export function packageScripts(root, ref) {
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

function withoutTrailingSlashes(text) {
  let end = text.length;
  while (end > 0 && text[end - 1] === '/') end -= 1;
  return text.slice(0, end);
}

// `node <entry> [args]`: the entry and every non-flag argument are closure roots (an argument
// may name a file the entry reads). An argument that escapes the repository is not derivable.
function nodeEntries([tool, entry, ...args]) {
  if (tool !== 'node' || !entry || entry.startsWith('-')) return null;
  // Normalized without a trailing slash, so `./dir/` and `dir` name the same directory.
  // A flag's `=value` is an argument too (`--fixtures=./dir/`).
  const values = args.flatMap(arg => {
    if (!arg.startsWith('-')) return [arg];
    const value = arg.slice(arg.indexOf('=') + 1);
    return arg.includes('=') && value ? [value] : [];
  });
  const roots = [entry, ...values].map(
    arg => withoutTrailingSlashes(path.posix.normalize(arg)) || '.'
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

// Every package script a command reaches through `pnpm|npm|yarn [run] <script>` in any form.
const SCRIPT_LINK = /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?([\w:.@/-]+)/gu;
function linkedScripts(scripts, name, seen) {
  const pending = [name];
  while (pending.length) {
    const next = pending.pop();
    if (seen.has(next)) continue;
    seen.add(next);
    const body = scripts[next];
    if (typeof body === 'string') pending.push(...[...body.matchAll(SCRIPT_LINK)].map(m => m[1]));
  }
}

// The E2E command's entry points on both sides; null when its wiring is not derivable. `sides`
// (the package scripts at the merge-base and HEAD) is read from Git unless given.
export function e2eWiring(root, mergeBase, read, paths, sides = null) {
  const { before, after } = sides ?? {
    before: packageScripts(root, mergeBase),
    after: packageScripts(root, 'HEAD'),
  };
  if (!before || !after) return { full: 'package.json is missing or unreadable on one side' };
  // Every package script the contracts command or either side's E2E chain reaches: a changed
  // definition means the hosted commands changed, so both run in full.
  const wiring = new Set();
  linkedScripts(before, CONTRACTS_COMMAND, wiring);
  linkedScripts(after, CONTRACTS_COMMAND, wiring);
  const chainBefore = commandScripts(before, E2E_COMMAND, wiring);
  const chain = commandScripts(after, E2E_COMMAND, wiring);
  const rewired = [...wiring].some(key => before[key] !== after[key]);
  if (rewired) return { full: 'package.json contract or E2E command wiring changed' };
  if (!chain || !chainBefore) return { closure: null };
  const closure = { files: new Set(), dirs: new Set(), pinned: new Set(), unresolved: null };
  for (const script of chain) {
    // The repository root or a tracked directory argument is a directory input (the root matches
    // every change); anything else roots a closure, whose pins and unresolved imports carry over.
    if (script === '.' || paths.dirs.has(script)) {
      closure.dirs.add(script === '.' ? '' : `${script}/`);
      continue;
    }
    const found = inputClosure(script, read, paths);
    for (const key of ['files', 'dirs', 'pinned']) {
      found[key].forEach(value => closure[key].add(value));
    }
    closure.unresolved ??= found.unresolved;
  }
  return { closure };
}
