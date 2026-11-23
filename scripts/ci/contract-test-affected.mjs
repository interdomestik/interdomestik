#!/usr/bin/env node
// Advisory pre-push helper, not a gate: hosted CI stays the authority, and a miss costs one CI
// cycle. It runs the contract tests whose inputs the committed diff touches (S-lite), the E2E
// contract command when its inputs or the E2E area change, and the security guard always.
//
// What it can miss, by design: a test that scans a directory (readdir, glob, `git ls-files`) is
// matched by its file inputs and the area table below only, so a change elsewhere under a scanned
// directory does not select it; paths built at run time, glob patterns and package-name imports are
// invisible to the static closure.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNameStatus } from '../lib/modularity-guard.mjs';
import { contractTestPlan, runParallel } from './contract-test-shards.mjs';
import { inputClosure, inventory, touches } from './contract-test-inputs.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN_TEST = 'scripts/ci/contract-test-shards.test.mjs';
const CONTRACT_TEST = /^scripts\/ci\/[^/]+\.test\.mjs$/u;
const E2E_COMMAND = 'check:e2e-contracts';
const CONTRACTS_COMMAND = 'test:ci:contracts:parallel';
const USAGE = 'usage: node scripts/ci/contract-test-affected.mjs [--base <ref>]';

// Any change here can alter every test or the runner itself: run both full hosted commands.
export const FULL_FALLBACK = Object.freeze([
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.nvmrc',
  'scripts/ci/contract-test-shards.mjs',
  'scripts/ci/contract-test-scratch.mjs',
  'scripts/ci/contract-test-inputs.mjs',
  'scripts/ci/contract-test-affected.mjs',
  'scripts/lib/modularity-guard.mjs',
]);

// Directory-scanning tests whose scans the static closure cannot see, by area.
export const AREA_TABLE = Object.freeze([
  {
    area: 'apps/web/e2e',
    matches: file => file.startsWith('apps/web/e2e/') || file === 'apps/web/playwright.config.ts',
    selects: test => /^scripts\/ci\/e2e-[^/]+\.test\.mjs$/u.test(test),
    e2e: true,
  },
  {
    area: '.github',
    matches: file => file.startsWith('.github/'),
    // A scanning test that names a .github directory holding the changed file. Tests that name the
    // file itself are already selected by their closure.
    selects: (_test, closure, file) =>
      closure.scanner &&
      [...closure.dirs].some(dir => dir.startsWith('.github/') && file.startsWith(dir)),
    e2e: false,
  },
]);

// Anything a shell would interpret beyond `&&`: such a step's entry points cannot be derived.
const SHELL_SYNTAX = /[|;&<>$`(){}*?~\\'"!#]/u;

// `pnpm x` and `pnpm run x` both name the package script x; anything else is not a plain link.
function pnpmTarget(words) {
  if (words[0] !== 'pnpm') return null;
  const rest = words[1] === 'run' ? words.slice(2) : words.slice(1);
  return rest.length === 1 && !rest[0].startsWith('-') ? rest[0] : null;
}

function stepEntries(scripts, step, seen, stack) {
  if (SHELL_SYNTAX.test(step)) return null;
  const words = step.trim().split(/\s+/u);
  const linked = pnpmTarget(words);
  if (linked) return commandScripts(scripts, linked, seen, stack);
  const [tool, entry] = words;
  if (tool !== 'node' || !entry || entry.startsWith('-')) return null;
  const normalized = path.posix.normalize(entry);
  return normalized.startsWith('..') || path.posix.isAbsolute(normalized) ? null : [normalized];
}

// The `node <script>` entry points behind a package script, following `pnpm <script>` links.
// Returns null when any step is not a plain link or `node <script> [args]`.
export function commandScripts(scripts, name, seen = new Set(), stack = new Set()) {
  if (stack.has(name) || typeof scripts[name] !== 'string') return null;
  seen.add(name);
  stack.add(name);
  const entries = [];
  for (const step of scripts[name].split('&&')) {
    const found = stepEntries(scripts, step, seen, stack);
    if (!found) return null; // Unknown wiring: the caller falls back to the full commands.
    entries.push(...found);
  }
  stack.delete(name);
  return entries;
}

// The first added, deleted, renamed or copied contract test (either side of a rename counts).
export function testSetChange(entries) {
  const hit = entries.find(
    entry =>
      entry.status !== 'M' &&
      [entry.file, entry.oldPath].some(file => file && CONTRACT_TEST.test(file))
  );
  return hit?.file;
}

export const fullFallback = changed => changed.find(file => FULL_FALLBACK.includes(file));

// Pure selection over precomputed closures. Returns `full` when the full commands must run.
export function selectContractWork({ tests, closureOf, changed, structural, e2eClosure }) {
  const fallback = fullFallback(changed);
  if (fallback) return { full: `${fallback} changed` };
  if (!e2eClosure) return { full: `${E2E_COMMAND} wiring is not plain pnpm/node steps` };
  const selected = new Map();
  for (const test of tests) {
    const closure = closureOf(test);
    const input = touches(closure, changed);
    if (input) selected.set(test, input);
    for (const entry of AREA_TABLE) {
      const hit = changed.find(file => entry.matches(file) && entry.selects(test, closure, file));
      if (hit && !selected.has(test)) selected.set(test, `${hit} (area ${entry.area})`);
    }
  }
  if (structural && tests.includes(PLAN_TEST)) selected.set(PLAN_TEST, `${structural} (test set)`);
  const areaHit = AREA_TABLE.filter(entry => entry.e2e).flatMap(entry =>
    changed.filter(entry.matches)
  );
  const e2e = touches({ ...e2eClosure, scanner: false }, changed) ?? areaHit[0] ?? null;
  return { full: null, selected, e2e };
}

const git = (root, args) =>
  execFileSync('/usr/bin/git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const tracked = (root, ref) =>
  git(root, ['ls-tree', '-r', '-z', '--name-only', ref]).split('\0').filter(Boolean);

function packageScripts(root, ref) {
  return JSON.parse(git(root, ['show', `${ref}:package.json`])).scripts ?? {};
}

function resolveBase(root, baseRef) {
  try {
    return git(root, ['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`]).trim();
  } catch {
    throw new Error(`base ${baseRef} is not a commit`);
  }
}

