const {
  assertSafeHttpUrl,
  assertTrustedVercelDeploymentUrl,
  isLoopbackOrPrivateHost,
} = require('../security/egress.cjs');
const { normalizeBaseUrl } = require('./shared.ts');

const RELEASE_GATE_HOSTNAME_SUFFIXES = ['.interdomestik.com'];
const RELEASE_GATE_HOSTNAMES = new Set(['interdomestik.com', 'interdomestik-web.vercel.app']);

function normalizedHostname(hostname) {
  return String(hostname || '').toLowerCase();
}

function isAllowedReleaseGateHostname(hostname) {
  const normalized = normalizedHostname(hostname);
  return (
    RELEASE_GATE_HOSTNAMES.has(normalized) ||
    RELEASE_GATE_HOSTNAME_SUFFIXES.some(suffix => normalized.endsWith(suffix))
  );
}

function assertTrustedReleaseGateBaseUrl(rawValue, options = {}) {
  const parsed = assertSafeHttpUrl(rawValue, { allowLoopback: options.allowLoopback === true });
  const normalized = normalizedHostname(parsed.hostname);
  const extraHostname = normalizedHostname(options.allowedExtraHostname);
  if (isLoopbackOrPrivateHost(parsed.hostname)) return parsed;
  if (extraHostname && normalized === extraHostname && normalized.endsWith('.vercel.app')) {
    return parsed;
  }
  if (!isAllowedReleaseGateHostname(parsed.hostname)) {
    throw new Error(`Release gate base URL host is not allowed: ${parsed.hostname}`);
  }
  return parsed;
}

function parseSafeOrigin(value) {
  if (!value) return null;
  try {
    return assertSafeHttpUrl(value, { allowLoopback: true }).origin;
  } catch {
    return null;
  }
}

function isTrustedCiPlaywrightLoopbackBaseUrl(configuredBaseUrl, env = process.env) {
  if (String(env.CI || '').toLowerCase() !== 'true') return false;
  if (String(env.PLAYWRIGHT || '') !== '1') return false;

  let configured;
  try {
    configured = assertSafeHttpUrl(configuredBaseUrl, { allowLoopback: true });
  } catch {
    return false;
  }

  if (!isLoopbackOrPrivateHost(configured.hostname)) return false;
  const trustedOrigins = [env.NEXT_PUBLIC_APP_URL, env.BETTER_AUTH_URL]
    .map(parseSafeOrigin)
    .filter(Boolean);
  return trustedOrigins.includes(configured.origin);
}

function shouldAllowConfiguredLoopbackBaseUrl(configuredBaseUrl, envName, env = process.env) {
  if (String(envName || '').toLowerCase() !== 'production') return true;
  if (env.RELEASE_GATE_ALLOW_LOOPBACK_BASE_URL === '1') return true;
  return isTrustedCiPlaywrightLoopbackBaseUrl(configuredBaseUrl, env);
}

function normalizeTrustedVercelDeploymentBaseUrl(deploymentUrl) {
  if (!deploymentUrl || deploymentUrl === 'unknown') return null;
  try {
    const parsed = assertTrustedVercelDeploymentUrl(deploymentUrl);
    return { baseUrl: normalizeBaseUrl(parsed.origin), hostname: parsed.hostname };
  } catch {
    return null;
  }
}

function buildAuthEndpointUrls(baseUrl, options = {}) {
  const origin = assertTrustedReleaseGateBaseUrl(baseUrl, options).origin;
  const getSessionPath = '/api/auth/get-session?disableCookieCache=true&disableRefresh=true';
  const signInEmailPath = '/api/auth/sign-in/email';
  return {
    origin,
    endpoints: [
      { path: getSessionPath, url: new URL(getSessionPath, origin) },
      { path: signInEmailPath, url: new URL(signInEmailPath, origin) },
    ],
    signInEmailUrl: new URL(signInEmailPath, origin),
  };
}

module.exports = {
  assertTrustedReleaseGateBaseUrl,
  buildAuthEndpointUrls,
  isAllowedReleaseGateHostname,
  normalizeTrustedVercelDeploymentBaseUrl,
  shouldAllowConfiguredLoopbackBaseUrl,
};
