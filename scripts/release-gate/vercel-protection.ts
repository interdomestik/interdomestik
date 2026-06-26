function vercelAppHost(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname === 'vercel.app' || hostname.endsWith('.vercel.app')) return hostname;
  } catch {
    return '';
  }
  return '';
}

function protectionSecret() {
  const value = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function buildVercelProtectionHeaders(baseUrl) {
  const secret = protectionSecret();
  if (!secret || !vercelAppHost(baseUrl)) return {};
  return {
    'x-vercel-protection-bypass': secret,
    'x-vercel-set-bypass-cookie': 'true',
  };
}

function installVercelProtectionFetch(baseUrl) {
  const headers = buildVercelProtectionHeaders(baseUrl);
  const protectedHost = vercelAppHost(baseUrl);
  if (Object.keys(headers).length === 0 || globalThis.fetch.__vercelProtectionWrapped) return;
  const originalFetch = globalThis.fetch.bind(globalThis);
  const wrappedFetch = (input, init = {}) => {
    const target = typeof input === 'string' || input instanceof URL ? input : input.url;
    if (vercelAppHost(target) !== protectedHost) return originalFetch(input, init);
    const nextHeaders = new Headers(init.headers || {});
    for (const [name, value] of Object.entries(headers)) nextHeaders.set(name, value);
    return originalFetch(input, {
      ...init,
      headers: nextHeaders,
    });
  };
  wrappedFetch.__vercelProtectionWrapped = true;
  globalThis.fetch = wrappedFetch;
}

function installVercelProtectionBrowser(baseUrl, browser) {
  const originalNewContext = browser.newContext.bind(browser);
  const headers = buildVercelProtectionHeaders(baseUrl);
  const protectedHost = vercelAppHost(baseUrl);
  browser.newContext = async options => {
    const context = await originalNewContext(options);
    if (Object.keys(headers).length === 0) return context;
    await context.route('**/*', route => {
      const request = route.request();
      if (vercelAppHost(request.url()) !== protectedHost) return route.continue();
      return route.continue({ headers: { ...request.headers(), ...headers } });
    });
    return context;
  };
}

function installVercelProtection(baseUrl, browser) {
  installVercelProtectionFetch(baseUrl);
  installVercelProtectionBrowser(baseUrl, browser);
}

module.exports = {
  buildVercelProtectionHeaders,
  installVercelProtection,
  installVercelProtectionBrowser,
  installVercelProtectionFetch,
};
