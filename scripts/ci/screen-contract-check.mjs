#!/usr/bin/env node
// Screen-contract checks (WP-05): CHK-15a/b/c, CHK-09 (first part), CHK-22 and A11Y, run as ESLint
// rules under a dedicated config and judged against a shrink-only baseline from the trusted base.
// Advisory: run by the screen-contract-report workflow, not by the ci workflow, until each flip.
//
//   node scripts/ci/screen-contract-check.mjs --base <sha> [--head <sha>] [--check <id>]
//     [--enforcing] [--report <path>] [--repo <path>]
//   node scripts/ci/screen-contract-check.mjs --replay --base <sha> --head <sha> [--report <path>]
//
// Exit 0 clean, 1 an enforcing check has new/fixed/tamper findings, 2 any scanner or input error.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ScanError } from './server-mutation/ast.mjs';
import { parseBaseline, removalRecorded, removedChecks } from './server-mutation/baseline.mjs';
import { ensureCommit, extractRevision, headSha, showAt } from './server-mutation/git.mjs';
import { annotate, writeReport } from './server-mutation/output.mjs';
import { changeReport } from './screen-contract/changes.mjs';
import {
  BASELINE_PATH,
  CHECKS,
  SCRIPT_PATH,
  evaluateCheck,
  exitCode,
  selectChecks,
} from './screen-contract/evaluate.mjs';
import { lintTree, linted } from './screen-contract/lint.mjs';
import {
  REGISTRY_PATH,
  parseRegistry,
  readLanes,
  registryFor,
  registryTamper,
  testEvidence,
} from './screen-contract/registry.mjs';
import { replay } from './screen-contract/replay.mjs';
import {
  REBUILT_PATH,
  pairTransfers,
  parseRebuilt,
  rebuiltRemovals,
} from './screen-contract/transfer.mjs';

const EVALUATE_PATH = 'scripts/ci/screen-contract/evaluate.mjs';
const DEFAULT_REPORT = 'tmp/screen-contract-check/report.json';
const FLAGS = new Set(['--enforcing', '--advisory', '--replay']);
const OPTIONS = new Set(['--base', '--head', '--check', '--report', '--repo']);

export function parseArgs(argv) {
  const args = { enforcing: false, replay: false, report: DEFAULT_REPORT };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--replay') args.replay = true;
    else if (FLAGS.has(flag)) args.enforcing = flag === '--enforcing';
    else if (OPTIONS.has(flag) && typeof argv[i + 1] === 'string' && argv[i + 1] !== '') {
      i += 1;
      args[flag.slice(2)] = argv[i];
    } else throw new ScanError(`unknown or incomplete argument ${flag}`);
  }
  if (!args.base) throw new ScanError('--base <sha> is required');
  if (args.check && args.enforcing) throw new ScanError('--check and --enforcing are exclusive');
  if (args.replay && (!args.head || args.check || args.enforcing))
    throw new ScanError('--replay needs --head and takes neither --check nor --enforcing');
  return args;
}

const invocationOf = args => {
  if (args.replay) return 'replay';
  if (args.check) return `check:${args.check}`;
  return args.enforcing ? 'enforcing' : 'advisory';
};

// The baselines, as WP-02's CLI reads them, over WP-02's functions (design §3 "WP-05's own code").
function readBaselines(repo, root, baseSha, scope) {
  const only = scope?.id ?? null;
  const baseText = showAt(repo, baseSha, BASELINE_PATH);
  let base = null;
  if (baseText === null) {
    if (showAt(repo, baseSha, SCRIPT_PATH) !== null)
      throw new ScanError('base has the scanner but no baseline');
  } else base = parseBaseline(baseText, 'base', CHECKS, { trustedBase: true, only });
  const headFile = path.join(root, BASELINE_PATH);
  const head = parseBaseline(
    fs.existsSync(headFile) ? fs.readFileSync(headFile, 'utf8') : '',
    'head',
    CHECKS,
    { only }
  );
  if (!scope && base && !Object.keys(base.checks).length)
    throw new ScanError('base baseline names no check');
  if (!scope && !Object.keys(head.checks).length)
    throw new ScanError('head baseline names no check');
  for (const check of scope ? [scope] : CHECKS) {
    const removed = removalRecorded(base, check.id);
    // A check new in this head is absent from a base whose scanner never ran it (WP-02's rule).
    const baseRan = (showAt(repo, baseSha, EVALUATE_PATH) ?? '').includes(`id: '${check.id}'`);
    if (base && !base.checks[check.id] && !removed && baseRan)
      throw new ScanError(`base baseline has no ${check.id}`);
    // An absent check is an error unless the owner's removal is recorded (design §5).
    if (!head.checks[check.id] && !removed && !removalRecorded(head, check.id))
      throw new ScanError(`head baseline has no ${check.id}`);
  }
  for (const id of removedChecks(base))
    if (
      (only === null || id === only) &&
      !base.checks[id] &&
      !head.checks[id] &&
      !removalRecorded(head, id)
    )
      throw new ScanError(`head baseline drops the recorded removal of ${id}`);
  return { base, head, bootstrap: base === null };
}

