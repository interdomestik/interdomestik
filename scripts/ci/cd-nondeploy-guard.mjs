import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MANIFEST_PATH = 'scripts/ci/cd-nondeploy-scope.json';
const GIT_BINARY = '/usr/bin/git';
const GITHUB_RUNS_URL =
  'https://api.github.com/repos/interdomestik/interdomestik/actions/workflows/cd.yml/runs';
const CONTROL_PATHS = new Set([
  '.github/workflows/cd.yml',
  'scripts/ci/cd-nondeploy-guard.mjs',
  MANIFEST_PATH,
]);
const SHA = /^[a-f0-9]{40}$/u;
const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const NONTERMINAL = new Set(['in_progress', 'pending', 'queued', 'requested', 'waiting']);
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
  if (
    paths.some(
      item =>
        typeof item !== 'string' ||
        !item ||
        item.startsWith('/') ||
        item.includes('..') ||
        /[*?[\]{}]/u.test(item)
    )
  )
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

export function assertNoCompetingRuns({ runs, runId, runAttempt, sha }) {
  const active = runs.filter(run => NONTERMINAL.has(run.status));
  const current = active.filter(run => Number(run.id) === runId);
  if (
    current.length !== 1 ||
    Number(current[0].run_attempt) !== runAttempt ||
    current[0].head_sha !== sha
  )
    fail('exact current run identity is not the sole matching receipt source');
  const competing = active.filter(run => Number(run.id) !== runId);
  if (competing.length) fail(`competing nonterminal run detected: ${competing[0].id}`);
}

export async function fetchRunPage({ token, status, page, fetchImpl = fetch }) {
  const url = new URL(GITHUB_RUNS_URL);
  url.search = new URLSearchParams({ status, per_page: '100', page: String(page) });
  const response = await fetchImpl(url, {
    redirect: 'error',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) fail(`GitHub run lookup failed with HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.workflow_runs)) fail('GitHub run lookup response is invalid');
  return body.workflow_runs;
}

export async function fetchNonterminalRuns({ token, fetchImpl = fetch }) {
  if (!token) fail('GitHub run lookup token is unavailable');
  const runs = new Map();
  for (const status of NONTERMINAL) {
    for (let page = 1; page <= 10; page += 1) {
      const pageRuns = await fetchRunPage({ token, status, page, fetchImpl });
      for (const run of pageRuns) runs.set(`${run.id}:${run.run_attempt}`, run);
      if (pageRuns.length < 100) break;
      if (page === 10) fail('GitHub run lookup pagination exceeded');
    }
  }
  return [...runs.values()];
}

export function buildScopeReceipt(input) {
  const { eventName, ref, before, after, sha, runId, runAttempt, decision, manifestSha256 } = input;
  return {
    version: 1,
    eventName,
    ref,
    before,
    after,
    sha,
    runId,
    runAttempt,
    deploy: decision.deploy,
    reason: decision.reason,
    changedFiles: decision.changedFiles,
    manifestSha256,
  };
}

export function buildFailureReceipt(input) {
  const { eventName, ref, before, after, sha, runId, runAttempt, error } = input;
  return {
    version: 1,
    eventName,
    ref,
    before,
    after,
    sha,
    runId,
    runAttempt,
    outcome: 'failure',
    deploy: null,
    error: error instanceof Error ? error.message : String(error),
  };
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
  const runDirectory = path.basename(String(runId));
  const receiptName = path.basename(`scope-${runAttempt}-${sha}.json`);
  const receiptPath = path.resolve(evidenceRoot, runDirectory, receiptName);
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
  writeOutput = stdoutWriter
) {
  const eventName = env.GITHUB_EVENT_NAME;
  const ref = env.GITHUB_REF;
  const sha = env.GITHUB_SHA;
  const before = env.CD_BEFORE || sha;
  const after = env.CD_AFTER || sha;
  const runId = Number(env.GITHUB_RUN_ID);
  const runAttempt = Number(env.GITHUB_RUN_ATTEMPT);
  if (
    !SHA.test(sha) ||
    !POSITIVE_INTEGER.test(env.GITHUB_RUN_ID) ||
    !POSITIVE_INTEGER.test(env.GITHUB_RUN_ATTEMPT) ||
    !Number.isSafeInteger(runId) ||
    runId <= 0 ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt <= 0
  )
    fail('event SHA, run ID, or attempt is invalid');
  const receiptPath = resolveReceiptPath(root, { sha, runId, runAttempt });

  let evidence;
  let decision;
  try {
    evidence = { manifestSha256: null, changedFiles: [], manifest: null };
    if (eventName === 'push' && ref === 'refs/heads/main')
      evidence = readPushEvidence({ root, before, after });
    decision = classifyScope({ eventName, ref, ...evidence });
    const runs = await fetchNonterminalRuns({ token: env.GITHUB_TOKEN, fetchImpl });
    assertNoCompetingRuns({ runs, runId, runAttempt, sha });
  } catch (error) {
    writeReceipt(
      receiptPath,
      buildFailureReceipt({ eventName, ref, before, after, sha, runId, runAttempt, error })
    );
    throw error;
  }

  const receipt = buildScopeReceipt({
    eventName,
    ref,
    before,
    after,
    sha,
    runId,
    runAttempt,
    decision,
    manifestSha256: evidence.manifestSha256,
  });
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
