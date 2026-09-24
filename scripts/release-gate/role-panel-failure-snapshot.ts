const { MARKERS, SELECTORS } = require('./config.ts');
const { sanitizeRolePanelFailureSession } = require('./role-panel-failure-session.ts');

const MAX_ITEMS = 20;
const MARKER_KEYS = [
  'roleSelectTrigger',
  'userRolesTable',
  'adminReady',
  'notFound',
  'nextErrorBoundary',
];

function classifyRolePanelFailure(value) {
  const text = String(value || '').toLowerCase();
  if (/hydration|did not match|server rendered html/u.test(text)) return 'hydration';
  if (/chunkload|loading chunk|failed to fetch dynamically imported module/u.test(text)) {
    return 'chunk-load';
  }
  if (/network|failed to fetch|err_connection|err_name|timeout|socket/u.test(text)) {
    return 'network';
  }
  if (/unauthorized|forbidden|permission|status (?:401|403)/u.test(text)) return 'permission';
  return 'generic';
}

function releaseGateOrigin(baseUrl) {
  try {
    return new URL(String(baseUrl || '')).origin;
  } catch {
    return null;
  }
}

function sanitizeRolePanelFailureUrl(value, baseUrl) {
  const origin = releaseGateOrigin(baseUrl);
  try {
    const parsed = new URL(String(value || ''));
    if (!origin || parsed.origin !== origin) return '[EXTERNAL_ORIGIN]/[REDACTED_PATH]';
    if (parsed.pathname === '/api/auth/get-session') return `${origin}/api/auth/get-session`;
    if (/^\/(?:en|sq|mk|sr)\/(?:login|admin)\/?$/u.test(parsed.pathname)) {
      return `${origin}${parsed.pathname}`;
    }
    const userPath = /^\/(en|sq|mk|sr)\/admin\/users\/[^/]+\/?$/u.exec(parsed.pathname);
    if (userPath) {
      const trailingSlash = parsed.pathname.endsWith('/') ? '/' : '';
      return `${origin}/${userPath[1]}/admin/users/[REDACTED_ID]${trailingSlash}`;
    }
    if (parsed.pathname.startsWith('/_next/')) return `${origin}/_next/[ASSET]`;
    return `${origin}/[REDACTED_PATH]`;
  } catch {
    return '[INVALID_URL]';
  }
}

function sanitizePageTitle(value) {
  return String(value || '').trim() === 'Interdomestik - Consumer Protection'
    ? 'public-shell'
    : 'redacted';
}

function sanitizeMarkerState(markers) {
  return Object.fromEntries(
    MARKER_KEYS.map(key => {
      const count = Number.isInteger(markers?.[key]?.count)
        ? Math.min(Math.max(markers[key].count, 0), 99)
        : 0;
      return [key, { count, visible: markers?.[key]?.visible === true }];
    })
  );
}

function requestKind(item) {
  try {
    const parsed = new URL(String(item?.url || ''));
    const headers = item?.headers || {};
    if (parsed.searchParams.has('_rsc') || String(headers.rsc || headers.RSC || '') === '1') {
      return 'rsc';
    }
    if (item?.resourceType === 'document') return 'document';
    if (parsed.pathname.startsWith('/api/')) return 'api';
    if (parsed.pathname.startsWith('/_next/')) return 'asset';
  } catch {
    return 'other';
  }
  return 'other';
}

function uniqueItems(items) {
  return Array.from(new Map(items.map(item => [JSON.stringify(item), item])).values()).slice(
    0,
    MAX_ITEMS
  );
}

