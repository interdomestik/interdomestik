import { pathToFileURL } from 'node:url';

const EXPECTED_REPOSITORY = 'interdomestik/interdomestik';
const EXPECTED_WORKFLOW_REF = 'refs/heads/main';
const EXPECTED_OD17_HEAD_REF = 'codex/ida-t115-od17-performance-proof';
const SHA = /^[0-9a-f]{40}$/u;
const GITHUB_API = 'https://api.github.com/repos/interdomestik/interdomestik';
const IMMUTABLE_PREVIEW = /^interdomestik-web-[a-z0-9]{9}-ecohub\.vercel\.app$/u;
export const isMainModule = (argv1, moduleUrl) =>
  Boolean(argv1 && pathToFileURL(argv1).href === moduleUrl);
const isCli = isMainModule(process.argv[1], import.meta.url);
// prettier-ignore
function fail(message) { throw new Error(`OD17_FOUNDATION_IDENTITY_INVALID: ${message}`); }
// prettier-ignore
function isExactHead(pullRequest, expectedHeadSha) {
  const head = pullRequest?.head; return pullRequest?.state === 'open' && head?.ref === EXPECTED_OD17_HEAD_REF &&
    head?.sha === expectedHeadSha && head?.repo?.full_name === EXPECTED_REPOSITORY && head?.repo?.fork === false;
}
// prettier-ignore
export function assertFoundationCanaryIdentity({ repository, workflowRef, pullRequest, expectedHeadSha }) {
  if (repository !== EXPECTED_REPOSITORY) fail('repository');
  if (workflowRef !== EXPECTED_WORKFLOW_REF) fail('workflow_ref');
  if (typeof expectedHeadSha !== 'string' || !SHA.test(expectedHeadSha)) fail('expected_head_sha');
  if (!isExactHead(pullRequest, expectedHeadSha)) fail('pull_request_head');
}
// prettier-ignore
export function parseTrustedPreviewUrl(value) {
  if (typeof value !== 'string') fail('preview_url');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !IMMUTABLE_PREVIEW.test(url.hostname)) fail('preview_url');
  return url;
}
export function collectRemoteJavaScriptUrls({ previewOrigin, pageUrls, lighthouseRequests }) {
  const origin = parseTrustedPreviewUrl(previewOrigin).origin;
  const urls = new Set();
  const add = (value, allowExtensionless = false) => {
    const url = new URL(value);
    if (url.origin === origin && (allowExtensionless || url.pathname.endsWith('.js')))
      urls.add(url.toString());
  };
  for (const url of pageUrls ?? []) add(url);
  for (const request of lighthouseRequests ?? []) {
    if (
      /javascript/u.test(request?.mimeType ?? '') ||
      new URL(request.url).pathname.endsWith('.js')
    )
      add(request.url, /javascript/u.test(request?.mimeType ?? ''));
  }
  return [...urls].sort((left, right) => left.localeCompare(right));
}
// prettier-ignore
export function assertCanonicalLocaleUrl({ requestedUrl, finalUrl }) { const requested = new URL(requestedUrl); const final = new URL(finalUrl);
  if (requested.origin !== final.origin || requested.pathname !== final.pathname) fail('main_document_redirect'); }
