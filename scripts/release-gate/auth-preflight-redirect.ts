function isTrustedAuthPreflightRedirect(endpoint, response) {
  const location = response.headers.get('location');
  if (!location) return false;

  let redirectUrl;
  try {
    redirectUrl = new URL(location, endpoint);
  } catch {
    return false;
  }

  return redirectUrl.origin === endpoint.origin && redirectUrl.pathname.startsWith('/api/auth/');
}

module.exports = { isTrustedAuthPreflightRedirect };
