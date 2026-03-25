const path = require('node:path');

const { ROUTES, MARKERS, SELECTORS, TIMEOUTS, ROLE_IPS, ACCOUNTS } = require('./config.ts');

const TRANSIENT_NAVIGATION_ERROR_PATTERNS = [
  /ERR_CONNECTION_REFUSED/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /Timeout \d+ms exceeded/i,
  /ECONNRESET/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /socket hang up/i,
];

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

function trimTrailingSlashes(pathname) {
  let end = pathname.length;
  while (end > 1 && pathname.codePointAt(end - 1) === 47) {
    end -= 1;
  }
  return pathname.slice(0, end);
}

function normalizeRoutePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '/';

  try {
    const parsed = new URL(raw);
    return trimTrailingSlashes(parsed.pathname) || '/';
  } catch {
    const stripped = raw.split(/[?#]/, 1)[0].trim();
    return trimTrailingSlashes(stripped) || '/';
  }
}

function buildRoute(baseUrl, locale, routePath) {
  if (typeof routePath === 'string' && /^https?:\/\//i.test(routePath)) {
    return routePath;
  }
  const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${baseUrl}/${locale}${normalized}`;
}

function buildRouteAllowingLocalePath(baseUrl, locale, routePath) {
  if (typeof routePath === 'string' && /^https?:\/\//i.test(routePath)) {
    return routePath;
  }
  const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;
  const localePrefix = `/${locale}/`;
  if (normalized === `/${locale}` || normalized.startsWith(localePrefix)) {
    return `${baseUrl}${normalized}`;
  }
  return buildRoute(baseUrl, locale, normalized);
}

function getMissingEnv(requiredVars) {
  return requiredVars.filter(
    varName => !process.env[varName] || String(process.env[varName]).trim() === ''
  );
}

function resolveForwardedForIp(account) {
  const roleMarker = ACCOUNTS[account]?.roleMarker;
  return ROLE_IPS[account] || ROLE_IPS[roleMarker] || ROLE_IPS.member;
}

function checkResult(id, status, evidence, signatures) {
  return {
    id,
    status,
    evidence: evidence || [],
    signatures: signatures || [],
  };
}

function envFlag(name, defaultValue) {
  const value = process.env[name];
  if (value == null || String(value).trim() === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function roleMarkerForAccount(accountKey) {
  if (accountKey === 'admin_ks' || accountKey === 'admin_mk') return MARKERS.admin;
  return MARKERS[ACCOUNTS[accountKey].roleMarker];
}

function resolvePlaywright() {
  const appsWebPath = path.resolve(process.cwd(), 'apps/web');
  const modulePath = require.resolve('@playwright/test', { paths: [appsWebPath] });
  return require(modulePath);
}

const LOGIN_MAX_ATTEMPTS_PER_ACCOUNT = 3;
const LOGIN_FALLBACK_RETRY_DELAYS_SECONDS = [1, 3, 6];
const LOGIN_JITTER_BOUNDS_MS = {
  min: 100,
  max: 350,
};
const AUTH_LOGIN_POST_WINDOW_MS = 60_000;
const AUTH_LOGIN_POST_LIMIT = 2;
const AUTH_LOGIN_POST_SAFETY_BUFFER_MS = 2_000;

let loginMutex = Promise.resolve();

function normalizeAccountLabel(label) {
  return String(label || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9()_-]/g, '');
}

function sessionCacheKeyForAccount(accountKey) {
  const configured = ACCOUNTS[accountKey]?.label || accountKey;
  return normalizeAccountLabel(configured);
}

function parseRetryAfterSeconds(value, nowMs = Date.now()) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const directSeconds = Number.parseInt(raw, 10);
  if (Number.isFinite(directSeconds) && directSeconds >= 0) {
    return directSeconds;
  }

  const asDateMs = Date.parse(raw);
  if (Number.isNaN(asDateMs)) return null;
  const deltaSeconds = Math.ceil((asDateMs - nowMs) / 1000);
  return Math.max(0, deltaSeconds);
}

function randomJitterMs(min, max, randomFn = Math.random) {
  const span = max - min + 1;
  const raw = Number(randomFn());
  const bounded = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.999999) : 0.5;
  return min + Math.floor(bounded * span);
}

function computeRetryDelayMs({ attempt, retryAfterSeconds, randomFn = Math.random }) {
  const fallbackIndex = Math.min(
    Math.max(attempt - 1, 0),
    LOGIN_FALLBACK_RETRY_DELAYS_SECONDS.length - 1
  );
  const fallbackBaseMs = LOGIN_FALLBACK_RETRY_DELAYS_SECONDS[fallbackIndex] * 1000;
  const retryAfterBaseMs =
    typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds)
      ? Math.max(0, retryAfterSeconds) * 1000
      : null;
  const baseMs = retryAfterBaseMs == null ? fallbackBaseMs : retryAfterBaseMs;
  const jitterMs = randomJitterMs(LOGIN_JITTER_BOUNDS_MS.min, LOGIN_JITTER_BOUNDS_MS.max, randomFn);
  return {
    baseMs,
    jitterMs,
    totalMs: baseMs + jitterMs,
  };
}

function defaultPathForAccount(account) {
  const roleMarker = ACCOUNTS[account]?.roleMarker;
  if (roleMarker && ROUTES.rbacTargets.includes(roleMarker)) {
    return roleMarker;
  }
  return account.replace('_ks', '').replace('_mk', '');
}

function logLoginAttempt({ account, attempt, status, retryAfterSeconds }) {
  const retryAfterValue =
    typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds
      : 'none';
  console.log(
    `[release-gate][login-attempt] account_label=${sessionCacheKeyForAccount(account)} attempt=${attempt} status=${status} retry_after_s=${retryAfterValue}`
  );
}

function compactFailureMessage(raw, maxLength = 420) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isAuthExpiryResponse(response, origin) {
  const status = response.status();
  if (status !== 401 && status !== 403) return false;
  const responseUrl = response.url();
  if (!responseUrl.startsWith(origin)) return false;
  return (
    responseUrl.includes('/api/auth/') ||
    responseUrl.includes('/api/session') ||
    responseUrl.includes('/session')
  );
}

async function bootstrapAccountLanding(page, params) {
  const { account, baseUrl, locale } = params;
  const defaultPath = defaultPathForAccount(account);
  const targetUrl = buildRoute(baseUrl, locale, `/${defaultPath}`);
  const origin = new URL(baseUrl).origin;

  let sawAuthExpiry = false;
  const onResponse = response => {
    if (isAuthExpiryResponse(response, origin)) {
      sawAuthExpiry = true;
    }
  };

  page.on('response', onResponse);
  try {
    // Keep login bootstrap tolerant: account data can drift, and strict role marker
    // assertions here create false exceptions before route-specific checks run.
    // Route checks (P0.1/P0.6/etc.) remain authoritative for marker semantics.
    await gotoWithTransientRetry({
      navigate: () => page.goto(targetUrl, { waitUntil: 'networkidle', timeout: TIMEOUTS.nav }),
    });
    await page.waitForTimeout(300);
  } finally {
    page.off('response', onResponse);
  }

  return { targetUrl, sawAuthExpiry };
}

function queueLoginOperation(operation) {
  const current = loginMutex.then(() => operation());
  loginMutex = current.catch(() => {});
  return current;
}

function createAuthState() {
  return {
    sessionStateByAccount: new Map(),
    loginPostTimestampsMs: [],
    cooldownUntilMs: 0,
  };
}

function trimAuthLoginAttempts(authState, nowMs) {
  authState.loginPostTimestampsMs = (authState.loginPostTimestampsMs || []).filter(
    timestampMs => nowMs - timestampMs < AUTH_LOGIN_POST_WINDOW_MS
  );
}

function recordAuthLoginAttempt(authState, nowMs = Date.now()) {
  trimAuthLoginAttempts(authState, nowMs);
  authState.loginPostTimestampsMs.push(nowMs);
}

function noteAuthRateLimit(authState, retryAfterSeconds, nowMs = Date.now()) {
  const retryAfterMs =
    typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds)
      ? Math.max(0, retryAfterSeconds) * 1000
      : 0;
  authState.cooldownUntilMs = Math.max(authState.cooldownUntilMs || 0, nowMs + retryAfterMs);
}

function getAuthLoginCooldownMs(authState, nowMs = Date.now()) {
  trimAuthLoginAttempts(authState, nowMs);
  const manualCooldownMs = Math.max(0, (authState.cooldownUntilMs || 0) - nowMs);

  if ((authState.loginPostTimestampsMs || []).length < AUTH_LOGIN_POST_LIMIT) {
    return manualCooldownMs;
  }

  const oldestTrackedAttemptMs = authState.loginPostTimestampsMs[0];
  const rollingWindowCooldownMs = Math.max(
    0,
    AUTH_LOGIN_POST_WINDOW_MS - (nowMs - oldestTrackedAttemptMs)
  );
  const bufferedRollingWindowCooldownMs =
    rollingWindowCooldownMs > 0 ? rollingWindowCooldownMs + AUTH_LOGIN_POST_SAFETY_BUFFER_MS : 0;
  return Math.max(manualCooldownMs, bufferedRollingWindowCooldownMs);
}

async function loginAs(page, params) {
  return queueLoginOperation(async () => {
    const { account, credentials, baseUrl, locale } = params;
    const authState = params.authState || createAuthState();
    const sleepFn = params.sleepFn || sleep;
    const nowFn = params.nowFn || Date.now;
    const forceFresh = params.forceFresh === true;
    const accountCacheKey = sessionCacheKeyForAccount(account);
    const cachedSessionState = authState.sessionStateByAccount.get(accountCacheKey);

    if (!forceFresh && cachedSessionState && Array.isArray(cachedSessionState.cookies)) {
      await page.context().clearCookies();
      if (cachedSessionState.cookies.length > 0) {
        await page.context().addCookies(cachedSessionState.cookies);
      }
      return;
    }

    const origin = new URL(baseUrl).origin;
    const loginUrl = `${origin}/api/auth/sign-in/email`;
    const tenantId = ACCOUNTS[account]?.tenantId;

    await page.context().clearCookies();

    let response = null;
    for (let attempt = 1; attempt <= LOGIN_MAX_ATTEMPTS_PER_ACCOUNT; attempt += 1) {
      const sharedCooldownMs = getAuthLoginCooldownMs(authState, nowFn());
      if (sharedCooldownMs > 0) {
        await sleepFn(sharedCooldownMs);
      }

      try {
        response = await page.request.post(loginUrl, {
          data: {
            email: credentials.email,
            password: credentials.password,
          },
          headers: {
            Origin: origin,
            Referer: `${origin}/${locale}/login`,
            'x-forwarded-for': resolveForwardedForIp(account),
            ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
          },
        });
        recordAuthLoginAttempt(authState, nowFn());
      } catch (networkError) {
        logLoginAttempt({
          account,
          attempt,
          status: 'network-error',
          retryAfterSeconds: null,
        });
        if (attempt >= LOGIN_MAX_ATTEMPTS_PER_ACCOUNT) {
          const code = compactFailureMessage(networkError?.code || 'unknown', 64);
          const message = compactFailureMessage(networkError?.message || networkError, 650);
          throw new Error(
            `AUTH_LOGIN_NETWORK_ERROR account=${account} attempts=${attempt} code=${code} message=${message}`
          );
        }
        const delay = computeRetryDelayMs({ attempt });
        await sleepFn(delay.totalMs);
        continue;
      }

      const status = response.status();
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers()['retry-after']);
      logLoginAttempt({ account, attempt, status, retryAfterSeconds });
      if (status === 429) {
        noteAuthRateLimit(
          authState,
          retryAfterSeconds ??
            LOGIN_FALLBACK_RETRY_DELAYS_SECONDS[
              Math.min(attempt - 1, LOGIN_FALLBACK_RETRY_DELAYS_SECONDS.length - 1)
            ],
          nowFn()
        );
      }

      if (response.ok()) break;

      const shouldRetry = status === 429 || status === 408 || (status >= 500 && status <= 599);
      if (!shouldRetry) break;

      if (attempt >= LOGIN_MAX_ATTEMPTS_PER_ACCOUNT) {
        if (status === 429) {
          throw new Error(
            `AUTH_LOGIN_RATE_LIMIT_EXHAUSTED account=${account} attempts=${attempt} status=429 retry_after_s=${retryAfterSeconds ?? 'none'} url=${response.url()}`
          );
        }
        break;
      }

      const delay = computeRetryDelayMs({ attempt, retryAfterSeconds });
      await sleepFn(delay.totalMs);
    }

    if (!response || !response.ok()) {
      const status = response ? response.status() : 'no-response';
      const url = response ? response.url() : loginUrl;
      throw new Error(`AUTH_LOGIN_FAILED account=${account} status=${status} url=${url}`);
    }

    let storageState = await page.context().storageState();
    if (!Array.isArray(storageState.cookies) || storageState.cookies.length === 0) {
      await bootstrapAccountLanding(page, { account, baseUrl, locale });
      storageState = await page.context().storageState();
    }
    authState.sessionStateByAccount.set(accountCacheKey, storageState);
  });
}

async function markerSnapshot(page) {
  return checkPortalMarkers(page);
}

function markerSummary(route, markerState) {
  return `${route} => member=${markerState.member}, agent=${markerState.agent}, staff=${markerState.staff}, admin=${markerState.admin}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientNavigationError(raw) {
  const message = String(raw || '')
    .replaceAll(/\s+/g, ' ')
    .trim();
  if (!message) return false;
  return TRANSIENT_NAVIGATION_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

async function gotoWithTransientRetry({ navigate, maxAttempts = 4, delayMs = 1_000 }) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await navigate();
    } catch (error) {
      if (!isTransientNavigationError(error?.message || error) || attempt >= maxAttempts) {
        throw error;
      }
      await sleep(delayMs * attempt);
    }
  }
}

