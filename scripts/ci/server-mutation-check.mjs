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
import {
  BASELINE_PATH,
  parseBaseline,
  removalRecorded,
  removedChecks,
} from './server-mutation/baseline.mjs';
import {
  CHECKS,
  evaluateCheck,
  evaluateRetired,
  exitCode,
  selectChecks,
  selectRetired,
} from './server-mutation/evaluate.mjs';
import { ensureCommit, extractRevision, headSha, showAt } from './server-mutation/git.mjs';
import { REGISTRY_PATH, loadRegistry, parseRegistry } from './server-mutation/registry.mjs';
import { annotate, writeReport } from './server-mutation/output.mjs';

const SCRIPT_PATH = 'scripts/ci/server-mutation-check.mjs';
const CHECKS_DIR = 'scripts/ci/server-mutation';

const baseRanCheck = (repo, baseSha, check) =>
  check.sources.some(name =>
    (showAt(repo, baseSha, `${CHECKS_DIR}/${name}`) ?? '').includes(`id: '${check.id}'`)
  );
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

// The registry of the trusted base, or null when the base has none (before part 1).
function baseRegistryAt(repo, baseSha) {
  const text = showAt(repo, baseSha, REGISTRY_PATH);
  if (text === null) return null;
  try {
    return parseRegistry(text);
  } catch (error) {
    throw new ScanError(`base registry: ${error.message}`);
  }
}

function invocationOf(args) {
  if (args.check) return `check:${args.check}`;
  return args.enforcing ? 'enforcing' : 'advisory';
}

function readBaselines(repo, root, baseSha) {
  const baseText = showAt(repo, baseSha, BASELINE_PATH);
  let base = null;
  if (baseText === null) {
    // Bootstrap: accepted only while the base has neither the baseline nor this scanner.
    if (showAt(repo, baseSha, SCRIPT_PATH) !== null)
      throw new ScanError('base has the scanner but no baseline');
  } else base = parseBaseline(baseText, 'base', CHECKS, { retired: () => true });
  const headFile = path.join(root, BASELINE_PATH);
  const head = parseBaseline(
    fs.existsSync(headFile) ? fs.readFileSync(headFile, 'utf8') : '',
    'head',
    CHECKS,
    { retired: id => Boolean(base?.checks[id]) }
  );
  // Valid but empty is never a baseline, on either side.
  if (base && !Object.keys(base.checks).length) throw new ScanError('base baseline names no check');
  if (!Object.keys(head.checks).length) throw new ScanError('head baseline names no check');
  for (const check of CHECKS) assertNamed(repo, baseSha, check, base, head);
  assertRemovalsKept(base, head);
  return { base, head, bootstrap: base === null };
}

// Valid but empty is not a baseline. The base names every check its own scanner ran (a check new in
// this head is absent from the base scanner's evaluation) unless the base records the owner's removal
// of it; the head names every check unless the base has it (the removal is then judged as tamper
// against the base) or the base records its removal (Astra r2 B10).
function assertNamed(repo, baseSha, check, base, head) {
  const { id } = check;
  const removed = removalRecorded(base, id);
  if (base && !base.checks[id] && !removed && baseRanCheck(repo, baseSha, check))
    throw new ScanError(`base baseline has no ${id}`);
  if (!head.checks[id] && !base?.checks[id] && !removed)
    throw new ScanError(`head baseline has no ${id}`);
}

// Every removal the base records stays recorded while the check is absent from both sides, whether
// or not this scanner still has the check (Astra r2 B10, r3 B10).
function assertRemovalsKept(base, head) {
  for (const id of removedChecks(base))
    if (!base.checks[id] && !head.checks[id] && !removalRecorded(head, id))
      throw new ScanError(`head baseline drops the recorded removal of ${id}`);
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
    report.invocation = invocationOf(args);
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
    if (selected.some(check => check.needsRegistry)) {
      ctx.registry = loadRegistry(root);
      ctx.baseRegistry = baseRegistryAt(repo, report.base);
    }
    const shas = { base: report.base, head: report.head };
    for (const check of selected) results.push(evaluateCheck(check, ctx, base, head, shas));
    for (const id of selectRetired(args, base)) results.push(evaluateRetired(id, base, head, shas));
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
  try {
    writeReport(path.resolve(cwd, args.report ?? DEFAULT_REPORT), report, results);
    annotate(report, results);
  } catch (error) {
    // A scan whose report cannot be written is not a completed scan.
    process.stderr.write(`server-mutation: report not written: ${error?.message ?? error}\n`);
    return 2;
  }
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = run(process.argv.slice(2));
