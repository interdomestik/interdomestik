#!/usr/bin/env node
// Server mutation checks, report phase (WP-02 part 1, design §6–§7): CHK-04, CHK-05, CHK-05b,
// CHK-26 and UNAUTH-TEXT against a shrink-only baseline judged from the trusted base revision.
// Advisory: run by the server-mutation-report workflow, not by the ci workflow, until each flip.
//
//   node scripts/ci/server-mutation-check.mjs --base <sha> [--head <sha>] [--check <id>]
//     [--enforcing] [--report <path>] [--repo <path>]
//
// Exit 0 clean, 1 an enforcing check has new/fixed/tamper findings, 2 any scanner or input error.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ScanError, createParser, listSourceFiles, scanRoots } from './server-mutation/ast.mjs';
import { BASELINE_PATH, parseBaseline } from './server-mutation/baseline.mjs';
import { CHECKS, evaluateCheck, exitCode, selectChecks } from './server-mutation/evaluate.mjs';
import { ensureCommit, extractRevision, headSha, showAt } from './server-mutation/git.mjs';
import { loadRegistry } from './server-mutation/registry.mjs';
import { annotate, writeReport } from './server-mutation/output.mjs';

const SCRIPT_PATH = 'scripts/ci/server-mutation-check.mjs';
const DEFAULT_REPORT = 'tmp/server-mutation-check/report.json';
const FLAGS = new Set(['--enforcing', '--advisory']);
const OPTIONS = new Set(['--base', '--head', '--check', '--report', '--repo']);

export function parseArgs(argv) {
  const args = { enforcing: false, report: DEFAULT_REPORT };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (FLAGS.has(flag)) args.enforcing = flag === '--enforcing';
    else if (OPTIONS.has(flag) && typeof argv[i + 1] === 'string')
      args[flag.slice(2)] = argv[(i += 1)];
    else throw new ScanError(`unknown or incomplete argument ${flag}`);
  }
  if (!args.base) throw new ScanError('--base <sha> is required');
  if (args.check && args.enforcing) throw new ScanError('--check and --enforcing are exclusive');
  return args;
}

function readBaselines(repo, root, baseSha) {
  const baseText = showAt(repo, baseSha, BASELINE_PATH);
  let base = null;
  if (baseText === null) {
    // Bootstrap: accepted only while the base has neither the baseline nor this scanner.
    if (showAt(repo, baseSha, SCRIPT_PATH) !== null)
      throw new ScanError('base has the scanner but no baseline');
  } else base = parseBaseline(baseText, 'base', CHECKS);
  const headFile = path.join(root, BASELINE_PATH);
  const head = parseBaseline(
    fs.existsSync(headFile) ? fs.readFileSync(headFile, 'utf8') : '',
    'head',
    CHECKS
  );
  // Valid but empty is not a baseline: the head must name every check this scanner runs.
  for (const check of CHECKS)
    if (!head.checks[check.id]) throw new ScanError(`head baseline has no ${check.id}`);
  return { base, head, bootstrap: base === null };
}

export function run(argv, cwd = process.cwd()) {
  const report = {
    version: 1,
    status: 'ok',
    invocation: 'advisory',
    bootstrap: false,
    base: null,
    head: null,
    checks: {},
    errors: [],
  };
  let args = { report: DEFAULT_REPORT };
  let extracted = null;
  const results = [];
  try {
    args = parseArgs(argv);
    report.invocation = args.check
      ? `check:${args.check}`
      : args.enforcing
        ? 'enforcing'
        : 'advisory';
    const repo = path.resolve(cwd, args.repo ?? '.');
    report.base = ensureCommit(repo, args.base, 'base');
    report.head = args.head ? ensureCommit(repo, args.head, 'head') : headSha(repo);
    if (args.head) extracted = extractRevision(repo, report.head);
    const root = extracted ?? repo;
    const { base, head, bootstrap } = readBaselines(repo, root, report.base);
    report.bootstrap = bootstrap;
    const selected = selectChecks(args, base, head);
    const ctx = {
      root,
      files: listSourceFiles(root, scanRoots(root)),
      parse: createParser(root),
      registry: null,
    };
    if (selected.some(check => check.needsRegistry)) ctx.registry = loadRegistry(root);
    for (const check of selected)
      results.push(evaluateCheck(check, ctx, base, head, { base: report.base, head: report.head }));
  } catch (error) {
    report.errors.push(
      error instanceof ScanError ? error.message : `scanner failure: ${error?.stack ?? error}`
    );
  } finally {
    if (extracted) fs.rmSync(extracted, { recursive: true, force: true });
  }
  const code = exitCode(results, report.errors);
  report.status = report.errors.length ? 'error' : 'ok';
  report.exit = code;
  for (const result of results) {
    const { findings, ...summary } = result;
    report.checks[result.id] = { ...summary, findingCount: findings.length };
  }
  writeReport(path.resolve(cwd, args.report ?? DEFAULT_REPORT), report, results);
  annotate(report, results);
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = run(process.argv.slice(2));
