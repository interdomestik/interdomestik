const path = require('node:path');

const { ROUTES, MARKERS, SELECTORS, TIMEOUTS, ROLE_IPS, ACCOUNTS } = require('../config.ts');

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginAs(page, params) {
  const { account, credentials, baseUrl, locale } = params;
  const origin = new URL(baseUrl).origin;
  const loginUrl = `${origin}/api/auth/sign-in/email`;

  await page.context().clearCookies();

  const retryDelaysMs = [0, 1200, 3000, 6000];
  let response = null;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    if (retryDelaysMs[attempt] > 0) {
      await sleep(retryDelaysMs[attempt]);
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
          'x-forwarded-for': ROLE_IPS[account] || ROLE_IPS.member,
        },
      });
    } catch (networkError) {
      response = null;
      const canRetry = attempt < retryDelaysMs.length - 1;
      if (!canRetry) {
        throw networkError;
      }
      continue;
    }

    if (response.ok()) break;
    const status = response.status();
    const shouldRetry = status === 429 || status === 408 || (status >= 500 && status <= 599);
    if (!shouldRetry || attempt === retryDelaysMs.length - 1) {
      break;
    }
  }

  if (!response || !response.ok()) {
    const status = response ? response.status() : 'no-response';
    const url = response ? response.url() : loginUrl;
    throw new Error(`AUTH_LOGIN_FAILED account=${account} status=${status} url=${url}`);
  }

  const defaultPath =
    account === 'agent' ? ROUTES.rbacTargets[1] : account.replace('_ks', '').replace('_mk', '');
  const targetUrl = buildRoute(baseUrl, locale, `/${defaultPath}`);

  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: TIMEOUTS.nav });
  await page.waitForTimeout(300);
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

  snapshot.rolesTable = await page
    .locator(SELECTORS.userRolesTable)
    .isVisible({ timeout: TIMEOUTS.quickMarker })
    .catch(() => false);
  return snapshot;
}

async function markerSnapshot(page) {
  const snapshot = await checkPortalMarkers(page);
  return {
    member: snapshot.member,
    agent: snapshot.agent,
    staff: snapshot.staff,
    admin: snapshot.admin,
  };
}

function markerSummary(route, markerState) {
  return `${route} => member=${markerState.member}, agent=${markerState.agent}, staff=${markerState.staff}, admin=${markerState.admin}`;
}

function markersToString(markers) {
  return `member=${markers.member}, agent=${markers.agent}, staff=${markers.staff}, admin=${markers.admin}, notFound=${markers.notFound}, rolesTable=${markers.rolesTable}`;
}

async function waitForReadyMarker(page, timeoutMs) {
  const start = Date.now();
  let observed = await checkPortalMarkers(page);
  while (Date.now() - start < timeoutMs) {
    const hasReadyMarker =
      observed.notFound || observed.member || observed.agent || observed.staff || observed.admin;
    if (hasReadyMarker) break;
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
  await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUTS.nav });
  const observed = await waitForReadyMarker(page, 10_000);
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
    if (preferredMarker && current[preferredMarker]) break;
    if (Object.values(current).some(Boolean)) break;
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

async function removeRoleFromTable(page, roleName) {
  const table = page.locator(SELECTORS.userRolesTable);
  const rolePattern = new RegExp(`\\b${roleName}\\b`, 'i');
  const matchingRows = table.locator('tr', { hasText: rolePattern });
  const count = await matchingRows.count();
  if (count === 0) return false;
  const targetRow = matchingRows.first();
  await targetRow.getByRole('button', { name: SELECTORS.removeRoleButtonName }).click();
  await page.waitForTimeout(800);
  return true;
}

async function addRole(page, roleName) {
  const trigger = page.locator(SELECTORS.roleSelectTrigger);
  await trigger.waitFor({ state: 'visible', timeout: TIMEOUTS.action });
  await trigger.click();

  const roleOption = page.locator(`[data-testid="role-option-${roleName}"]`);
  const opened = await Promise.race([
    page
      .locator(SELECTORS.roleSelectContent)
      .isVisible({ timeout: TIMEOUTS.action })
      .catch(() => false),
    roleOption.isVisible({ timeout: TIMEOUTS.action }).catch(() => false),
  ]);

  if (!opened) {
    throw new Error(`ROLE_SELECT_NOT_OPEN role=${roleName}`);
  }

  await roleOption.click({ timeout: TIMEOUTS.action });
  await page.getByRole('button', { name: SELECTORS.grantRoleButtonName }).click();
  await page.waitForTimeout(1200);
}

module.exports = {
  checkResult,
  envFlag,
  roleMarkerForAccount,
  resolvePlaywright,
  buildRoute,
  buildRouteAllowingLocalePath,
  sleep,
  loginAs,
  checkPortalMarkers,
  markerSnapshot,
  markerSummary,
  markersToString,
  waitForReadyMarker,
  compareExpectedMarkers,
  assertUrlMarkers,
  collectMarkersWithWait,
  expectedMatrixForAccount,
  removeRoleFromTable,
  addRole,
};