// The E2E command's entry points on both sides; null when its wiring is not derivable.
function e2eWiring(root, mergeBase, read, paths) {
  const [before, after] = [packageScripts(root, mergeBase), packageScripts(root, 'HEAD')];
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
    const found = inputClosure(script, read, paths);
    found.files.forEach(file => closure.files.add(file));
    found.dirs.forEach(dir => closure.dirs.add(dir));
  }
  return { closure };
}

export function planWork(root, baseRef) {
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=all']);
  if (dirty.trim()) throw new Error('working tree is not clean');
  const mergeBase = git(root, ['merge-base', resolveBase(root, baseRef), 'HEAD']).trim();
  const entries = parseNameStatus(
    git(root, ['diff', '--name-status', '-z', '--find-renames', mergeBase, 'HEAD'])
  );
  const changed = [
    ...new Set(entries.flatMap(entry => [entry.file, entry.oldPath].filter(Boolean))),
  ];
  const known = fullFallback(changed);
  if (known) return { mergeBase, changed, tests: [], full: `${known} changed` };
  let plan;
  try {
    plan = contractTestPlan(root);
  } catch (error) {
    // The hosted command refuses this tree too: run it so it reports its own outcome.
    return { mergeBase, changed, tests: [], full: `contract test plan refused: ${error.message}` };
  }
  const tests = Object.values(plan.shards).flat();
  const headFiles = new Set(tracked(root, 'HEAD'));
  const paths = inventory([...headFiles, ...tracked(root, mergeBase)]);
  const read = file =>
    headFiles.has(file) ? fs.readFileSync(path.join(root, file), 'utf8') : undefined;
  const wiring = e2eWiring(root, mergeBase, read, paths);
  if (wiring.full) return { mergeBase, changed, tests, full: wiring.full };
  const work = selectContractWork({
    tests,
    closureOf: test => inputClosure(test, read, paths),
    changed,
    structural: testSetChange(entries),
    e2eClosure: wiring.closure,
  });
  return { mergeBase, changed, tests, ...work };
}

// The base ref, or null for any other argument shape.
export function parseArgs(argv) {
  if (argv.length === 0) return 'origin/main';
  const [flag, ref] = argv;
  return argv.length === 2 && flag === '--base' && ref && !ref.startsWith('-') ? ref : null;
}

function runCommand(root, args, env = process.env) {
  return spawnSync(args[0], args.slice(1), { cwd: root, stdio: 'inherit', env }).status === 0;
}

async function runWork(root, work, log) {
  if (work.full) {
    log(`FULL fallback (${work.full}): both hosted commands run; this is slow.`);
    return [runCommand(root, ['pnpm', CONTRACTS_COMMAND]), runCommand(root, ['pnpm', E2E_COMMAND])];
  }
  const results = [];
  log(`${work.selected.size} of ${work.tests.length} contract test file(s) selected`);
  for (const [test, input] of work.selected) log(`  ${test}  <- ${input}`);
  if (work.selected.size) {
    const select = files => files.filter(file => work.selected.has(file));
    results.push((await runParallel({ root, select })) === 0);
  }
  const e2eState = work.e2e ? `selected <- ${work.e2e}` : 'not selected';
  log(`${E2E_COMMAND}: ${e2eState}`);
  if (work.e2e) results.push(runCommand(root, ['pnpm', E2E_COMMAND]));
  return results;
}

export async function main(argv, root = REPO_ROOT) {
  const baseRef = parseArgs(argv);
  if (!baseRef) {
    console.error(`contract-test-affected refused: ${USAGE}. Nothing ran.`);
    return 2;
  }
  const started = Date.now();
  let work;
  try {
    work = planWork(root, baseRef);
  } catch (error) {
    console.error(`contract-test-affected refused: ${error.message}. Nothing ran.`);
    return 2;
  }
  const log = text => process.stdout.write(`${text}\n`);
  const base = work.mergeBase.slice(0, 9);
  log(`contract-test-affected: base ${base}, ${work.changed.length} changed path(s)`);
  const results = await runWork(root, work, log);
  const env = { ...process.env, MODULARITY_GUARD_BASE_SHA: work.mergeBase };
  results.push(runCommand(root, [process.execPath, 'scripts/security-guard.mjs'], env));
  const ok = results.every(Boolean);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  log(`${ok ? 'PASS' : 'FAIL'}: ${seconds}s. Advisory; hosted CI remains authoritative.`);
  return ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
