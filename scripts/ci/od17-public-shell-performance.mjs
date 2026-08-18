import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'interdomestik/interdomestik';
const BRANCH = 'codex/ida-t115-od17-performance-proof';
const WORKFLOW = '.github/workflows/od17-preview-canary.yml';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const SHA = /^[0-9a-f]{40}$/u,
  ARTIFACT_DIGEST = /^sha256:[0-9a-f]+$/u;
const PREVIEW = /^interdomestik-web-[a-z0-9]{9}-ecohub\.vercel\.app$/u;
const sha256 = body => createHash('sha256').update(body).digest('hex');
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const fail = message => {
  throw new Error(`OD17_FOUNDATION_IDENTITY_INVALID: ${message}`);
};
export const isMainModule = (argv1, moduleUrl) =>
  Boolean(argv1 && pathToFileURL(argv1).href === moduleUrl);

// prettier-ignore
function exactHead(pull, sha) { const head = pull?.head; return pull?.state === 'open' && head?.ref === BRANCH && head?.sha === sha && head?.repo?.full_name === REPOSITORY && head?.repo?.fork === false; }
// prettier-ignore
export function assertFoundationCanaryIdentity({ repository, workflowRef, pullRequest, expectedHeadSha }) { if (repository !== REPOSITORY || workflowRef !== 'refs/heads/main' || !SHA.test(expectedHeadSha ?? '') || !exactHead(pullRequest, expectedHeadSha)) fail('foundation_identity'); }
export function parseTrustedPreviewUrl(value) {
  if (typeof value !== 'string') fail('preview_url');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !PREVIEW.test(url.hostname)
  )
    fail('preview_url');
  return url;
}
// prettier-ignore
export function collectRemoteJavaScriptUrls({ previewOrigin, pageUrls, lighthouseRequests }) {
  const origin = parseTrustedPreviewUrl(previewOrigin).origin, urls = new Set();
  const add = (value, extensionless = false) => { const url = new URL(value); if (url.origin === origin && (extensionless || url.pathname.endsWith('.js'))) urls.add(url.toString()); };
  for (const url of pageUrls ?? []) add(url);
  for (const request of lighthouseRequests ?? []) if (/javascript/u.test(request?.mimeType ?? '') || new URL(request.url).pathname.endsWith('.js')) add(request.url, /javascript/u.test(request?.mimeType ?? ''));
  return [...urls].sort();
}
// prettier-ignore
export function assertCanonicalLocaleUrl({ requestedUrl, finalUrl }) { const requested = new URL(requestedUrl), final = new URL(finalUrl); if (requested.origin !== final.origin || requested.pathname !== final.pathname) fail('main_document_redirect'); }
// prettier-ignore
export function selectExactPreparation({ run, artifacts, expectedHeadSha, pullNumber }) {
  const runId = Number(run?.id), pull = Number(pullNumber);
  const exact = positive(runId) && positive(pull) && positive(run?.run_attempt) && run?.event === 'pull_request' && run?.status === 'completed' && run?.conclusion === 'success' && run?.head_sha === expectedHeadSha && run?.head_branch === BRANCH && run?.path === WORKFLOW && run?.repository?.full_name === REPOSITORY && run?.head_repository?.full_name === REPOSITORY && run?.pull_requests?.some(item => item.number === pull);
  if (!exact) fail('preparation_run');
  const matches = (artifacts ?? []).filter(item => item?.name === `od17-local-${expectedHeadSha}` && item?.expired === false && item?.workflow_run?.id === runId && positive(item?.id) && ARTIFACT_DIGEST.test(item?.digest ?? ''));
  if (matches.length !== 1) fail('preparation_artifact');
  return { runId, runAttempt: run.run_attempt, artifactId: matches[0].id, artifactDigest: matches[0].digest };
}
// prettier-ignore
export function selectExactCanary({ runs, artifactsByRun, expectedHeadSha, expectedTrustedMainSha }) {
  if (!Array.isArray(runs) || !SHA.test(expectedHeadSha ?? '') || !SHA.test(expectedTrustedMainSha ?? '')) fail('canary_runs');
  const matches = runs.flatMap(run => {
    const exact = positive(run?.id) && positive(run?.run_attempt) && run?.event === 'workflow_dispatch' && run?.status === 'completed' && run?.conclusion === 'success' && run?.head_branch === 'main' && run?.head_sha === expectedTrustedMainSha && run?.path === WORKFLOW;
    if (!exact) return [];
    return (artifactsByRun.get(run.id) ?? []).filter(artifact => artifact?.name === `od17-canary-${expectedHeadSha}` && artifact?.expired === false && artifact?.workflow_run?.id === run.id && positive(artifact?.id) && ARTIFACT_DIGEST.test(artifact?.digest ?? '')).map(artifact => ({ runId: run.id, runAttempt: run.run_attempt, artifactId: artifact.id, artifactDigest: artifact.digest }));
  });
  if (matches.length !== 1) fail('canary_ambiguity'); return matches[0];
}
// prettier-ignore
export async function waitForChrome() { for (let attempt = 0; attempt < 50; attempt += 1) { try { const response = await fetch('http://127.0.0.1:9222/json/version'); if (response.ok) return response.json(); } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } fail('chrome_unavailable'); }
export function buildTrustedPreviewRequest({ previewUrl, expectedPreviewUrl, oidcToken }) {
  if (typeof oidcToken !== 'string' || !oidcToken) fail('missing_oidc_token');
  const url = parseTrustedPreviewUrl(previewUrl),
    expected = parseTrustedPreviewUrl(expectedPreviewUrl);
  if (url.toString() !== expected.toString()) fail('preview_url_mismatch');
  return { url: url.toString(), headers: { 'x-vercel-trusted-oidc-idp-token': oidcToken } };
}
// prettier-ignore
export function selectExactPreviewDeployment({ deployments, expectedHeadSha }) {
  if (!Array.isArray(deployments) || !SHA.test(expectedHeadSha ?? '')) fail('deployments');
  const matches = deployments.filter(item => item?.sha === expectedHeadSha && item?.ref === BRANCH && item?.performed_via_github_app?.slug === 'vercel' && item?.environment === 'Preview' && item?.production_environment === false && item?.latest_status?.state === 'success' && positive(item?.id) && positive(item?.latest_status?.id));
  if (matches.length !== 1) fail('deployment_ambiguity'); const item = matches[0], url = parseTrustedPreviewUrl(item.latest_status.environment_url);
  if (url.pathname !== '/') fail('deployment_url');
  return { deploymentId: item.id, statusId: item.latest_status.id, sha: item.sha, environment: item.environment, productionEnvironment: false, ref: item.ref, url: url.toString() };
}
// prettier-ignore
async function api(endpoint, token) { const response = await fetch(`${API}${endpoint}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } }); if (!response.ok) fail(`github_api_${response.status}`); return response.json(); }
// prettier-ignore
const download = (runId, name, target) => execFileSync('gh', ['run', 'download', String(runId), '-R', REPOSITORY, '-n', name, '-D', target], { stdio: 'inherit' });
async function writeVerdict(root, verdict) {
  const serialized = `${JSON.stringify(verdict, null, 2)}\n`,
    digest = sha256(serialized);
  await Promise.all([
    fs.writeFile(path.join(root, 'verdict.json'), serialized, { mode: 0o600 }),
    fs.writeFile(path.join(root, 'verdict.sha256'), `${digest}\n`, { mode: 0o600 }),
  ]);
  return digest;
}
// prettier-ignore
async function verifyProof() {
  const { GH_TOKEN: token, EXPECTED_HEAD_SHA: head, EXPECTED_TRUSTED_MAIN_SHA: main, PULL_NUMBER: pull } = process.env;
  await fs.mkdir('tmp/od17-verdict', { recursive: true }); const root = await fs.mkdtemp(path.resolve('tmp/od17-verdict/run-'));
  try {
    if (!token || !SHA.test(head ?? '') || !SHA.test(main ?? '') || !positive(pull)) fail('verify_env');
    if (!exactHead(await api(`/pulls/${Number(pull)}`, token), head)) fail('pull_request_head');
    const response = await api('/actions/workflows/od17-preview-canary.yml/runs?branch=main&event=workflow_dispatch&status=completed&per_page=100', token);
    const eligible = response.workflow_runs.filter(run => run.head_sha === main && run.conclusion === 'success');
    const pairs = await Promise.all(eligible.map(async run => [run.id, (await api(`/actions/runs/${run.id}/artifacts?per_page=100`, token)).artifacts]));
    const canary = selectExactCanary({ runs: eligible, artifactsByRun: new Map(pairs), expectedHeadSha: head, expectedTrustedMainSha: main });
    const evidenceDir = path.join(root, 'evidence'); download(canary.runId, `od17-canary-${head}`, evidenceDir);
    const evidence = JSON.parse(await fs.readFile(path.join(evidenceDir, 'evidence.json'), 'utf8'));
    if (!positive(evidence.preparationRunId)) fail('preparation_run_id');
    const preparationRun = await api(`/actions/runs/${Number(evidence.preparationRunId)}`, token);
    const preparationArtifacts = (await api(`/actions/runs/${Number(evidence.preparationRunId)}/artifacts?per_page=100`, token)).artifacts;
    const preparation = selectExactPreparation({ run: preparationRun, artifacts: preparationArtifacts, expectedHeadSha: head, pullNumber: pull });
    const localDir = path.join(root, 'local'); download(preparation.runId, `od17-local-${head}`, localDir);
    const { verifyOd17Files } = await import('../../apps/web/scripts/check-size.mjs');
    const result = await verifyOd17Files({ localDir, evidenceDir, expectedHeadSha: head, expectedTrustedMainSha: main, pullNumber: pull, canary, preparation });
    const observations = result.evidence.observations?.map(({ locale, score, gzipBytes, ttfbMs }) => ({ locale, score, gzipBytes, ttfbMs }));
    const verdict = { schemaVersion: 1, headSha: head, trustedMainSha: main, canary, preparation, verdict: result.verdict, observations };
    const verdictSha256 = await writeVerdict(root, verdict); console.log(JSON.stringify({ ...verdict, verdictSha256 }));
    if (result.verdict !== 'pass') fail(result.verdict);
  } catch (error) {
    try { await fs.stat(path.join(root, 'verdict.json')); } catch { await writeVerdict(root, { schemaVersion: 1, headSha: SHA.test(head ?? '') ? head : null, trustedMainSha: SHA.test(main ?? '') ? main : null, verdict: 'measurement_capability_missing', errorCode: 'OD17_PROOF_FAILED' }); }
    throw error;
  }
}
// prettier-ignore
async function resolveCollector() {
  const { GH_TOKEN: token, GITHUB_REPOSITORY: repository, EXPECTED_HEAD_SHA: head, PREPARATION_RUN_ID: runId, PULL_NUMBER: pull } = process.env;
  if (!token || repository !== REPOSITORY || !SHA.test(head ?? '') || !positive(runId) || !positive(pull)) fail('collector_env');
  const pullRequest = await api(`/pulls/${Number(pull)}`, token); assertFoundationCanaryIdentity({ repository, workflowRef: process.env.GITHUB_REF, pullRequest, expectedHeadSha: head });
  const run = await api(`/actions/runs/${Number(runId)}`, token), artifacts = (await api(`/actions/runs/${Number(runId)}/artifacts?per_page=100`, token)).artifacts;
  const preparation = selectExactPreparation({ run, artifacts, expectedHeadSha: head, pullNumber: pull });
  const query = new URLSearchParams({ sha: head, ref: BRANCH, environment: 'Preview', per_page: '100' });
  const deployments = await api(`/deployments?${query}`, token); for (const item of deployments) if (positive(item?.id)) [item.latest_status] = await api(`/deployments/${item.id}/statuses?per_page=1`, token);
  const selected = selectExactPreviewDeployment({ deployments, expectedHeadSha: head });
  const values = { OD17_PREVIEW_URL: selected.url, OD17_DEPLOYMENT_ID: selected.deploymentId, OD17_STATUS_ID: selected.statusId, OD17_DEPLOYMENT_SHA: selected.sha, OD17_DEPLOYMENT_ENVIRONMENT: selected.environment, OD17_DEPLOYMENT_PRODUCTION: false, OD17_DEPLOYMENT_REF: selected.ref, OD17_PREPARATION_RUN_ID: preparation.runId, OD17_PREPARATION_RUN_ATTEMPT: preparation.runAttempt, OD17_PREPARATION_ARTIFACT_ID: preparation.artifactId, OD17_PREPARATION_ARTIFACT_DIGEST: preparation.artifactDigest };
  await fs.appendFile(process.env.GITHUB_ENV, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
}
// prettier-ignore
if (isMainModule(process.argv[1], import.meta.url)) (process.argv[2] === 'verify' ? verifyProof() : resolveCollector()).catch(error => { console.error(error.message); process.exitCode = 1; });
