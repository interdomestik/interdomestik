const { ACCOUNTS, ROLE_IPS } = require('./config.ts');
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
  resolveForwardedForIp,
};
