const { TIMEOUTS } = require('./config.ts');
const { gotoWithTransientRetry, loginAs, normalizeBaseUrl, sleep } = require('./shared.ts');

const REACHABILITY_RETRY_ATTEMPTS = 3;
const REACHABILITY_RETRY_DELAY_MS = 1_000;

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

function isUsableProbeStatus(status) {
  return Number.isFinite(status) && status >= 200 && status < 400;
}

function normalizeDeploymentBaseUrl(deploymentUrl) {
  if (!deploymentUrl || deploymentUrl === 'unknown') return null;
  try {
    return normalizeBaseUrl(deploymentUrl);
  } catch {
    return null;
  }
}

function buildReachabilityCandidates(
  configuredBaseUrl,
  deploymentBaseUrl,
  allowDeploymentFallback
) {
  return Array.from(
    new Set([configuredBaseUrl, allowDeploymentFallback ? deploymentBaseUrl : null].filter(Boolean))
  );
}

async function probeReachabilityCandidate(candidate, source, maxAttempts, failures) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const status = await probeBaseUrl(candidate);
      if (isUsableProbeStatus(status)) {
        return { baseUrl: candidate, source, probeStatus: status, failures };
      }
      failures.push(`probe_unusable candidate=${candidate} status=${status}`);
      return null;
    } catch (error) {
      failures.push(
        `probe_failed candidate=${candidate} reason=${compactErrorMessage(error?.message || error)}`
      );
      if (attempt < maxAttempts) {
        await sleep(REACHABILITY_RETRY_DELAY_MS);
      }
    }
  }

  return null;
}

async function resolveReachableBaseUrl(configuredBaseUrl, deployment, options = {}) {
  const deploymentBaseUrl = normalizeDeploymentBaseUrl(deployment?.deploymentUrl);
  const allowDeploymentFallback = options.allowDeploymentFallback !== false;
  const candidates = buildReachabilityCandidates(
    configuredBaseUrl,
    deploymentBaseUrl,
    allowDeploymentFallback
  );
  const failures = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const source = index === 0 ? 'configured' : 'deployment_fallback';
    const maxAttempts = index === 0 ? REACHABILITY_RETRY_ATTEMPTS : 1;

    const resolved = await probeReachabilityCandidate(candidate, source, maxAttempts, failures);
    if (resolved) {
      return resolved;
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
  const doRetryLogin = typeof retryLogin === 'function' ? retryLogin : async () => {};

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await gotoWithTransientRetry({ navigate, maxAttempts: 4 });
    } catch (error) {
      const message = String(error?.message || error);
      if (
        (/ERR_ABORTED/i.test(message) || /ERR_CONNECTION_REFUSED/i.test(message)) &&
        attempt < 3
      ) {
        await doRetryLogin();
        continue;
      }
      throw error;
    }

    if (/\/login(?:[/?#]|$)/.test(page.url()) && attempt < 3) {
      await doRetryLogin();
      continue;
    }

    return page.url();
  }

  return page.url();
}

async function loginWithRunContext(page, runCtx, account, options = {}) {
  return loginAs(page, {
    account,
    credentials: runCtx.credentials[account],
    baseUrl: runCtx.baseUrl,
    locale: runCtx.locale,
    authState: runCtx.authState,
    forceFresh: options.forceFresh === true,
  });
}

module.exports = {
  gotoWithSessionRetry,
  loginWithRunContext,
  resolveReachableBaseUrl,
};
