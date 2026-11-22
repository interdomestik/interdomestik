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
const E2E_COMMAND = 'check:e2e-contracts';
const CONTRACTS_COMMAND = 'test:ci:contracts:parallel';

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

// `pnpm x` and `pnpm run x` both name the package script x.
function pnpmTarget([tool, first, second]) {
  if (tool !== 'pnpm') return null;
  return first === 'run' ? second : first;
}

// The `node <script>` entry points behind a package script, following `pnpm <script>` links.
export function commandScripts(scripts, name, seen = new Set(), stack = new Set()) {
  if (stack.has(name) || typeof scripts[name] !== 'string') return null;
  seen.add(name);
  stack.add(name);
  const entries = [];
  for (const step of scripts[name].split('&&').map(part => part.trim().split(/\s+/u))) {
    const [tool, first] = step;
    const linked = pnpmTarget(step);
    if (linked) {
      const nested = commandScripts(scripts, linked, seen, stack);
      if (!nested) return null;
      entries.push(...nested);
    } else if (tool === 'node' && first) entries.push(first);
    else return null; // Unknown wiring: the caller falls back to the full commands.
  }
  return entries;
}

// Pure selection over precomputed closures. Returns null when the full commands must run.
export function selectContractWork({ tests, closureOf, changed, structural, e2eClosure }) {
  const fallback = changed.find(file => FULL_FALLBACK.includes(file));
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
  execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const tracked = (root, ref) => git(root, ['ls-tree', '-r', '-z', '--name-only', ref]).split('\0');

function packageScripts(root, ref) {
  return JSON.parse(git(root, ['show', `${ref}:package.json`])).scripts ?? {};
}

export function planWork(root, baseRef) {
  if (git(root, ['status', '--porcelain']).trim()) throw new Error('working tree is not clean');
  const mergeBase = git(root, ['merge-base', baseRef, 'HEAD']).trim();
  const entries = parseNameStatus(
    git(root, ['diff', '--name-status', '-z', '--find-renames', mergeBase, 'HEAD'])
  );
  const changed = [
    ...new Set(entries.flatMap(entry => [entry.file, entry.oldPath].filter(Boolean))),
  ];
  const headFiles = new Set(tracked(root, 'HEAD').filter(Boolean));
  const paths = inventory([...headFiles, ...tracked(root, mergeBase).filter(Boolean)]);
  const read = file =>
    headFiles.has(file) ? fs.readFileSync(path.join(root, file), 'utf8') : undefined;
  const plan = contractTestPlan(root);
  const tests = Object.values(plan.shards).flat();
  const isTest = file => /^scripts\/ci\/[^/]+\.test\.mjs$/u.test(file);
  const structural = entries.find(
    entry => entry.status !== 'M' && isTest(entry.oldPath ?? entry.file)
  );
  const [before, after] = [packageScripts(root, mergeBase), packageScripts(root, 'HEAD')];
  // Every package script on either side's E2E chain, plus the contracts command: a changed
  // definition means the hosted commands changed, so both run in full.
  const wiring = new Set([CONTRACTS_COMMAND]);
  commandScripts(before, E2E_COMMAND, wiring);
  const chain = commandScripts(after, E2E_COMMAND, wiring);
  const rewired = [...wiring].some(key => before[key] !== after[key]);
  let e2eClosure = null;
  if (chain) {
    e2eClosure = { files: new Set(), dirs: new Set() };
    for (const script of chain) {
      const closure = inputClosure(script, read, paths);
      closure.files.forEach(file => e2eClosure.files.add(file));
      closure.dirs.forEach(dir => e2eClosure.dirs.add(dir));
    }
  }
  const work = rewired
    ? { full: 'package.json contract or E2E command wiring changed' }
    : selectContractWork({
        tests,
        closureOf: test => inputClosure(test, read, paths),
        changed,
        structural: structural?.file,
        e2eClosure,
      });
  return { mergeBase, changed, tests, ...work };
}

function runCommand(root, args, env = process.env) {
  return spawnSync(args[0], args.slice(1), { cwd: root, stdio: 'inherit', env }).status === 0;
}

export async function main(argv, root = REPO_ROOT) {
  const [flag, baseRef = 'origin/main', ...rest] = argv;
  if ((flag !== undefined && flag !== '--base') || rest.length) {
    console.error('Usage: node scripts/ci/contract-test-affected.mjs [--base <ref>]');
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
  log(
    `contract-test-affected: base ${work.mergeBase.slice(0, 9)}, ${work.changed.length} changed path(s)`
  );
  const results = [];
  if (work.full) {
    log(`FULL fallback (${work.full}): both hosted commands run; this is slow.`);
    results.push(
      runCommand(root, ['pnpm', CONTRACTS_COMMAND]),
      runCommand(root, ['pnpm', E2E_COMMAND])
    );
  } else {
    log(`${work.selected.size} of ${work.tests.length} contract test file(s) selected`);
    for (const [test, input] of work.selected) log(`  ${test}  <- ${input}`);
    if (work.selected.size) {
      results.push(
        (await runParallel({
          root,
          select: files => files.filter(file => work.selected.has(file)),
        })) === 0
      );
    }
    const e2eState = work.e2e ? `selected <- ${work.e2e}` : 'not selected';
    log(`${E2E_COMMAND}: ${e2eState}`);
    if (work.e2e) results.push(runCommand(root, ['pnpm', E2E_COMMAND]));
  }
  const env = { ...process.env, MODULARITY_GUARD_BASE_SHA: work.mergeBase };
  results.push(runCommand(root, [process.execPath, 'scripts/security-guard.mjs'], env));
  const ok = results.every(Boolean);
  log(
    `${ok ? 'PASS' : 'FAIL'}: ${((Date.now() - started) / 1000).toFixed(1)}s. Advisory; hosted CI remains authoritative.`
  );
  return ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
