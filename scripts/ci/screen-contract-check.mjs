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
//
// Must be resolved before any flip PR (named limits of the advisory checks; each says how it errs):
// - Lanes (CHK-22 test evidence) are read against a denylist of unmodelled settings; an allowlist
//   of modelled ones comes with the flip. Errs toward a missed finding: a test the lane does not
//   run (a wrapper call, `typecheck.only`, `respectGitIgnore`) can be credited.
// - A CHK-22 submission origin under `apps/web/src/actions/` or `apps/web/src/app/api/` is
//   recognised by its directory (the action or handler role), and 216 of the 287 non-test action
//   files have no `'use server'` (2026-11-20). Errs toward a missed finding: a helper that runs in
//   the browser can be credited as the server submission.
// - A CHK-22 entry with an `exportName` and a use is judged at its JSX renders only. A route
//   module that renders the same component itself (Next renders it with no JSX caller) is not
//   judged there. Errs toward a missed finding.
// - CHK-22 skip detection is heuristic: it sees the modifiers of `SKIPPED_RE` (registry.mjs) and
//   a renamed test-function import from a runner or a repository-local module. A test written to
//   hide that it is skipped may still be credited (for example Vitest `skipIf`/`runIf`, an `.only`
//   elsewhere in the file, an alias by assignment). Errs toward a missed finding. Before any flip
//   PR, skip detection is replaced by runner evidence (the runner's own report of what ran) or by
//   a dedicated review.
// - Module resolution differs from TypeScript in the cases listed in `specifiers.mjs` (sibling
//   `.js`/`.ts`, `.cjs`/`.mjs`/`.jsx` substitution, `..` after `*` in `@/*`, declaration and
//   `typesVersions` edges). Errs mostly toward a missed finding (an edge not followed); where it
//   picks another file than TypeScript, also toward a false one.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ScanError } from './server-mutation/ast.mjs';
import { ensureCommit, extractRevision, headSha, showAt } from './server-mutation/git.mjs';
import { annotate, writeReport } from './server-mutation/output.mjs';
import { changeReport, signalLine } from './screen-contract/changes.mjs';
import { readBaselines, readTrustedInputs } from './screen-contract/cli-baselines.mjs';
import { judge, orphanUses } from './screen-contract/cli-judge.mjs';
import {
  BASELINE_PATH,
  SCRIPT_PATH,
  allEnforcingErrors,
  exitCode,
  selectChecks,
  toolVersions,
} from './screen-contract/evaluate.mjs';
import { emptyChecks, lintTree, linted } from './screen-contract/lint.mjs';
import { assertNoLinks, readInside } from './screen-contract/paths.mjs';
import { registryFor } from './screen-contract/registry.mjs';
import { candidateJudgment } from './screen-contract/replay-candidate.mjs';
import {
  candidateBaseline,
  preAdoptionBase,
  replaySummary,
  synthesizeInputs,
} from './screen-contract/replay.mjs';

const DEFAULT_REPORT = 'tmp/screen-contract-check/report.json';
const FLAGS = new Set(['--enforcing', '--advisory', '--replay', '--require-all-enforcing']);
const OPTIONS = new Set(['--base', '--head', '--check', '--report', '--repo']);

export function parseArgs(argv) {
  const args = {
    enforcing: false,
    replay: false,
    requireAllEnforcing: false,
    report: DEFAULT_REPORT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--replay') args.replay = true;
    else if (flag === '--require-all-enforcing') args.requireAllEnforcing = true;
    else if (FLAGS.has(flag)) args.enforcing = flag === '--enforcing';
    else if (OPTIONS.has(flag) && typeof argv[i + 1] === 'string' && argv[i + 1] !== '') {
      i += 1;
      args[flag.slice(2)] = argv[i];
    } else throw new ScanError(`unknown or incomplete argument ${flag}`);
  }
  if (!args.base) throw new ScanError('--base <sha> is required');
  if (args.check && args.enforcing) throw new ScanError('--check and --enforcing are exclusive');
  if (args.requireAllEnforcing && !args.enforcing)
    throw new ScanError('--require-all-enforcing needs --enforcing');
  if (args.replay && (!args.head || args.check || args.enforcing))
    throw new ScanError('--replay needs --head and takes neither --check nor --enforcing');
  return args;
}

const invocationOf = args => {
  if (args.replay) return 'replay';
  if (args.check) return `check:${args.check}`;
  return args.enforcing ? 'enforcing' : 'advisory';
};

