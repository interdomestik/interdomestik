const EXPECTED_REPOSITORY = 'interdomestik/interdomestik';
const EXPECTED_WORKFLOW_REF = 'refs/heads/main';
const EXPECTED_OD17_HEAD_REF = 'codex/ida-t115-od17-performance-proof';
const SHA = /^[0-9a-f]{40}$/u;

function fail(message) {
  throw new Error(`OD17_FOUNDATION_IDENTITY_INVALID: ${message}`);
}

function isExactHead(pullRequest, expectedHeadSha) {
  const head = pullRequest?.head;
  return (
    pullRequest?.state === 'open' &&
    head?.ref === EXPECTED_OD17_HEAD_REF &&
    head?.sha === expectedHeadSha &&
    head?.repo?.full_name === EXPECTED_REPOSITORY &&
    head?.repo?.fork === false
  );
}

export function assertFoundationCanaryIdentity({
  repository,
  workflowRef,
  pullRequest,
  expectedHeadSha,
}) {
  if (repository !== EXPECTED_REPOSITORY) fail('repository');
  if (workflowRef !== EXPECTED_WORKFLOW_REF) fail('workflow_ref');
  if (typeof expectedHeadSha !== 'string' || !SHA.test(expectedHeadSha)) fail('expected_head_sha');
  if (!isExactHead(pullRequest, expectedHeadSha)) fail('pull_request_head');
}

function parseTrustedPreviewUrl(value) {
  if (typeof value !== 'string') fail('preview_url');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    fail('preview_url');
  }
  return url;
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