// prettier-ignore
export function selectExactPreparation({ run, artifacts, expectedHeadSha, pullNumber }) {
  const runId = Number(run?.id); const pull = Number(pullNumber);
  if (!Number.isSafeInteger(runId) || run?.event !== 'pull_request' || run?.status !== 'completed' || run?.conclusion !== 'success' || run?.head_sha !== expectedHeadSha || run?.head_branch !== EXPECTED_OD17_HEAD_REF || run?.path !== '.github/workflows/od17-preview-canary.yml' || run?.repository?.full_name !== EXPECTED_REPOSITORY || run?.head_repository?.full_name !== EXPECTED_REPOSITORY || !run?.pull_requests?.some(item => item.number === pull)) fail('preparation_run');
  const matches = (artifacts ?? []).filter(item => item?.name === `od17-local-${expectedHeadSha}` && item?.expired === false && item?.workflow_run?.id === runId);
  if (matches.length !== 1 || typeof matches[0].digest !== 'string') fail('preparation_artifact');
  return { runId, runAttempt: run.run_attempt, artifactId: matches[0].id, artifactDigest: matches[0].digest };
}
export async function waitForChrome() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:9222/json/version');
      if (response.ok) return response.json();
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  fail('chrome_unavailable');
}
export function buildTrustedPreviewRequest({ previewUrl, expectedPreviewUrl, oidcToken }) {
  if (typeof oidcToken !== 'string' || oidcToken.length === 0) fail('missing_oidc_token');
  const url = parseTrustedPreviewUrl(previewUrl);
  const expectedUrl = parseTrustedPreviewUrl(expectedPreviewUrl);
  if (url.toString() !== expectedUrl.toString()) fail('preview_url_mismatch');
  return {
    url: url.toString(),
    headers: { 'x-vercel-trusted-oidc-idp-token': oidcToken },
  };
}
export function selectExactPreviewDeployment({ deployments, expectedHeadSha }) {
  if (!Array.isArray(deployments) || !SHA.test(expectedHeadSha ?? '')) fail('deployments');
  const candidates = deployments.filter(deployment => {
    const status = deployment?.latest_status;
    return (
      deployment?.sha === expectedHeadSha &&
      deployment?.ref === EXPECTED_OD17_HEAD_REF &&
      deployment?.performed_via_github_app?.slug === 'vercel' &&
      deployment?.environment === 'Preview' &&
      deployment?.production_environment === false &&
      status?.state === 'success' &&
      typeof status?.id === 'number' &&
      typeof deployment?.id === 'number'
    );
  });
  if (candidates.length !== 1) fail('deployment_ambiguity');
  const deployment = candidates[0];
  const url = parseTrustedPreviewUrl(deployment.latest_status.environment_url);
  if (url.pathname !== '/') fail('deployment_url');
  // prettier-ignore
  return { deploymentId: deployment.id, statusId: deployment.latest_status.id,
    sha: deployment.sha, environment: deployment.environment, productionEnvironment: false,
    ref: deployment.ref, url: url.toString() };
}
// prettier-ignore
async function runCollectorResolution() {
  const {
    GH_TOKEN: token,
    GITHUB_REPOSITORY: repository,
    EXPECTED_HEAD_SHA: sha,
    PREPARATION_RUN_ID: preparationRunId,
    PULL_NUMBER: pullNumber,
  } = process.env;
  const runId = Number(preparationRunId); const pullId = Number(pullNumber);
  if (!token || repository !== EXPECTED_REPOSITORY || !SHA.test(sha ?? '') || !Number.isSafeInteger(runId) || !Number.isSafeInteger(pullId)) fail('cli_identity');
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };
  const pull = await fetch(`${GITHUB_API}/pulls/${pullId}`, { headers });
  if (!pull.ok) fail('pull_request_api');
  assertFoundationCanaryIdentity({ repository, workflowRef: process.env.GITHUB_REF,
    pullRequest: await pull.json(), expectedHeadSha: sha });
  const [runResponse, artifactResponse] = await Promise.all([
    fetch(`${GITHUB_API}/actions/runs/${runId}`, { headers }),
    fetch(`${GITHUB_API}/actions/runs/${runId}/artifacts?per_page=100`, { headers }),
  ]);
  if (!runResponse.ok || !artifactResponse.ok) fail('preparation_api');
  const preparation = selectExactPreparation({ run: await runResponse.json(),
    artifacts: (await artifactResponse.json()).artifacts, expectedHeadSha: sha, pullNumber });
  const response = await fetch(`${GITHUB_API}/deployments?per_page=100`, { headers });
  if (!response.ok) fail('deployment_api');
  const deployments = await response.json();
  for (const deployment of deployments) {
    const deploymentId = Number(deployment.id); if (!Number.isSafeInteger(deploymentId)) fail('deployment_id');
    const statuses = await fetch(`${GITHUB_API}/deployments/${deploymentId}/statuses?per_page=1`, { headers });
    if (!statuses.ok) fail('deployment_status_api');
    [deployment.latest_status] = await statuses.json();
  }
  const selected = selectExactPreviewDeployment({ deployments, expectedHeadSha: sha });
  await import('node:fs/promises').then(fs =>
    fs.appendFile(
      process.env.GITHUB_ENV,
      `OD17_PREVIEW_URL=${selected.url}\nOD17_DEPLOYMENT_ID=${selected.deploymentId}\nOD17_STATUS_ID=${selected.statusId}\nOD17_DEPLOYMENT_SHA=${selected.sha}\nOD17_DEPLOYMENT_ENVIRONMENT=${selected.environment}\nOD17_DEPLOYMENT_PRODUCTION=false\nOD17_DEPLOYMENT_REF=${selected.ref}\nOD17_PREPARATION_RUN_ID=${preparation.runId}\nOD17_PREPARATION_RUN_ATTEMPT=${preparation.runAttempt}\nOD17_PREPARATION_ARTIFACT_ID=${preparation.artifactId}\nOD17_PREPARATION_ARTIFACT_DIGEST=${preparation.artifactDigest}\n`
    )
  );
}
// prettier-ignore
if (isCli) try { await runCollectorResolution(); } catch (error) { console.error(error.message); process.exitCode = 1; }
