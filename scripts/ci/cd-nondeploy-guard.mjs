import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MANIFEST_PATH = 'scripts/ci/cd-nondeploy-scope.json';
const GIT_BINARY = '/usr/bin/git';
const GITHUB_RUNS_URL =
  'https://api.github.com/repos/interdomestik/interdomestik/actions/workflows/cd.yml/runs';
const GITHUB_RUN_URL = 'https://api.github.com/repos/interdomestik/interdomestik/actions/runs';
const CONTROL_PATHS = new Set([
  '.github/workflows/cd.yml',
  'scripts/ci/cd-nondeploy-guard.mjs',
  MANIFEST_PATH,
]);
const SHA = /^[a-f0-9]{40}$/u;
const POSITIVE_INTEGER = /^[1-9]\d*$/u;
// An absolute path, a parent segment or a glob character.
const UNSAFE_PATH = /(?:^\/)|(?:\.\.)|(?:[*?[\]{}])/u;
const CURRENT_RUN_STATES = new Set(['in_progress', 'pending', 'queued', 'requested', 'waiting']);
const fail = message => {
  throw new Error(`CD non-deploy guard: ${message}`);
};
const digest = value => createHash('sha256').update(value).digest('hex');
export function parseScopeManifest(source) {
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    fail('parent manifest is not valid JSON');
  }
  if (!value || Array.isArray(value) || typeof value !== 'object')
    fail('manifest must be an object');
  if (
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .join(',') !== 'nonDeployPaths,version' ||
    value.version !== 1
  )
    fail('manifest schema or version is invalid');
  const paths = value.nonDeployPaths;
  if (!Array.isArray(paths) || paths.length === 0) fail('manifest path inventory is empty');
  if (paths.some(item => typeof item !== 'string' || !item || UNSAFE_PATH.test(item)))
    fail('manifest contains an unsafe path');
  if (
    new Set(paths).size !== paths.length ||
    paths.some((item, index) => index && paths[index - 1].localeCompare(item) >= 0)
  )
    fail('manifest paths must be unique and sorted');
  return { version: 1, nonDeployPaths: [...paths] };
}

export function classifyScope({ eventName, ref, manifest, changedFiles = [] }) {
  if (eventName === 'workflow_dispatch')
    return { deploy: true, reason: 'manual_dispatch', changedFiles: [] };
  if (eventName === 'push' && ref?.startsWith('refs/tags/v'))
    return { deploy: true, reason: 'version_tag', changedFiles: [] };
  if (eventName !== 'push' || ref !== 'refs/heads/main') fail('unsupported CD event or ref');
  if (!manifest || changedFiles.length === 0) fail('empty push range or missing parent manifest');
  const control = changedFiles.find(file => CONTROL_PATHS.has(file));
  if (control) fail(`control path changed: ${control}`);
  const known = new Set(manifest.nonDeployPaths);
  const deploy = changedFiles.some(file => !known.has(file));
  return { deploy, reason: deploy ? 'deploy_required' : 'known_program_only', changedFiles };
}

function git(root, args, options = {}) {
  try {
    return execFileSync(GIT_BINARY, args, { cwd: root, encoding: 'utf8', ...options });
  } catch {
    fail(`git lookup failed: ${args.join(' ')}`);
  }
}