function createSanitizedRolePanelFailureSnapshot(raw) {
  const baseUrl = raw?.baseUrl;
  const attempts = (raw?.attempts || []).slice(0, 8).map(attempt => ({
    responseStatus: Number.isInteger(attempt.responseStatus) ? attempt.responseStatus : null,
    finalUrl: sanitizeRolePanelFailureUrl(attempt.finalUrl, baseUrl),
    title: sanitizePageTitle(attempt.title),
    markers: sanitizeMarkerState(attempt.markers),
    originalDocument: {
      roleSelectTriggerMarkup: String(attempt.responseBody || '').includes(
        'data-testid="role-select-trigger"'
      ),
      userRolesTableMarkup: String(attempt.responseBody || '').includes(
        'data-testid="user-roles-table"'
      ),
      adminReadyMarkup: String(attempt.responseBody || '').includes(
        `data-testid="${MARKERS.admin}"`
      ),
      notFoundMarkup: String(attempt.responseBody || '').includes(
        `data-testid="${MARKERS.notFound}"`
      ),
    },
    navigationErrorCategory: attempt.navigationError
      ? classifyRolePanelFailure(attempt.navigationError)
      : null,
  }));

  const browserErrors = uniqueItems(
    (raw?.browserErrors || []).map(item => ({
      source: item.source === 'page' ? 'page' : 'console',
      category: classifyRolePanelFailure(item.message),
      url: item.url ? sanitizeRolePanelFailureUrl(item.url, baseUrl) : undefined,
    }))
  ).map(item => {
    if (item.url) return item;
    const { url: _url, ...withoutUrl } = item;
    return withoutUrl;
  });
  const failedRequests = uniqueItems(
    (raw?.failedRequests || []).map(item => ({
      method: /^[A-Z]{1,12}$/u.test(String(item.method || '').toUpperCase())
        ? String(item.method).toUpperCase()
        : 'UNKNOWN',
      kind: requestKind(item),
      url: sanitizeRolePanelFailureUrl(item.url, baseUrl),
      reasonCategory: classifyRolePanelFailure(item.errorText),
    }))
  );
  const errorResponses = uniqueItems(
    (raw?.errorResponses || []).map(item => ({
      status: Number.isInteger(item.status) ? item.status : null,
      kind: requestKind(item),
      url: sanitizeRolePanelFailureUrl(item.url, baseUrl),
    }))
  );

  return {
    schemaVersion: 1,
    session: sanitizeRolePanelFailureSession(raw?.session, raw?.expectedEmail),
    attempts,
    browserErrors,
    failedRequests,
    errorResponses,
  };
}

async function markerSnapshot(page) {
  const selectors = {
    roleSelectTrigger: SELECTORS.roleSelectTrigger,
    userRolesTable: SELECTORS.userRolesTable,
    adminReady: `[data-testid="${MARKERS.admin}"]`,
    notFound: `[data-testid="${MARKERS.notFound}"]`,
    nextErrorBoundary: 'body[data-nextjs-error], nextjs-portal',
  };
  const inspectEntry = async ([name, selector]) => {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    if (count === 0) return [name, { count, visible: false }];
    const visible = await locator
      .first()
      .isVisible()
      .catch(() => false);
    return [name, { count, visible }];
  };
  return Object.fromEntries(await Promise.all(Object.entries(selectors).map(inspectEntry)));
}

function createRolePanelFailureCapture(page, options) {
  const raw = {
    baseUrl: options.baseUrl,
    expectedEmail: options.expectedEmail,
    session: null,
    attempts: [],
    browserErrors: [],
    failedRequests: [],
    errorResponses: [],
  };
  const onConsole = message => {
    if (message.type() !== 'error' || raw.browserErrors.length >= MAX_ITEMS) return;
    raw.browserErrors.push({
      source: 'console',
      message: message.text(),
      url: message.location().url || page.url(),
    });
  };
  const onPageError = error => {
    if (raw.browserErrors.length >= MAX_ITEMS) return;
    raw.browserErrors.push({ source: 'page', message: error?.message || error, url: page.url() });
  };
  const onRequestFailed = request => {
    if (raw.failedRequests.length >= MAX_ITEMS) return;
    raw.failedRequests.push({
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText || 'unknown',
      resourceType: request.resourceType(),
      headers: request.headers(),
    });
  };
  const onResponse = response => {
    const status = response.status();
    if (status < 400 || raw.errorResponses.length >= MAX_ITEMS) return;
    const request = response.request();
    raw.errorResponses.push({
      status,
      url: response.url(),
      resourceType: request.resourceType(),
      headers: request.headers(),
    });
  };
  let disposed = false;
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  function dispose() {
    if (disposed) return;
    disposed = true;
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('requestfailed', onRequestFailed);
    page.off('response', onResponse);
  }

  return {
    async captureSession() {
      try {
        const response = await page.request.get(
          new URL('/api/auth/get-session', options.baseUrl).href,
          {
            maxRedirects: 0,
          }
        );
        raw.session = {
          status: response.status(),
          payload: response.ok() ? await response.json().catch(() => null) : null,
        };
      } catch {
        raw.session = { status: null, payload: null };
      }
    },
    async captureAttempt(input = {}) {
      const response = input.response || null;
      raw.attempts.push({
        responseStatus: response?.status?.() ?? null,
        finalUrl: page.url(),
        title: await page.title().catch(() => ''),
        responseBody: response ? await response.text().catch(() => '') : '',
        markers: await markerSnapshot(page),
        navigationError: input.error?.message || input.error || null,
      });
    },
    finish() {
      dispose();
      return createSanitizedRolePanelFailureSnapshot(raw);
    },
    dispose,
  };
}

module.exports = {
  createRolePanelFailureCapture,
  createSanitizedRolePanelFailureSnapshot,
};
