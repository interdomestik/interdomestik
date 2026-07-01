const { ACCOUNTS, ROLE_IPS, ROUTES } = require('./config.ts');
const { buildVercelProtectionHeaders } = require('./vercel-protection.ts');

function resolveForwardedForIp(account) {
  const roleMarker = ACCOUNTS[account]?.roleMarker;
  return ROLE_IPS[account] || ROLE_IPS[roleMarker] || ROLE_IPS.member;
}

function buildLoginRequestHeaders({ account, authOrigin, baseUrl, locale }) {
  const tenantId = ACCOUNTS[account]?.tenantId;
  return {
    ...buildVercelProtectionHeaders(baseUrl),
    Origin: authOrigin,
    Referer: `${authOrigin}/${locale}/login`,
    'x-forwarded-for': resolveForwardedForIp(account),
    ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
  };
}

function defaultPathForAccount(account) {
  const roleMarker = ACCOUNTS[account]?.roleMarker;
  if (roleMarker && ROUTES.rbacTargets.includes(roleMarker)) return roleMarker;
  return account.replace('_ks', '').replace('_mk', '');
}

function getResponseHeader(response, name) {
  const headers = response.headers?.() || {};
  return headers[name.toLowerCase()] || headers[name] || '';
}

function normalizePathname(pathname) {
  let normalized = pathname;
  while (normalized.endsWith('/') && normalized !== '/') {
    normalized = normalized.slice(0, -1);
  }
  return normalized || '/';
}

function resolveTrustedLoginRedirectUrl({ response, origin }) {
  const status = response.status();
  if (status !== 307 && status !== 308) return null;

  const location = getResponseHeader(response, 'location');
  if (!location) return null;

  let redirectUrl;
  try {
    redirectUrl = new URL(location, origin);
  } catch {
    return null;
  }

  if (redirectUrl.origin !== origin) return null;
  if (normalizePathname(redirectUrl.pathname) !== '/api/auth/sign-in/email') return null;
  return redirectUrl.href;
}

async function postLoginRequestWithTrustedRedirect({
  request,
  loginUrl,
  requestOptions,
  origin,
  recordAttempt = () => {},
}) {
  recordAttempt();
  const response = await request.post(loginUrl, requestOptions);
  const trustedRedirectUrl = resolveTrustedLoginRedirectUrl({ response, origin });
  if (!trustedRedirectUrl) return response;
  recordAttempt();
  return request.post(trustedRedirectUrl, requestOptions);
}

function assertLoginResponseOrigin({ account, response, origin }) {
  const responseUrl = response.url();
  const actualOrigin = new URL(responseUrl).origin;
  if (actualOrigin === origin) return;

  throw new Error(
    `AUTH_LOGIN_REDIRECTED account=${account} status=${response.status()} expected_origin=${origin} actual_origin=${actualOrigin} url=${responseUrl}`
  );
}

module.exports = {
  assertLoginResponseOrigin,
  buildLoginRequestHeaders,
  defaultPathForAccount,
  postLoginRequestWithTrustedRedirect,
  resolveForwardedForIp,
  resolveTrustedLoginRedirectUrl,
};