function readTrustedInputs(repo, root, baseSha) {
  const baseRegistryText = showAt(repo, baseSha, REGISTRY_PATH);
  const baseRebuiltText = showAt(repo, baseSha, REBUILT_PATH);
  const headRebuiltFile = path.join(root, REBUILT_PATH);
  return {
    baseRegistry:
      baseRegistryText === null ? null : parseRegistry(baseRegistryText, 'base consent registry'),
    baseRebuilt: baseRebuiltText === null ? null : parseRebuilt(baseRebuiltText, 'base'),
    rebuilt: parseRebuilt(
      fs.existsSync(headRebuiltFile) ? fs.readFileSync(headRebuiltFile, 'utf8') : '',
      'head'
    ),
  };
}

// CHK-22's findings and tamper from outside the lint: uses in files that do not exist, the
// registry against the trusted base; and its test evidence, whose failures are input errors.
function chk22Extra(root, files, inputs, base, head) {
  const registry = registryFor(root);
  const errors = testEvidence(root, registry, readLanes(root));
  if (errors.length) throw new ScanError(errors.join('; '));
  const present = new Set(files);
  const findings = [];
  for (const entry of registry.values())
    for (const use of entry.uses)
      if (!present.has(use.file))
        findings.push({
          id: `CHK-22|${use.file}|orphan-use|${entry.id}:${use.useId}`,
          file: use.file,
          line: 0,
          message: 'the registered use names a file that is not a screen here',
        });
  const isRendered = entry => present.has(entry.file);
  const tamper = registryTamper(inputs.baseRegistry, registry, base, head, isRendered);
  return { findings, tamper };
}

async function scan(args, repo, report) {
  report.base = ensureCommit(repo, args.base, 'base');
  report.head = args.head ? ensureCommit(repo, args.head, 'head') : headSha(repo);
  // CI and local runs both lint an extracted head tree (H2).
  const root = extractRevision(repo, report.head);
  try {
    const scope = args.check ? selectChecks(args, null, null)[0] : null;
    const { base, head, bootstrap } = readBaselines(repo, root, report.base, scope);
    report.bootstrap = bootstrap;
    const inputs = readTrustedInputs(repo, root, report.base);
    const { head: pairedHead, unpaired } = pairTransfers(base, head);
    const selected = selectChecks(args, base, head);
    const files = linted(root);
    const lint = await lintTree(root, files);
    const shas = { base: report.base, head: report.head };
    const removals = rebuiltRemovals(inputs.baseRebuilt, inputs.rebuilt, base, head);
    const results = [];
    for (const check of selected) {
      const extra = check.id === 'CHK-22' ? chk22Extra(root, files, inputs, base, head) : {};
      extra.tamper = [
        ...(extra.tamper ?? []),
        ...unpaired.filter(item => item.startsWith(`${check.id}#`)),
        ...removals,
      ];
      results.push(
        evaluateCheck(check, lint[check.id], {
          base,
          head,
          pairedHead,
          shas,
          rebuilt: inputs.rebuilt,
          extra,
        })
      );
    }
    report.changes = changeReport(repo, report.base, report.head, root, head, inputs.rebuilt);
    return results;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export async function run(argv, cwd = process.cwd()) {
  const report = {
    version: 1,
    status: 'ok',
    invocation: 'advisory',
    bootstrap: false,
    base: null,
    head: null,
    checks: Object.create(null),
    errors: [],
  };
  let args = { report: DEFAULT_REPORT };
  let results = [];
  try {
    args = parseArgs(argv);
    report.invocation = invocationOf(args);
    const repo = path.resolve(cwd, args.repo ?? '.');
    if (args.replay) {
      report.base = ensureCommit(repo, args.base, 'base');
      report.head = ensureCommit(repo, args.head, 'head');
      const outcome = await replay(repo, report.base, report.head);
      report.replay = outcome.summary;
      results = outcome.results;
    } else results = await scan(args, repo, report);
  } catch (error) {
    report.errors.push(
      error instanceof ScanError ? error.message : `scanner failure: ${error?.stack ?? error}`
    );
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
    for (const signal of report.changes?.signals ?? []) process.stdout.write(`${signal}\n`);
  } catch (error) {
    process.stderr.write(`screen-contract: report not written: ${error?.message ?? error}\n`);
    return 2;
  }
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = await run(process.argv.slice(2));
