#!/usr/bin/env node
// Advisory pre-push helper, not a gate: hosted CI stays the authority, and a miss costs one CI
// cycle. It runs the contract tests whose inputs the committed diff touches (S-lite), the E2E
// contract command when its inputs or the E2E area change, and the security guard always.
//
// What it can miss, by design: a test that scans a directory (readdir, glob, `git ls-files`) is
// matched by its file inputs and the area table below only, so a change elsewhere under a scanned
// directory does not select it; paths built at run time, glob patterns and package-name imports are
// invisible to the static closure.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inputClosure, inventory, touches } from './contract-test-inputs.mjs';
import {
  CONTRACTS_COMMAND,
  E2E_COMMAND,
  e2eWiring,
  git,
  tracked,
  workspacePackages,
} from './contract-test-wiring.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN_TEST = 'scripts/ci/contract-test-shards.test.mjs';
const CONTRACT_TEST = /^scripts\/ci\/[^/]+\.test\.mjs$/u;
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
  'scripts/ci/contract-test-wiring.mjs',
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

// A diff entry outside the statuses a commit-to-commit diff produces, or without a path, is not
// classifiable: the full commands run.
const KNOWN_STATUS = new Set(['A', 'C', 'D', 'M', 'R', 'T']);
export function unrecognizedEntry(entries) {
  const odd = entries.find(
    entry =>
      !KNOWN_STATUS.has(entry.status) ||
      !entry.file ||
      (['R', 'C'].includes(entry.status) && !entry.oldPath)
  );
  return odd ? `unrecognized diff entry ${odd.status ?? '?'} ${odd.file ?? ''}`.trim() : null;
}

// Pure selection over precomputed closures. Returns `full` when the full commands must run.
export function selectContractWork({ tests, closureOf, changed, structural, e2eClosure }) {
  const fallback = fullFallback(changed);
  if (fallback) return { full: `${fallback} changed` };
  if (!e2eClosure) return { full: `${E2E_COMMAND} wiring is not plain pnpm/node steps` };
  const selected = new Map();
  for (const test of tests) {
    const closure = closureOf(test);
    // An import the workspace cannot resolve is not classifiable: the test always runs.
    const input = closure.unresolved
      ? `unresolved import ${closure.unresolved}`
      : touches(closure, changed);
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

// The runner and the diff parser load at run time, so a change that moves either still reaches
// the full fallback instead of failing at import.
export async function loadDependencies(load = specifier => import(specifier)) {
  try {
    const [guard, shards] = await Promise.all([
      load('../lib/modularity-guard.mjs'),
      load('./contract-test-shards.mjs'),
    ]);
    const found = {
      parseNameStatus: guard.parseNameStatus,
      contractTestPlan: shards.contractTestPlan,
      runParallel: shards.runParallel,
    };
    const missing = Object.keys(found).filter(name => typeof found[name] !== 'function');
    if (missing.length) return { error: new Error(`missing export(s) ${missing.join(', ')}`) };
    return found;
  } catch (error) {
    return { error };
  }
}

function resolveBase(root, baseRef) {
  try {
    return git(root, ['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`]).trim();
  } catch {
    throw new Error(`base ${baseRef} is not a commit`);
  }
}

export async function planWork(root, baseRef, load = loadDependencies) {
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=all']);
  if (dirty.trim()) throw new Error('working tree is not clean');
  const mergeBase = git(root, ['merge-base', resolveBase(root, baseRef), 'HEAD']).trim();
  const { error, parseNameStatus, contractTestPlan, runParallel } = await load();
  if (error) {
    return { mergeBase, changed: null, tests: [], full: `runner unavailable: ${error.message}` };
  }
  const entries = parseNameStatus(
    git(root, ['diff', '--name-status', '-z', '--find-renames', mergeBase, 'HEAD'])
  );
  const changed = [
    ...new Set(entries.flatMap(entry => [entry.file, entry.oldPath].filter(Boolean))),
  ];
  const odd = unrecognizedEntry(entries);
  if (odd) return { mergeBase, changed, tests: [], full: odd };
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
  paths.workspace = workspacePackages(root, [mergeBase, 'HEAD'], paths);
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
  return { mergeBase, changed, tests, runParallel, ...work };
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
    results.push((await work.runParallel({ root, select })) === 0);
  }
  const e2eState = work.e2e ? `selected <- ${work.e2e}` : 'not selected';
  log(`${E2E_COMMAND}: ${e2eState}`);
  if (work.e2e) results.push(runCommand(root, ['pnpm', E2E_COMMAND]));
  return results;
}

export async function main(argv, root = REPO_ROOT, load = loadDependencies) {
  const baseRef = parseArgs(argv);
  if (!baseRef) {
    console.error(`contract-test-affected refused: ${USAGE}. Nothing ran.`);
    return 2;
  }
  const started = Date.now();
  let work;
  try {
    work = await planWork(root, baseRef, load);
  } catch (error) {
    console.error(`contract-test-affected refused: ${error.message}. Nothing ran.`);
    return 2;
  }
  const log = text => process.stdout.write(`${text}\n`);
  const base = work.mergeBase.slice(0, 9);
  const count = work.changed ? work.changed.length : 'unknown';
  log(`contract-test-affected: base ${base}, ${count} changed path(s)`);
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
