const { TIMEOUTS } = require('./config.ts');
const { loginAs, normalizeBaseUrl } = require('./shared.ts');

function compactErrorMessage(raw, maxLength = 420) {
  return String(raw || '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

async function probeBaseUrl(candidateBaseUrl) {
  const origin = new URL(candidateBaseUrl).origin;
  const response = await fetch(origin, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUTS.nav),
  });
  return response.status;
}

function normalizeDeploymentBaseUrl(deploymentUrl) {
  if (!deploymentUrl || deploymentUrl === 'unknown') return null;
  try {
    return normalizeBaseUrl(deploymentUrl);
  } catch {
    return null;
  }
}

async function resolveReachableBaseUrl(configuredBaseUrl, deployment) {
  const deploymentBaseUrl = normalizeDeploymentBaseUrl(deployment?.deploymentUrl);
  const candidates = Array.from(new Set([configuredBaseUrl, deploymentBaseUrl].filter(Boolean)));
  const failures = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const status = await probeBaseUrl(candidate);
      const source = index === 0 ? 'configured' : 'deployment_fallback';
      return { baseUrl: candidate, source, probeStatus: status, failures };
    } catch (error) {
      failures.push(
        `probe_failed candidate=${candidate} reason=${compactErrorMessage(error?.message || error)}`
      );
    }
  }

  return {
    baseUrl: configuredBaseUrl,
    source: 'configured_unreachable',
    probeStatus: null,
    failures,
  };
}

async function gotoWithSessionRetry({ page, navigate, retryLogin }) {
  try {
    await navigate();
  } catch (error) {
    const message = String(error?.message || error);
    if (!/ERR_ABORTED/i.test(message)) {
      throw error;
    }
    await retryLogin();
    await navigate();
  }

  if (/\/login(?:[/?#]|$)/.test(page.url())) {
    await retryLogin();
    await navigate();
  }

  return page.url();
}

async function loginWithRunContext(page, runCtx, account) {
  return loginAs(page, {
    account,
    credentials: runCtx.credentials[account],
    baseUrl: runCtx.baseUrl,
    locale: runCtx.locale,
    authState: runCtx.authState,
  });
}

module.exports = {
  gotoWithSessionRetry,
  loginWithRunContext,
  resolveReachableBaseUrl,
};