async function checkPortalMarkers(page) {
  const markerKeys = ['member', 'agent', 'staff', 'admin', 'notFound'];
  const snapshot = {};
  for (const markerKey of markerKeys) {
    snapshot[markerKey] = await page
      .getByTestId(MARKERS[markerKey])
      .isVisible({ timeout: TIMEOUTS.quickMarker })
      .catch(() => false);
  }

  if (!snapshot.notFound) {
    // Next.js can render fallback 404 templates without our explicit not-found marker.
    const fallbackNotFoundTemplatePresent = await page
      .locator(SELECTORS.notFoundFallbackTemplate)
      .count()
      .then(count => count > 0)
      .catch(() => false);
    if (fallbackNotFoundTemplatePresent) {
      snapshot.notFound = true;
    }
  }

  snapshot.rolesTable = await page
    .locator(SELECTORS.userRolesTable)
    .isVisible({ timeout: TIMEOUTS.quickMarker })
    .catch(() => false);
  return snapshot;
}

function markersToString(markers) {
  return `member=${markers.member}, agent=${markers.agent}, staff=${markers.staff}, admin=${markers.admin}, notFound=${markers.notFound}, rolesTable=${markers.rolesTable}`;
}

async function waitForReadyMarker(page, timeoutMs, preferredKeys = []) {
  const start = Date.now();
  let observed = await checkPortalMarkers(page);
  while (Date.now() - start < timeoutMs) {
    const preferredSatisfied =
      Array.isArray(preferredKeys) &&
      preferredKeys.length > 0 &&
      preferredKeys.some(key => observed[key] === true);
    const hasReadyMarker =
      observed.notFound || observed.member || observed.agent || observed.staff || observed.admin;
    if (preferredSatisfied || (preferredKeys.length === 0 && hasReadyMarker)) break;
    await sleep(250);
    observed = await checkPortalMarkers(page);
  }
  return observed;
}

