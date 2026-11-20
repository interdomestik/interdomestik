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
  evaluateRetired,
  exitCode,
  selectChecks,
  selectRetired,
  toolVersions,
} from './screen-contract/evaluate.mjs';
import { EXPECTS, emptyChecks, lintTree, linted } from './screen-contract/lint.mjs';
import {
  REGISTRY_PATH,
  parseRegistry,
  readLanes,
  registryFor,
  registryTamper,
  testEvidence,
} from './screen-contract/registry.mjs';
import { assertNoLinks, readInside } from './screen-contract/paths.mjs';
import { preAdoptionBase, replaySummary, synthesizeInputs } from './screen-contract/replay.mjs';
import { roleOf } from './screen-contract/roles.mjs';
import {
  REBUILT_PATH,
  pairTransfers,
  parseRebuilt,
  rebuiltDeclarationErrors,
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

function readBaseBaseline(repo, baseSha, only, synthesized) {
  if (synthesized)
    return parseBaseline(JSON.stringify(synthesized), 'base', CHECKS, { trustedBase: true, only });
  const baseText = showAt(repo, baseSha, BASELINE_PATH);
  if (baseText !== null)
    return parseBaseline(baseText, 'base', CHECKS, { trustedBase: true, only });
  if (showAt(repo, baseSha, SCRIPT_PATH) !== null)
    throw new ScanError('base has the scanner but no baseline');
  return null;
}

// A pre-adoption head (replay only) has no baseline; it is judged against its base's synthesized one.
function readHeadBaseline(root, only, synthesized) {
  const text = readInside(root, BASELINE_PATH) ?? (synthesized ? JSON.stringify(synthesized) : '');
  return parseBaseline(text, 'head', CHECKS, { only });
}

function assertChecksPresent(repo, baseSha, { base, head }, scope) {
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
}

function assertRemovalsKept({ base, head }, only) {
  for (const id of removedChecks(base))
    if (
      (only === null || id === only) &&
      !base.checks[id] &&
      !head.checks[id] &&
      !removalRecorded(head, id)
    )
      throw new ScanError(`head baseline drops the recorded removal of ${id}`);
}

// The baselines, as WP-02's CLI reads them, over WP-02's functions (design §3 "WP-05's own code").
function readBaselines(repo, root, baseSha, scope, synthesized = null) {
  const only = scope?.id ?? null;
  const base = readBaseBaseline(repo, baseSha, only, synthesized);
  const head = readHeadBaseline(root, only, synthesized);
  assertChecksPresent(repo, baseSha, { base, head }, scope);
  assertRemovalsKept({ base, head }, only);
  return {
    base,
    head,
    bootstrap: base === null,
    authority: rebuiltAuthority(repo, root, baseSha, scope, { base, head }),
  };
}

// The owner's `rebuilt` exceptions. A scoped run parses each baseline with that check's exceptions
// only, so the rebuilt ones are read on their own (r1 B9); WP-02's parser validates them.
function rebuiltAuthority(repo, root, baseSha, scope, { base, head }) {
  if (!scope) return { base, head };
  const only = { only: 'rebuilt' };
  const baseText = base ? showAt(repo, baseSha, BASELINE_PATH) : null;
  return {
    base:
      baseText === null
        ? base
        : parseBaseline(baseText, 'base', CHECKS, { trustedBase: true, ...only }),
    head: parseBaseline(readInside(root, BASELINE_PATH) ?? '', 'head', CHECKS, only),
  };
}

// The base's registry and rebuilt list come from the trusted base commit, or, for a replay of a
// pre-adoption pair, from its extracted and synthesized base tree.
function readTrustedInputs(repo, root, baseSha, baseRoot = null) {
  const atBase = rel => (baseRoot ? readInside(baseRoot, rel) : showAt(repo, baseSha, rel));
  const baseRegistryText = atBase(REGISTRY_PATH);
  const baseRebuiltText = atBase(REBUILT_PATH);
  return {
    baseRegistry:
      baseRegistryText === null ? null : parseRegistry(baseRegistryText, 'base consent registry'),
    baseRebuilt: baseRebuiltText === null ? null : parseRebuilt(baseRebuiltText, 'base'),
    rebuilt: parseRebuilt(readInside(root, REBUILT_PATH) ?? '', 'head'),
  };
}

// CHK-22's findings and tamper from outside the lint: uses in files that do not exist, the
// registry against the trusted base; and its test evidence, whose failures are input errors.
function chk22Extra(root, files, inputs, base, head) {
  const registry = registryFor(root);
  const errors = testEvidence(root, registry, readLanes(root));
  if (errors.length) throw new ScanError(errors.join('; '));
  // The files CHK-22 visits, not every linted file: a use naming a support file the rule never
  // reads is an orphan (r1 H3).
  const present = new Set(files.filter(file => EXPECTS['CHK-22'](roleOf(file), file)));
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

function judge(args, repo, root, report, { base, head, authority, inputs, lint, files }) {
  const declared = rebuiltDeclarationErrors(inputs.baseRebuilt, inputs.rebuilt, files, roleOf);
  if (declared.length) throw new ScanError(declared.join('; '));
  const { head: pairedHead, unpaired } = pairTransfers(base, head);
  const shas = { base: report.base, head: report.head };
  const removals = rebuiltRemovals(
    inputs.baseRebuilt,
    inputs.rebuilt,
    authority.base,
    authority.head
  );
  // A check the trusted base names and this scanner retired is judged as a removal (r1 B10).
  const retired = selectRetired(args, base).map(id => evaluateRetired(id, base, head, shas));
  const current = selectChecks(args, base, head).map(check => {
    const extra = check.id === 'CHK-22' ? chk22Extra(root, files, inputs, base, head) : {};
    extra.tamper = [
      ...(extra.tamper ?? []),
      ...unpaired.filter(item => item.startsWith(`${check.id}#`)),
      ...removals,
    ];
    return evaluateCheck(check, lint[check.id], {
      base,
      head,
      pairedHead,
      shas,
      rebuilt: inputs.rebuilt,
      extra,
    });
  });
  return [...current, ...retired];
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
    if (replay)
      report.replay = replaySummary({
        takenAt: pre ? pre.baseline.takenAt : (base?.takenAt ?? null),
        synthesized: replay.synthesized,
        baseLint: pre?.lint ?? null,
        results,
        empty,
        versions: toolVersions(),
      });
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