// A replay of a pair that predates adoption (neither side has the baseline) synthesizes the base
// (design §7); any other pair is judged exactly as production judges it.
// Adoption is decided before anything is written (r2 B1): an adopted pair (either side has the
// baseline) is judged exactly as production judges it, with nothing synthesized; a base that has
// the scanner but no baseline is the production error. Only a pair that predates adoption gets
// synthesized inputs on both sides.
async function replayBase(repo, report, root, cleanup) {
  const replay = { synthesized: { base: [], head: [] }, pre: null };
  const adopted =
    showAt(repo, report.base, BASELINE_PATH) !== null || readInside(root, BASELINE_PATH) !== null;
  if (adopted) return replay;
  if (showAt(repo, report.base, SCRIPT_PATH) !== null)
    throw new ScanError('base has the scanner but no baseline');
  replay.synthesized.head = synthesizeInputs(root);
  const baseRoot = extractRevision(repo, report.base);
  cleanup.push(baseRoot);
  assertNoLinks(baseRoot);
  replay.pre = { ...(await preAdoptionBase(baseRoot, report.base)), root: baseRoot };
  replay.synthesized.base = replay.pre.synthesized;
  return replay;
}

// The candidate judgment of a replay pair (§4 of the flip plan): the parent tree is scanned with the
// candidate scanner too (a pre-adoption base already was), and the pair is judged as PR-B's
// required workflow would judge it.
async function replayCandidate(repo, report, root, cleanup, { pre, real, inputs, lint, files, results }) {
  let baseRoot = pre?.root ?? null;
  if (!baseRoot) {
    baseRoot = extractRevision(repo, report.base);
    cleanup.push(baseRoot);
    assertNoLinks(baseRoot);
  }
  const baseFiles = linted(baseRoot);
  const baseLint = pre?.lint ?? (await lintTree(baseRoot, baseFiles));
  const headRegistry = registryFor(root);
  return candidateJudgment({
    candidate: candidateBaseline(),
    baseLint,
    headLint: lint,
    baseReal: real.base,
    headReal: real.head,
    baseExtra: { 'CHK-22': orphanUses(baseFiles, registryFor(baseRoot)).findings },
    headExtra: { 'CHK-22': orphanUses(files, headRegistry).findings },
    headRegistry,
    rebuilt: inputs.rebuilt,
    tamper: Object.fromEntries(results.map(r => [r.id, r.tamper])),
    shas: { base: report.base, head: report.head },
  });
}

async function scan(args, repo, report) {
  report.base = ensureCommit(repo, args.base, 'base');
  report.head = args.head ? ensureCommit(repo, args.head, 'head') : headSha(repo);
  // CI and local runs both lint an extracted head tree (H2).
  const root = extractRevision(repo, report.head);
  const cleanup = [root];
  try {
    assertNoLinks(root);
    const replay = args.replay ? await replayBase(repo, report, root, cleanup) : null;
    const pre = replay?.pre ?? null;
    const scope = args.check ? selectChecks(args, null, null)[0] : null;
    const { base, head, bootstrap, authority } = pre
      ? readBaselines(repo, root, report.base, scope, pre.baseline)
      : readBaselines(repo, root, report.base, scope);
    report.bootstrap = bootstrap;
    const inputs = readTrustedInputs(repo, root, report.base, pre?.root ?? null);
    const files = linted(root);
    const lint = await lintTree(root, files);
    // A check with nothing to examine is an input error, except on the head of a historical
    // (pre-adoption) replay pair, where it is recorded for adjudication (§7, r3 B9).
    const empty = emptyChecks(lint);
    if (empty.length && !pre) throw new ScanError(`no expected file for ${empty.join(', ')}`);
    const results = judge(args, repo, root, report, {
      base,
      head,
      authority,
      inputs,
      lint,
      files,
    });
    report.changes = changeReport(repo, report.base, report.head, root, head, inputs.rebuilt);
    if (replay) {
      report.replay = replaySummary({
        takenAt: pre ? pre.baseline.takenAt : (base?.takenAt ?? null),
        synthesized: replay.synthesized,
        baseLint: pre?.lint ?? null,
        results,
        empty,
        versions: toolVersions(),
      });
      const real = { base: pre ? null : base, head: pre ? null : head };
      report.replay.candidateJudgment = await replayCandidate(repo, report, root, cleanup, {
        pre,
        real,
        inputs,
        lint,
        files,
        results,
      });
    }
    return results;
  } finally {
    for (const dir of cleanup) fs.rmSync(dir, { recursive: true, force: true });
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
    results = await scan(args, repo, report);
    if (args.requireAllEnforcing) {
      const missing = allEnforcingErrors(results);
      if (missing.length) throw new ScanError(missing.join('; '));
    }
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
    for (const signal of report.changes?.signals ?? [])
      process.stdout.write(`${signalLine(signal)}\n`);
  } catch (error) {
    process.stderr.write(`screen-contract: report not written: ${error?.message ?? error}\n`);
    return 2;
  }
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = await run(process.argv.slice(2));