function compareExpectedMarkers(expected, observed) {
  const mismatches = [];
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (typeof expectedValue !== 'boolean') continue;
    if (observed[key] !== expectedValue) {
      mismatches.push(`${key} expected ${expectedValue} got ${observed[key]}`);
    }
  }
  return mismatches;
}

async function assertUrlMarkers(page, label, url, expected) {
  await gotoWithTransientRetry({
    navigate: () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
  });
  const preferredKeys = Object.entries(expected)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  const observed = await waitForReadyMarker(page, 10_000, preferredKeys);
  const hasReadyMarker =
    observed.notFound || observed.member || observed.agent || observed.staff || observed.admin;
  const mismatches = compareExpectedMarkers(expected, observed);
  if (!hasReadyMarker) {
    mismatches.push('no readiness marker visible within 10s');
  }

  return {
    label,
    url,
    expected,
    observed,
    status: mismatches.length === 0 ? 'PASS' : 'FAIL',
    mismatches,
  };
}

async function collectMarkersWithWait(page, preferredMarker) {
  const start = Date.now();
  let current = await markerSnapshot(page);
  while (Date.now() - start < TIMEOUTS.marker) {
    if (current.notFound) break;
    if (preferredMarker) {
      if (current[preferredMarker]) break;
    } else if (Object.values(current).some(Boolean)) {
      break;
    }
    await sleep(300);
    current = await markerSnapshot(page);
  }
  return current;
}