export function readPushEvidence({ root = process.cwd(), before, after }) {
  if (!SHA.test(before) || !SHA.test(after) || before === after)
    fail('invalid push range identity');
  git(root, ['cat-file', '-e', `${before}^{commit}`]);
  git(root, ['cat-file', '-e', `${after}^{commit}`]);
  git(root, ['merge-base', '--is-ancestor', before, after]);
  let manifestSource;
  try {
    manifestSource = execFileSync(GIT_BINARY, ['show', `${before}:${MANIFEST_PATH}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    fail('parent manifest is unavailable');
  }
  const changed = git(root, [
    'diff',
    '--name-only',
    '--diff-filter=ACDMRTUXB',
    '-z',
    before,
    after,
  ]);
  const changedFiles = changed
    .split('\0')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return {
    manifest: parseScopeManifest(manifestSource),
    manifestSha256: digest(manifestSource),
    changedFiles,
  };
}

export function assertNoCompetingRuns({ runs, currentRun, runId, runAttempt, sha }) {
  if (
    Number(currentRun?.id) !== runId ||
    Number(currentRun?.run_attempt) !== runAttempt ||
    currentRun?.head_sha !== sha ||
    !CURRENT_RUN_STATES.has(currentRun?.status)
  )
    fail('exact current run identity is invalid');
  const staleCurrent = runs.some(
    run =>
      Number(run.id) === runId && (Number(run.run_attempt) !== runAttempt || run.head_sha !== sha)
  );
  if (staleCurrent) fail('run list disagrees with exact current run identity');
  const competing = runs.filter(run => Number(run.id) !== runId);
  if (competing.length) fail(`competing nonterminal run detected: ${competing[0].id}`);
}

function isNonterminal(run) {
  if (!run || typeof run !== 'object' || typeof run.status !== 'string' || !run.status)
    fail('GitHub run lookup response has an invalid status');
  return run.status !== 'completed';
}

// GitHub cancels a run 35 days after it starts and allows reruns for 30 days, so no live run was
// created more than 65 days ago (plus a day). Filtered listings stop at 1,000 results.
const RUN_WINDOW_MS = 66 * 86_400_000;
const RESULT_CAP = 1000;
const PAGE_SIZE = 100;
const GITHUB_HEADERS = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
/** One clock and deadline (8 min, inside the 10 min scope job) for every GitHub request. */
export function createLookupBudget({ now = Date.now, sleep = pause, random = Math.random } = {}) {
  return { now, sleep, random, deadline: now() + 480_000 };
}
// Only a missing response or a 5xx is transient; every other failure fails closed at once.
const retryDelay = (response, attempt, budget) =>
  !response || response.status >= 500
    ? 1000 * 2 ** (attempt - 1) + Math.floor(budget.random() * 250)
    : null;
async function getJson(url, label, { token, fetchImpl, budget }, attempt = 1) {
  const remaining = budget.deadline - budget.now();
  if (remaining <= 0) fail(`${label} exceeded its time budget`);
  let response;
  let failure;
  try {
    const signal = AbortSignal.timeout(Math.min(20_000, remaining));
    const headers = { ...GITHUB_HEADERS, authorization: `Bearer ${token}` };
    response = await fetchImpl(url, { redirect: 'error', signal, headers });
    if (response.ok) return await response.json();
    failure = `${label} failed with HTTP ${response.status}`;
  } catch (error) {
    failure = `${label} failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  const delay = retryDelay(response?.ok ? undefined : response, attempt, budget);
  if (delay === null || attempt >= 3 || budget.now() + delay >= budget.deadline) fail(failure);
  await budget.sleep(delay);
  return getJson(url, label, { token, fetchImpl, budget }, attempt + 1);
}

export async function fetchCurrentRun({ token, runId, fetchImpl = fetch, budget }) {
  if (!token) fail('GitHub run lookup token is unavailable');
  const lookup = { token, fetchImpl, budget };
  const run = await getJson(`${GITHUB_RUN_URL}/${runId}`, 'GitHub current run lookup', lookup);
  if (!run || Array.isArray(run) || typeof run !== 'object')
    fail('GitHub current run lookup response is invalid');
  return run;
}

export async function fetchRunPage({ token, page, createdSince, fetchImpl = fetch, budget }) {
  const url = new URL(GITHUB_RUNS_URL);
  const query = { created: `>=${createdSince}`, per_page: String(PAGE_SIZE), page: String(page) };
  url.search = new URLSearchParams(query);
  const body = await getJson(url, 'GitHub run lookup', { token, fetchImpl, budget });
  if (!Array.isArray(body?.workflow_runs) || !Number.isSafeInteger(body.total_count))
    fail('GitHub run lookup response is invalid');
  return { runs: body.workflow_runs, totalCount: body.total_count };
}

export async function fetchNonterminalRuns({ token, fetchImpl = fetch, budget }) {
  if (!token) fail('GitHub run lookup token is unavailable');
  // Status-filtered lists can omit a live run, so pages are classified locally. A frozen cutoff
  // and an unchanged total show every page read the same set; a run arriving mid-scan fails.
  const createdSince = new Date(budget.now() - RUN_WINDOW_MS).toISOString();
  const runs = new Map();
  const seen = new Set();
  let expected;
  async function collect(page) {
    const result = await fetchRunPage({ token, page, createdSince, fetchImpl, budget });
    expected ??= result.totalCount;
    if (result.totalCount !== expected) fail('GitHub run lookup changed while paging');
    if (expected >= RESULT_CAP) fail('GitHub run lookup window reached the result cap');
    for (const run of result.runs) {
      if (!Number.isSafeInteger(Number(run?.id)) || Number(run.id) <= 0)
        fail('GitHub run lookup response has an invalid run ID');
      seen.add(Number(run.id));
      if (isNonterminal(run)) runs.set(`${run.id}:${run.run_attempt}`, run);
    }
    if (result.runs.length < PAGE_SIZE) return;
    if (page * PAGE_SIZE >= RESULT_CAP) fail('GitHub run lookup pagination exceeded');
    await collect(page + 1);
  }
  await collect(1);
  if (seen.size < expected) fail('GitHub run lookup returned fewer runs than it reported');
  return [...runs.values()];
}

function receiptIdentity({ eventName, ref, before, after, sha, runId, runAttempt }) {
  return { eventName, ref, before, after, sha, runId, runAttempt };
}
export function buildScopeReceipt(input) {
  const { deploy, reason, changedFiles } = input.decision;
  const { manifestSha256 } = input;
  return { version: 1, ...receiptIdentity(input), deploy, reason, changedFiles, manifestSha256 };
}
export function buildFailureReceipt(input) {
  const error = input.error instanceof Error ? input.error.message : String(input.error);
  return { version: 1, ...receiptIdentity(input), outcome: 'failure', deploy: null, error };
}
function writeReceipt(receiptPath, receipt) {
  const serialized = JSON.stringify(receipt);
  const bytes = `${serialized}\n`;
  fs.writeFileSync(receiptPath, bytes, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { bytes, serialized, sha256: digest(bytes) };
}
function resolveReceiptPath(root, { sha, runId, runAttempt }) {
  const worktreeRoot = path.resolve(root);
  const evidenceRoot = path.resolve(worktreeRoot, 'tmp/cd-evidence');
  const receiptName = path.basename(`scope-${runAttempt}-${sha}.json`);
  const receiptPath = path.resolve(evidenceRoot, path.basename(String(runId)), receiptName);
  const relative = path.relative(evidenceRoot, receiptPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    fail('scope receipt path escaped its fixed evidence root');
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true, mode: 0o700 });
  return receiptPath;
}

const stdoutWriter = output => process.stdout.write(output);

export async function runGuard(
  env = process.env,
  fetchImpl = fetch,
  root = process.cwd(),
  writeOutput = stdoutWriter,
  budget = createLookupBudget()
) {
  const { GITHUB_EVENT_NAME: eventName, GITHUB_REF: ref, GITHUB_SHA: sha } = env;
  const before = env.CD_BEFORE || sha;
  const after = env.CD_AFTER || sha;
  const runId = Number(env.GITHUB_RUN_ID);
  const runAttempt = Number(env.GITHUB_RUN_ATTEMPT);
  // POSITIVE_INTEGER rules out zero, signs and fractions; the safe-integer check bounds the rest.
  const ids = [env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT];
  if (!SHA.test(sha) || !ids.every(id => POSITIVE_INTEGER.test(id) && Number.isSafeInteger(+id)))
    fail('event SHA, run ID, or attempt is invalid');
  const identity = { eventName, ref, before, after, sha, runId, runAttempt };
  const receiptPath = resolveReceiptPath(root, { sha, runId, runAttempt });

  let evidence = { manifestSha256: null, changedFiles: [], manifest: null };
  let decision;
  try {
    if (eventName === 'push' && ref === 'refs/heads/main')
      evidence = readPushEvidence({ root, before, after });
    decision = classifyScope({ eventName, ref, ...evidence });
    const currentRun = await fetchCurrentRun({ token: env.GITHUB_TOKEN, runId, fetchImpl, budget });
    const runs = await fetchNonterminalRuns({ token: env.GITHUB_TOKEN, fetchImpl, budget });
    assertNoCompetingRuns({ runs, currentRun, runId, runAttempt, sha });
  } catch (error) {
    writeReceipt(receiptPath, buildFailureReceipt({ ...identity, error }));
    throw error;
  }

  const receipt = buildScopeReceipt({ ...identity, decision, ...evidence });
  const written = writeReceipt(receiptPath, receipt);
  writeOutput(
    `deploy=${decision.deploy}\nreceipt=${written.serialized}\nreceipt_sha256=${written.sha256}\n`
  );
  return receipt;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    await runGuard();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