function expectedMatrixForAccount(account) {
  if (account === 'member') {
    return { canonical: 'member', absentOnAllRoutes: ['agent', 'staff', 'admin'] };
  }
  if (account === 'agent') {
    return { canonical: 'agent', absentOnAllRoutes: ['staff', 'admin'] };
  }
  if (account === 'staff') {
    return { canonical: 'staff', absentOnAllRoutes: ['agent', 'admin'] };
  }
  return { canonical: 'admin', absentOnAllRoutes: ['agent', 'staff'] };
}

module.exports = {
  assertUrlMarkers,
  buildRoute,
  buildRouteAllowingLocalePath,
  checkPortalMarkers,
  checkResult,
  collectMarkersWithWait,
  computeRetryDelayMs,
  createAuthState,
  getAuthLoginCooldownMs,
  envFlag,
  expectedMatrixForAccount,
  getMissingEnv,
  gotoWithTransientRetry,
  isTransientNavigationError,
  loginAs,
  markerSnapshot,
  markerSummary,
  markersToString,
  normalizeBaseUrl,
  normalizeRoutePath,
  parseRetryAfterSeconds,
  resolveForwardedForIp,
  resolvePlaywright,
  noteAuthRateLimit,
  recordAuthLoginAttempt,
  sessionCacheKeyForAccount,
  sleep,
  trimTrailingSlashes,
  waitForReadyMarker,
};
