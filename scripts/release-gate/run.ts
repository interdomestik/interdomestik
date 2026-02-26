#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  DEFAULTS,
  SUITES,
  ROUTES,
  MARKERS,
  SELECTORS,
  TIMEOUTS,
  ACCOUNTS,
  REQUIRED_ENV_BY_SUITE,
  EXPECTED_VERCEL_LOG_NOISE,
  FUNCTIONAL_LOG_ERROR_HINTS,
} = require('./config.ts');
const { writeReleaseGateReport } = require('./report.ts');
const {
  assertUrlMarkers,
  buildRoute,
  buildRouteAllowingLocalePath,
  checkResult,
  collectMarkersWithWait,
  computeRetryDelayMs,
  createAuthState,
  envFlag,
  expectedMatrixForAccount,
  getMissingEnv,
  loginAs,
  markerSnapshot,
  markerSummary,
  markersToString,
  normalizeBaseUrl,
  parseRetryAfterSeconds,
  resolvePlaywright,
  sessionCacheKeyForAccount,
  sleep,
  waitForReadyMarker,
} = require('./shared.ts');

const VERCEL_LOG_STREAM_TIMEOUT_MS = 12_000;
const AUTH_PREFLIGHT_TIMEOUT_MS = 8_000;
const AUTH_PREFLIGHT_MAX_ATTEMPTS = 3;
const AUTH_PREFLIGHT_BACKOFF_MS = [500, 1_500, 3_000];
const AUTH_PREFLIGHT_ACCEPTED_STATUSES = new Set([200, 204, 400, 401, 403, 404, 405, 429]);
const LOGIN_DEPENDENT_CHECKS = new Set([
  'P0.1',
  'P0.2',
  'P0.3',
  'P0.4',
  'P0.6',
  'P1.1',
  'P1.2',
  'P1.3',
]);
const INFRA_NETWORK_ERROR_PATTERNS = [
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /Timeout \d+ms exceeded/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /ECONNRESET/i,
  /socket hang up/i,
  /AUTH_LOGIN_NETWORK_ERROR/i,
];

function isLegacyVercelLogsArgsUnsupported(output) {
  return /unknown or unexpected option:\s*--environment/i.test(String(output || ''));
}

function parseVercelRuntimeJsonLines(raw) {
  const entries = [];
  for (const line of String(raw || '')
    .split('\n')
    .map(value => value.trim())
    .filter(Boolean)) {
    try {
      const payload = JSON.parse(line);
      entries.push(payload);
    } catch {
      // Ignore non-JSON banner/noise lines in mixed output streams.
    }
  }
  return entries;
}

function runtimeEntryMessage(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(entry.message || entry.text || entry.msg || '').trim();
}

function runtimeEntryLevel(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(entry.level || entry.severity || '')
    .trim()
    .toLowerCase();
}

function isErrorRuntimeLevel(level) {
  return level === 'error' || level === 'fatal';
}

function compactErrorMessage(raw, maxLength = 420) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function classifyInfraNetworkFailure(raw) {
  const message = compactErrorMessage(raw, 650);
  if (!message) return null;
  const matched = INFRA_NETWORK_ERROR_PATTERNS.some(pattern => pattern.test(message));
  return matched ? message : null;
}

function isLoginDependentCheck(checkId) {
  return LOGIN_DEPENDENT_CHECKS.has(checkId);
}

function resolveTenantOverrideProbeUrl(runCtx) {
  const configured = String(process.env.RELEASE_GATE_MK_USER_URL || '').trim();
  if (configured) {
    return {
      source: 'env',
      url: /^https?:\/\//i.test(configured)
        ? configured
        : buildRouteAllowingLocalePath(runCtx.baseUrl, runCtx.locale, configured),
    };
  }

  const fallbackPath =
    ROUTES.tenantOverrideProbeFallback || '/admin/users/golden_mk_staff?tenantId=tenant_mk';
  return {
    source: 'fallback',
    url: buildRoute(runCtx.baseUrl, runCtx.locale, fallbackPath),
  };
}

function parseBooleanEnv(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function shouldDisallowSkippedChecks(envName) {
  const explicit = parseBooleanEnv(process.env.RELEASE_GATE_DISALLOW_SKIP);
  if (explicit != null) return explicit;
  return String(envName || '').toLowerCase() === 'production';
}

function enforceNoSkipOnSelectedChecks(checks, selected, envName) {
  if (!shouldDisallowSkippedChecks(envName)) {
    return checks;
  }

  const selectedSet = new Set(selected);
  const byId = new Map(checks.map(check => [check.id, check]));

  for (const checkId of selected) {
    const check = byId.get(checkId);
    if (!check) {
      byId.set(
        checkId,
        checkResult(
          checkId,
          'FAIL',
          [`skip_policy=disallowed env=${envName}`, 'execution_result=missing'],
          [`${checkId}_NOT_EXECUTED`]
        )
      );
      continue;
    }

    if (check.status === 'SKIPPED') {
      const signatures = Array.from(
        new Set([...(check.signatures || []), `${checkId}_SKIPPED_NOT_ALLOWED`])
      );
      byId.set(checkId, {
        ...check,
        status: 'FAIL',
        evidence: [...(check.evidence || []), `skip_policy=disallowed env=${envName}`],
        signatures,
      });
    }
  }

  const normalized = [];
  for (const checkId of selected) {
    const check = byId.get(checkId);
    if (check) normalized.push(check);
  }
  for (const check of checks) {
    if (!selectedSet.has(check.id)) normalized.push(check);
  }
  return normalized;
}

function preflightEvidenceLine({ endpoint, attempt, status, message }) {
  if (typeof status === 'number') {
    return `auth_preflight endpoint=${endpoint} attempt=${attempt} status=${status}`;
  }
  return `auth_preflight endpoint=${endpoint} attempt=${attempt} transport_error=${compactErrorMessage(message)}`;
}

async function runAuthEndpointPreflight(runCtx) {
  const evidence = [];
  const signatures = [];
  const origin = new URL(runCtx.baseUrl).origin;
  const endpointPaths = [
    '/api/auth/get-session?disableCookieCache=true&disableRefresh=true',
    '/api/auth/sign-in/email',
  ];

  for (const endpointPath of endpointPaths) {
    const endpoint = `${origin}${endpointPath}`;
    let reached = false;

    for (let attempt = 1; attempt <= AUTH_PREFLIGHT_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Origin: origin,
            Referer: `${origin}/${runCtx.locale}/login`,
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(AUTH_PREFLIGHT_TIMEOUT_MS),
        });

        evidence.push(preflightEvidenceLine({ endpoint, attempt, status: response.status }));
        if (AUTH_PREFLIGHT_ACCEPTED_STATUSES.has(response.status)) {
          reached = true;
          break;
        }

        signatures.push(
          `AUTH_PREFLIGHT_ENDPOINT_UNHEALTHY endpoint=${endpointPath} status=${response.status}`
        );
        return { status: 'FAIL', evidence, signatures };
      } catch (error) {
        const message = compactErrorMessage(error?.message || error);
        evidence.push(preflightEvidenceLine({ endpoint, attempt, message }));
        const infraMessage = classifyInfraNetworkFailure(message);

        if (infraMessage && attempt < AUTH_PREFLIGHT_MAX_ATTEMPTS) {
          const delay =
            AUTH_PREFLIGHT_BACKOFF_MS[Math.min(attempt - 1, AUTH_PREFLIGHT_BACKOFF_MS.length - 1)];
          await sleep(delay);
          continue;
        }

        if (infraMessage) {
          signatures.push(
            `AUTH_PREFLIGHT_INFRA_NETWORK endpoint=${endpointPath} message=${infraMessage}`
          );
        } else {
          signatures.push(`AUTH_PREFLIGHT_EXCEPTION endpoint=${endpointPath} message=${message}`);
        }
        return { status: 'FAIL', evidence, signatures };
      }
    }

    if (!reached) {
      signatures.push(`AUTH_PREFLIGHT_INFRA_NETWORK endpoint=${endpointPath} message=exhausted`);
      return { status: 'FAIL', evidence, signatures };
    }
  }

  return { status: 'PASS', evidence, signatures };
}

function parseArgs(argv) {
  const parsed = {
    baseUrl: DEFAULTS.baseUrl,
    envName: DEFAULTS.envName,
    locale: DEFAULTS.locale,
    suite: DEFAULTS.suite,
    outDir: DEFAULTS.outDir,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--baseUrl' && next) {
      parsed.baseUrl = next;
      i += 1;
      continue;
    }
    if (token === '--envName' && next) {
      parsed.envName = next;
      i += 1;
      continue;
    }
    if (token === '--locale' && next) {
      parsed.locale = next;
      i += 1;
      continue;
    }
    if (token === '--suite' && next) {
      parsed.suite = next.toLowerCase();
      i += 1;
      continue;
    }
    if (token === '--outDir' && next) {
      parsed.outDir = next;
      i += 1;
      continue;
    }
    if (token === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  if (!SUITES[parsed.suite]) {
    console.error(
      `[release-gate] Unsupported suite "${parsed.suite}". Use one of: ${Object.keys(SUITES).join(', ')}`
    );
    process.exit(2);
  }

  return parsed;
}

function printHelp() {
  const lines = [
    'Release Gate runner',
    '',
    'Flags:',
    `  --baseUrl  (default: ${DEFAULTS.baseUrl})`,
    `  --envName  (default: ${DEFAULTS.envName})`,
    `  --locale   (default: ${DEFAULTS.locale})`,
    `  --suite    (default: ${DEFAULTS.suite}; options: ${Object.keys(SUITES).join('|')})`,
    `  --outDir   (default: ${DEFAULTS.outDir})`,
  ];
  console.log(lines.join('\n'));
}

async function runP01(browser, runCtx) {
  const accounts = ['member', 'agent', 'staff', 'admin_ks'];
  const evidence = [];
  const failures = [];
  let memberDriftSignatureAdded = false;

  for (const account of accounts) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAs(page, {
        account,
        credentials: runCtx.credentials[account],
        baseUrl: runCtx.baseUrl,
        locale: runCtx.locale,
        authState: runCtx.authState,
      });

      const matrix = expectedMatrixForAccount(account);
      for (const portal of ROUTES.rbacTargets) {
        const route = `/${portal}`;
        await page.goto(buildRoute(runCtx.baseUrl, runCtx.locale, route), {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.nav,
        });
        await page.waitForTimeout(450);

        const current = await collectMarkersWithWait(page, matrix.canonical);
        evidence.push(`${account} ${markerSummary(route, current)}`);

        if (
          account === 'member' &&
          portal === 'member' &&
          current.member === true &&
          (current.agent === true || current.staff === true || current.admin === true) &&
          !memberDriftSignatureAdded
        ) {
          memberDriftSignatureAdded = true;
          failures.push(
            `P0.1_MISCONFIG_MEMBER_ROLE_DRIFT account=member route=/${runCtx.locale}${route} visible=${JSON.stringify(current)}`
          );
        }

        if (portal === matrix.canonical && current[matrix.canonical] !== true) {
          failures.push(
            `P0.1_RBAC_CANONICAL_MARKER_MISSING account=${account} route=/${runCtx.locale}${route} expected=${matrix.canonical} visible=${JSON.stringify(current)}`
          );
        }

        const unexpectedVisible = matrix.absentOnAllRoutes.filter(key => current[key] === true);
        if (unexpectedVisible.length > 0) {
          failures.push(
            `P0.1_RBAC_MARKER_MISMATCH account=${account} route=/${runCtx.locale}${route} must_absent=${unexpectedVisible.join(',')} visible=${JSON.stringify(current)}`
          );
        }
      }
    } catch (error) {
      failures.push(`P0.1_EXCEPTION account=${account} message=${String(error.message || error)}`);
    } finally {
      await context.close();
    }
  }

  return checkResult('P0.1', failures.length ? 'FAIL' : 'PASS', evidence, failures);
}

async function runP02(browser, runCtx) {
  const evidence = [];
  const failures = [];
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAs(page, {
      account: 'admin_mk',
      credentials: runCtx.credentials.admin_mk,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
      authState: runCtx.authState,
    });

    const route = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.crossTenantProbe);
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
    await page.waitForTimeout(500);

    const notFoundVisible = await page
      .getByTestId(MARKERS.notFound)
      .isVisible({ timeout: TIMEOUTS.quickMarker })
      .catch(() => false);
    const rolesTableVisible = await page
      .locator(SELECTORS.userRolesTable)
      .isVisible({ timeout: TIMEOUTS.quickMarker })
      .catch(() => false);

    evidence.push(
      `route=${route} not-found-page=${notFoundVisible} user-roles-table=${rolesTableVisible}`
    );

    if (!notFoundVisible && rolesTableVisible) {
      failures.push(
        `P0.2_CROSS_TENANT_BREACH route=/${runCtx.locale}${ROUTES.crossTenantProbe} not_found=${notFoundVisible} roles_table=${rolesTableVisible}`
      );
    }
  } catch (error) {
    failures.push(`P0.2_EXCEPTION message=${String(error.message || error)}`);
  } finally {
    await context.close();
  }
  return checkResult('P0.2', failures.length ? 'FAIL' : 'PASS', evidence, failures);
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
      .waitFor({ state: 'visible', timeout: TIMEOUTS.action })
      .then(() => true)
      .catch(() => false),
    roleOption
      .waitFor({ state: 'visible', timeout: TIMEOUTS.action })
      .then(() => true)
      .catch(() => false),
  ]);

  if (!opened) {
    await trigger.click().catch(() => {});
    await roleOption.waitFor({ state: 'visible', timeout: TIMEOUTS.action });
  }

  await page.locator(`[data-testid="role-option-${roleName}"]`).click();
  await page.getByRole('button', { name: SELECTORS.grantRoleButtonName }).click();
  await page.waitForTimeout(1200);
}

async function runP03AndP04(browser, runCtx) {
  const roleToToggle = String(process.env.RELEASE_GATE_ROLE || 'promoter')
    .trim()
    .toLowerCase();
  const evidenceP03 = [];
  const evidenceP04 = [];
  const failuresP03 = [];
  const failuresP04 = [];

  const context = await browser.newContext();
  const page = await context.newPage();

  const targetFromEnv = process.env.RELEASE_GATE_TARGET_USER_URL;
  const hasExplicitTarget = typeof targetFromEnv === 'string' && targetFromEnv.trim().length > 0;
  const defaultTarget = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.defaultAdminUserUrl);
  const targetUrl =
    targetFromEnv && targetFromEnv.startsWith('http')
      ? targetFromEnv
      : targetFromEnv
        ? buildRoute(runCtx.baseUrl, runCtx.locale, targetFromEnv)
        : defaultTarget;

  async function waitForRolePanelVisible(timeoutMs = TIMEOUTS.nav) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const triggerVisible = await page
        .locator(SELECTORS.roleSelectTrigger)
        .isVisible({ timeout: TIMEOUTS.quickMarker })
        .catch(() => false);
      if (triggerVisible) return true;

      const tableVisible = await page
        .locator(SELECTORS.userRolesTable)
        .isVisible({ timeout: TIMEOUTS.quickMarker })
        .catch(() => false);
      if (tableVisible) {
        const grantVisible = await page
          .getByRole('button', { name: SELECTORS.grantRoleButtonName })
          .isVisible({ timeout: TIMEOUTS.quickMarker })
          .catch(() => false);
        if (grantVisible) return true;
      }

      await sleep(300);
    }

    return false;
  }

  async function tryRolePanelTarget(targetUrl) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
    const visible = await waitForRolePanelVisible(TIMEOUTS.nav);
    return visible ? page.url() : null;
  }

  async function ensureRolePanelLoaded(initialTargetUrl) {
    const initialResolved = await tryRolePanelTarget(initialTargetUrl).catch(() => null);
    if (initialResolved) return initialResolved;

    // CI may provide a tenant-scoped explicit target that is intentionally inaccessible.
    // In that case, do not mutate fallback users; allow caller to skip/fail via policy.
    if (hasExplicitTarget) return null;

    const fallbackSeedTargets = [
      defaultTarget,
      buildRoute(runCtx.baseUrl, runCtx.locale, '/admin/users/pack_ks_staff_extra'),
      buildRoute(runCtx.baseUrl, runCtx.locale, '/admin/users/golden_ks_a_member_1'),
    ];
    const uniqueTargets = [...new Set(fallbackSeedTargets.filter(Boolean))];

    for (const target of uniqueTargets) {
      const resolved = await tryRolePanelTarget(target).catch(() => null);
      if (resolved) return resolved;
    }

    await page.goto(buildRoute(runCtx.baseUrl, runCtx.locale, '/admin/users'), {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.nav,
    });
    await page
      .getByTestId('admin-users-page')
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.nav })
      .catch(() => {});

    const profileHrefs = await page
      .$$eval('a[href*="/admin/users/"]', anchors =>
        anchors
          .map(anchor => anchor.getAttribute('href'))
          .filter(Boolean)
          .slice(0, 8)
      )
      .catch(() => []);

    for (const href of profileHrefs) {
      const candidateUrl = buildRouteAllowingLocalePath(runCtx.baseUrl, runCtx.locale, href);
      const resolved = await tryRolePanelTarget(candidateUrl).catch(() => null);
      if (resolved) return resolved;
    }

    return null;
  }

  try {
    await loginAs(page, {
      account: 'admin_ks',
      credentials: runCtx.credentials.admin_ks,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
      authState: runCtx.authState,
    });

    const resolvedTarget = await ensureRolePanelLoaded(targetUrl);
    if (!resolvedTarget) {
      const requireRolePanel = process.env.RELEASE_GATE_REQUIRE_ROLE_PANEL !== 'false';
      if (!requireRolePanel) {
        const reason = `role_panel_unavailable target=${targetUrl} (RELEASE_GATE_REQUIRE_ROLE_PANEL=false)`;
        evidenceP03.push(reason);
        evidenceP04.push(reason);
        return [
          checkResult('P0.3', 'SKIPPED', evidenceP03, []),
          checkResult('P0.4', 'SKIPPED', evidenceP04, []),
        ];
      }
      failuresP03.push(`P0.3_ROLE_PANEL_UNAVAILABLE target=${targetUrl}`);
      failuresP04.push(`P0.4_ROLE_PANEL_UNAVAILABLE target=${targetUrl}`);
      return [
        checkResult('P0.3', 'FAIL', evidenceP03, failuresP03),
        checkResult('P0.4', 'FAIL', evidenceP04, failuresP04),
      ];
    }
    await page
      .locator(SELECTORS.roleSelectTrigger)
      .waitFor({ state: 'visible', timeout: TIMEOUTS.marker });

    let cleanupCount = 0;
    while (cleanupCount < 4) {
      const removed = await removeRoleFromTable(page, roleToToggle);
      if (!removed) break;
      cleanupCount += 1;
    }
    evidenceP03.push(`target=${resolvedTarget}`);
    evidenceP03.push(`pre-clean removed_existing_role_entries=${cleanupCount}`);

    await addRole(page, roleToToggle);
    const afterAddStart = Date.now();
    let afterAdd = false;
    while (Date.now() - afterAddStart < TIMEOUTS.marker) {
      afterAdd = await page
        .locator(SELECTORS.userRolesTable)
        .getByText(new RegExp(`\\b${roleToToggle}\\b`, 'i'))
        .isVisible({ timeout: TIMEOUTS.quickMarker })
        .catch(() => false);
      if (afterAdd) break;
      await sleep(300);
    }
    evidenceP03.push(`added_role=${roleToToggle} visible_in_roles_table=${afterAdd}`);
    if (!afterAdd) {
      failuresP03.push(`P0.3_ROLE_ADD_FAILED role=${roleToToggle} target=${resolvedTarget}`);
    }

    const removedAddedRole = await removeRoleFromTable(page, roleToToggle);
    if (!removedAddedRole) {
      failuresP04.push(
        `P0.4_ROLE_REMOVE_CLICK_FAILED role=${roleToToggle} target=${resolvedTarget}`
      );
    }

    const removalStart = Date.now();
    let stillVisible = true;
    while (Date.now() - removalStart < TIMEOUTS.marker) {
      stillVisible = await page
        .locator(SELECTORS.userRolesTable)
        .getByText(new RegExp(`\\b${roleToToggle}\\b`, 'i'))
        .isVisible({ timeout: TIMEOUTS.quickMarker })
        .catch(() => false);
      if (!stillVisible) break;
      await sleep(300);
    }
    evidenceP04.push(`removed_role=${roleToToggle} remaining_in_roles_table=${stillVisible}`);
    if (stillVisible) {
      failuresP04.push(`P0.4_ROLE_REMOVE_FAILED role=${roleToToggle} target=${resolvedTarget}`);
    }
  } catch (error) {
    failuresP03.push(`P0.3_EXCEPTION message=${String(error.message || error)}`);
    failuresP04.push(`P0.4_EXCEPTION message=${String(error.message || error)}`);
  } finally {
    await context.close();
  }

  return [
    checkResult('P0.3', failuresP03.length ? 'FAIL' : 'PASS', evidenceP03, failuresP03),
    checkResult('P0.4', failuresP04.length ? 'FAIL' : 'PASS', evidenceP04, failuresP04),
  ];
}

async function runP06(browser, runCtx) {
  const failures = [];
  const evidence = [];
  const scenarios = [];

  async function withAccount(accountKey, fn) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAs(page, {
        account: accountKey,
        credentials: runCtx.credentials[accountKey],
        baseUrl: runCtx.baseUrl,
        locale: runCtx.locale,
        authState: runCtx.authState,
      });
      return await fn(page);
    } finally {
      await context.close();
    }
  }

  function recordScenario(scenario) {
    scenarios.push(scenario);
    evidence.push(
      `${scenario.id} ${scenario.title} result=${scenario.result} account=${scenario.account}`
    );
    evidence.push(`  url=${scenario.urls.join(' | ')}`);
    evidence.push(`  expected=${scenario.expectedSummary}`);
    evidence.push(`  observed=${scenario.observedSummary}`);
    if (scenario.failureSignature) {
      evidence.push(`  signature=${scenario.failureSignature}`);
    }
  }

  function mismatchSignatureFor(id, mismatch) {
    return `P0.6_${id}_MARKER_MISMATCH ${mismatch}`;
  }

  async function runSimpleScenario(input) {
    const { id, title, accountKey, route, expected } = input;
    try {
      const result = await withAccount(accountKey, async page =>
        assertUrlMarkers(
          page,
          `${id} ${title}`,
          buildRoute(runCtx.baseUrl, runCtx.locale, route),
          expected
        )
      );
      const mismatch = result.mismatches[0] || '';
      const failureSignature = mismatch ? mismatchSignatureFor(id, mismatch) : '';
      if (failureSignature) failures.push(failureSignature);
      recordScenario({
        id,
        title,
        account: accountKey,
        urls: [result.url],
        expectedSummary: markersToString({
          ...{
            member: '-',
            agent: '-',
            staff: '-',
            admin: '-',
            notFound: '-',
            rolesTable: '-',
          },
          ...expected,
        }),
        observedSummary: markersToString(result.observed),
        result: result.status,
        failureSignature,
      });
    } catch (error) {
      const failureSignature = `P0.6_${id}_EXCEPTION message=${String(error.message || error)}`;
      failures.push(failureSignature);
      recordScenario({
        id,
        title,
        account: accountKey,
        urls: [buildRoute(runCtx.baseUrl, runCtx.locale, route)],
        expectedSummary: JSON.stringify(expected),
        observedSummary: 'exception',
        result: 'FAIL',
        failureSignature,
      });
    }
  }

  await withAccount('agent', async page => {
    const urls = ['/member', '/agent', '/staff', '/admin'].map(route =>
      buildRoute(runCtx.baseUrl, runCtx.locale, route)
    );
    const checks = [
      { url: urls[0], expected: { member: true } },
      { url: urls[1], expected: { agent: true } },
      { url: urls[2], expected: { staff: false } },
      { url: urls[3], expected: { admin: false } },
    ];
    const observedRows = [];
    const mismatches = [];
    for (const check of checks) {
      const result = await assertUrlMarkers(page, 'S1', check.url, check.expected);
      observedRows.push(`${check.url} => ${markersToString(result.observed)}`);
      for (const mismatch of result.mismatches) {
        mismatches.push(mismatch);
      }
    }
    const failureSignature = mismatches[0] ? mismatchSignatureFor('S1', mismatches[0]) : '';
    if (failureSignature) failures.push(failureSignature);
    recordScenario({
      id: 'S1',
      title: 'Mixed roles: member+agent',
      account: 'agent',
      urls,
      expectedSummary:
        '/member member=true; /agent agent=true; /staff staff=false; /admin admin=false',
      observedSummary: observedRows.join(' || '),
      result: failureSignature ? 'FAIL' : 'PASS',
      failureSignature,
    });
  }).catch(error => {
    const failureSignature = `P0.6_S1_EXCEPTION message=${String(error.message || error)}`;
    failures.push(failureSignature);
    recordScenario({
      id: 'S1',
      title: 'Mixed roles: member+agent',
      account: 'agent',
      urls: ['/member', '/agent', '/staff', '/admin'].map(route =>
        buildRoute(runCtx.baseUrl, runCtx.locale, route)
      ),
      expectedSummary:
        '/member member=true; /agent agent=true; /staff staff=false; /admin admin=false',
      observedSummary: 'exception',
      result: 'FAIL',
      failureSignature,
    });
  });

  await withAccount('staff', async page => {
    const urls = ['/member', '/staff', '/agent', '/admin'].map(route =>
      buildRoute(runCtx.baseUrl, runCtx.locale, route)
    );
    const checks = [
      { url: urls[0], expected: { member: true } },
      { url: urls[1], expected: { staff: true } },
      { url: urls[2], expected: { agent: false } },
      { url: urls[3], expected: { admin: false } },
    ];
    const observedRows = [];
    const mismatches = [];
    for (const check of checks) {
      const result = await assertUrlMarkers(page, 'S2', check.url, check.expected);
      observedRows.push(`${check.url} => ${markersToString(result.observed)}`);
      for (const mismatch of result.mismatches) {
        mismatches.push(mismatch);
      }
    }
    const failureSignature = mismatches[0] ? mismatchSignatureFor('S2', mismatches[0]) : '';
    if (failureSignature) failures.push(failureSignature);
    recordScenario({
      id: 'S2',
      title: 'Mixed roles: member+staff',
      account: 'staff',
      urls,
      expectedSummary:
        '/member member=true; /staff staff=true; /agent agent=false; /admin admin=false',
      observedSummary: observedRows.join(' || '),
      result: failureSignature ? 'FAIL' : 'PASS',
      failureSignature,
    });
  }).catch(error => {
    const failureSignature = `P0.6_S2_EXCEPTION message=${String(error.message || error)}`;
    failures.push(failureSignature);
    recordScenario({
      id: 'S2',
      title: 'Mixed roles: member+staff',
      account: 'staff',
      urls: ['/member', '/staff', '/agent', '/admin'].map(route =>
        buildRoute(runCtx.baseUrl, runCtx.locale, route)
      ),
      expectedSummary:
        '/member member=true; /staff staff=true; /agent agent=false; /admin admin=false',
      observedSummary: 'exception',
      result: 'FAIL',
      failureSignature,
    });
  });

  try {
    await withAccount('agent', async page => {
      const url = buildRoute(runCtx.baseUrl, runCtx.locale, '/admin/users/golden_ks_staff');
      const result = await assertUrlMarkers(page, 'S3', url, { rolesTable: false });
      const allowed = result.observed.notFound || !result.observed.admin;
      const passes = allowed && result.observed.rolesTable === false;
      const failureSignature = passes
        ? ''
        : `P0.6_S3_MARKER_MISMATCH expected (notFound=true OR admin=false) AND rolesTable=false got ${markersToString(result.observed)}`;
      if (failureSignature) failures.push(failureSignature);
      recordScenario({
        id: 'S3',
        title: 'Agent elevation attempt -> admin resource',
        account: 'agent',
        urls: [url],
        expectedSummary: '(notFound=true OR admin=false) AND rolesTable=false',
        observedSummary: markersToString(result.observed),
        result: passes ? 'PASS' : 'FAIL',
        failureSignature,
      });
    });
  } catch (error) {
    const failureSignature = `P0.6_S3_EXCEPTION message=${String(error.message || error)}`;
    failures.push(failureSignature);
    recordScenario({
      id: 'S3',
      title: 'Agent elevation attempt -> admin resource',
      account: 'agent',
      urls: [buildRoute(runCtx.baseUrl, runCtx.locale, '/admin/users/golden_ks_staff')],
      expectedSummary: '(notFound=true OR admin=false) AND rolesTable=false',
      observedSummary: 'exception',
      result: 'FAIL',
      failureSignature,
    });
  }

  await runSimpleScenario({
    id: 'S4',
    title: 'Staff elevation attempt -> agent portal',
    accountKey: 'staff',
    route: '/agent',
    expected: { agent: false },
  });

  {
    const s5Probe = resolveTenantOverrideProbeUrl(runCtx);
    try {
      await withAccount('admin_ks', async page => {
        const result = await assertUrlMarkers(page, 'S5', s5Probe.url, {});
        const passes = result.observed.notFound || result.observed.rolesTable === false;
        const failureSignature = passes
          ? ''
          : `P0.6_S5_MARKER_MISMATCH expected (notFound=true OR rolesTable=false) got ${markersToString(result.observed)}`;
        if (failureSignature) failures.push(failureSignature);
        recordScenario({
          id: 'S5',
          title: 'Tenant override injection',
          account: 'admin_ks',
          urls: [s5Probe.url],
          expectedSummary: 'notFound=true OR rolesTable=false',
          observedSummary: `source=${s5Probe.source} ${markersToString(result.observed)}`,
          result: failureSignature ? 'FAIL' : 'PASS',
          failureSignature,
        });
      });
    } catch (error) {
      const failureSignature = `P0.6_S5_EXCEPTION message=${String(error.message || error)}`;
      failures.push(failureSignature);
      recordScenario({
        id: 'S5',
        title: 'Tenant override injection',
        account: 'admin_ks',
        urls: [s5Probe.url],
        expectedSummary: 'notFound=true OR rolesTable=false',
        observedSummary: `source=${s5Probe.source} exception`,
        result: 'FAIL',
        failureSignature,
      });
    }
  }

  try {
    await withAccount('agent', async page => {
      const url = buildRoute(runCtx.baseUrl, runCtx.locale, '/agent');
      await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUTS.nav });
      await waitForReadyMarker(page, 10_000);
      const candidateSelectors = [
        '[data-testid="session-roles"]',
        '[data-testid="session-role"]',
        '[data-testid="user-roles"]',
        '[data-testid="roles-indicator"]',
      ];
      let indicator = '';
      for (const selector of candidateSelectors) {
        const visible = await page
          .locator(selector)
          .first()
          .isVisible({ timeout: TIMEOUTS.quickMarker })
          .catch(() => false);
        if (!visible) continue;
        indicator = (
          await page
            .locator(selector)
            .first()
            .innerText()
            .catch(() => '')
        ).trim();
        if (indicator) break;
      }
      recordScenario({
        id: 'S6',
        title: 'Roles payload sanity (INFO only)',
        account: 'agent',
        urls: [url],
        expectedSummary: 'INFO capture if visible',
        observedSummary: indicator || 'INFO: roles indicator not exposed',
        result: 'INFO',
      });
    });
  } catch (error) {
    recordScenario({
      id: 'S6',
      title: 'Roles payload sanity (INFO only)',
      account: 'agent',
      urls: [buildRoute(runCtx.baseUrl, runCtx.locale, '/agent')],
      expectedSummary: 'INFO capture if visible',
      observedSummary: `INFO: capture failed (${String(error.message || error)})`,
      result: 'INFO',
    });
  }

  await runSimpleScenario({
    id: 'S7',
    title: 'Admin != Staff',
    accountKey: 'admin_ks',
    route: '/staff',
    expected: { staff: false },
  });

  await runSimpleScenario({
    id: 'S8',
    title: 'Admin != Agent',
    accountKey: 'admin_ks',
    route: '/agent',
    expected: { agent: false },
  });

  await runSimpleScenario({
    id: 'S9',
    title: 'Staff != Agent (explicit pairwise)',
    accountKey: 'staff',
    route: '/agent',
    expected: { agent: false },
  });

  const result = checkResult('P0.6', failures.length > 0 ? 'FAIL' : 'PASS', evidence, failures);
  result.scenarios = scenarios;
  return result;
}

async function runP11AndP12(browser, runCtx) {
  const evidenceP11 = [];
  const signaturesP11 = [];
  const evidenceP12 = [];
  const signaturesP12 = [];

  const now = Date.now();
  const uploadName = `gate-upload-${now}.pdf`;
  const uploadPath = path.join(os.tmpdir(), uploadName);
  // Minimal valid PDF payload to satisfy strict bucket MIME policies.
  const uploadPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 20 100 Td (release-gate) Tj ET
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`;
  fs.writeFileSync(uploadPath, uploadPdf, 'utf8');

  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const clientSignals = [];
  const pushClientSignal = signal => {
    if (clientSignals.length < 10 && signal) {
      clientSignals.push(String(signal).slice(0, 400));
    }
  };
  let signedUploadStatuses = [];
  let documentsDownloadStatuses = [];
  let persistenceAfterRefresh = false;
  let persistenceAfterRelogin = false;
  const requireMemberUpload = envFlag('RELEASE_GATE_REQUIRE_MEMBER_UPLOAD', true);
  const waitForUploadedFileVisible = async (targetPage, options = {}) => {
    const timeoutMs = Number(options.timeoutMs ?? TIMEOUTS.upload);
    const reloadBetweenAttempts = options.reloadBetweenAttempts === true;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const isVisible = await targetPage
        .getByText(uploadName)
        .first()
        .isVisible({ timeout: TIMEOUTS.quickMarker })
        .catch(() => false);
      if (isVisible) {
        return true;
      }

      if (reloadBetweenAttempts) {
        await targetPage
          .reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav })
          .catch(() => {});
      } else {
        await targetPage.waitForTimeout(450);
      }
    }

    return false;
  };

  page.on('response', response => {
    const url = response.url();
    if (url.includes('/storage/v1/object/upload/sign/')) {
      signedUploadStatuses.push(`${response.status()}@${url}`);
    }
    if (url.includes('/api/documents/') && url.includes('/download')) {
      documentsDownloadStatuses.push(`${response.status()}@${url}`);
    }
  });
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (
      type === 'error' ||
      /upload flow error|storage upload unavailable|failed to generate upload url|mime type|supabase/i.test(
        text
      )
    ) {
      pushClientSignal(`console.${type}: ${text}`);
    }
  });
  page.on('pageerror', error => {
    pushClientSignal(`pageerror: ${String(error.message || error)}`);
  });

  try {
    await loginAs(page, {
      account: 'member',
      credentials: runCtx.credentials.member,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
      authState: runCtx.authState,
    });

    const docsUrl = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.memberDocuments);
    await page.goto(docsUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
    const uploadButtons = page.locator(SELECTORS.memberDocumentsUploadButtons);
    const uploadButtonsCount = await uploadButtons.count();
    evidenceP11.push(`member documents upload button count=${uploadButtonsCount}`);
    if (uploadButtonsCount === 0) {
      if (requireMemberUpload) {
        signaturesP11.push(
          'P1.1_MISCONFIG_MEMBER_UPLOAD_PRECONDITION_NOT_MET reason=no_upload_entry_buttons'
        );
        return [
          checkResult('P1.1', 'FAIL', evidenceP11, signaturesP11),
          checkResult('P1.2', 'SKIPPED', evidenceP12, [
            'P1.2_SKIPPED_DEPENDENCY_P1.1_MEMBER_UPLOAD_PRECONDITION',
          ]),
        ];
      }
      return [
        checkResult('P1.1', 'SKIPPED', evidenceP11, [
          'P1.1_SKIPPED_MEMBER_UPLOAD_PRECONDITION_NOT_MET',
        ]),
        checkResult('P1.2', 'SKIPPED', evidenceP12, [
          'P1.2_SKIPPED_DEPENDENCY_P1.1_MEMBER_UPLOAD_PRECONDITION',
        ]),
      ];
    }

    const uploadButton = uploadButtons.first();
    let uploadDialogOpened = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await uploadButton.scrollIntoViewIfNeeded().catch(() => {});
      await uploadButton.click({ timeout: TIMEOUTS.action }).catch(() => {});
      uploadDialogOpened = await page
        .locator(SELECTORS.fileInput)
        .isVisible({ timeout: TIMEOUTS.action })
        .catch(() => false);
      if (uploadDialogOpened) break;
      await sleep(400);
    }
    evidenceP11.push(`upload dialog opened=${uploadDialogOpened}`);
    if (!uploadDialogOpened) {
      throw new Error('UPLOAD_DIALOG_NOT_OPEN');
    }
    await page.setInputFiles(SELECTORS.fileInput, uploadPath);
    await page.getByRole('button', { name: SELECTORS.uploadButtonName }).click();
    await page.waitForTimeout(1200);
    const listedAfterSubmit = await waitForUploadedFileVisible(page, {
      timeoutMs: TIMEOUTS.upload,
      reloadBetweenAttempts: false,
    });
    evidenceP11.push(`upload file listed after submit=${listedAfterSubmit}`);

    persistenceAfterRefresh = await waitForUploadedFileVisible(page, {
      timeoutMs: TIMEOUTS.upload,
      reloadBetweenAttempts: true,
    });
    evidenceP11.push(`after hard refresh listed=${persistenceAfterRefresh}`);

    await context.close();

    const reloginContext = await browser.newContext({ acceptDownloads: true });
    const reloginPage = await reloginContext.newPage();
    reloginPage.on('response', response => {
      const url = response.url();
      if (url.includes('/api/documents/') && url.includes('/download')) {
        documentsDownloadStatuses.push(`${response.status()}@${url}`);
      }
    });

    await loginAs(reloginPage, {
      account: 'member',
      credentials: runCtx.credentials.member,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
      authState: runCtx.authState,
    });
    await reloginPage.goto(docsUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
    persistenceAfterRelogin = await waitForUploadedFileVisible(reloginPage, {
      timeoutMs: TIMEOUTS.upload,
      reloadBetweenAttempts: true,
    });
    evidenceP11.push(`after logout/login listed=${persistenceAfterRelogin}`);

    const signed200 = signedUploadStatuses.some(entry => entry.startsWith('200@'));
    evidenceP11.push(
      `signed upload statuses: ${signedUploadStatuses.length ? signedUploadStatuses.join(' | ') : 'none captured'}`
    );
    if (clientSignals.length > 0) {
      evidenceP11.push(`client signals: ${clientSignals.join(' || ')}`);
    }
    if (!persistenceAfterRefresh || !persistenceAfterRelogin) {
      signaturesP11.push(
        `P1.1_UPLOAD_PERSISTENCE_FAILED refresh=${persistenceAfterRefresh} relogin=${persistenceAfterRelogin} file=${uploadName}`
      );
    }
    if (!signed200 && !(persistenceAfterRefresh && persistenceAfterRelogin)) {
      signaturesP11.push(`P1.1_SIGNED_UPLOAD_NOT_CONFIRMED file=${uploadName}`);
    }

    try {
      const fileLabel = reloginPage.getByText(uploadName).first();
      await fileLabel.waitFor({ state: 'visible', timeout: TIMEOUTS.marker });
      const fileRow = fileLabel
        .locator('xpath=ancestor::div[contains(@class, "flex items-center justify-between")]')
        .first();

      await fileRow.getByRole('button', { name: SELECTORS.downloadButtonName }).first().click();
      const has200DownloadResponse = await reloginPage
        .waitForResponse(
          response =>
            response.url().includes('/api/documents/') &&
            response.url().includes('/download') &&
            response.status() === 200,
          { timeout: TIMEOUTS.download }
        )
        .then(() => true)
        .catch(() => false);
      evidenceP12.push(`download response 200 observed=${has200DownloadResponse}`);
      evidenceP12.push(
        `download response statuses: ${documentsDownloadStatuses.length ? documentsDownloadStatuses.join(' | ') : 'none captured'}`
      );

      let inlineOpened = false;
      const popupPromise = reloginPage
        .waitForEvent('popup', { timeout: TIMEOUTS.download })
        .then(async popup => {
          await popup
            .waitForLoadState('domcontentloaded', { timeout: TIMEOUTS.download })
            .catch(() => {});
          const notFound = await popup
            .getByTestId(MARKERS.notFound)
            .isVisible({ timeout: TIMEOUTS.quickMarker })
            .catch(() => false);
          inlineOpened = !notFound;
          await popup.close().catch(() => {});
        })
        .catch(() => {});
      await fileRow
        .getByRole('button', { name: SELECTORS.inlineViewButtonName })
        .first()
        .click()
        .catch(() => {});
      await popupPromise;
      evidenceP12.push(`inline/open action succeeded=${inlineOpened}`);

      if (!has200DownloadResponse && !inlineOpened) {
        signaturesP12.push(`P1.2_DOWNLOAD_FAILED file=${uploadName}`);
      }
    } catch (downloadError) {
      signaturesP12.push(
        `P1.2_EXCEPTION message=${String(downloadError.message || downloadError)}`
      );
    }

    await reloginContext.close();
  } catch (error) {
    const rawMessage = String(error.message || error);
    const infraMessage = classifyInfraNetworkFailure(rawMessage);
    if (rawMessage.includes('NO_MEMBER_DOCUMENT_UPLOAD_BUTTONS')) {
      signaturesP11.push(
        'P1.1_MISCONFIG_MEMBER_UPLOAD_PRECONDITION_NOT_MET reason=no_upload_entry_buttons'
      );
      signaturesP12.push('P1.2_SKIPPED_DEPENDENCY_P1.1_MEMBER_UPLOAD_PRECONDITION');
    } else if (infraMessage) {
      signaturesP11.push(`P1.1_INFRA_NETWORK message=${infraMessage}`);
      signaturesP12.push(`P1.2_INFRA_NETWORK_DEPENDENCY message=${infraMessage}`);
    } else {
      signaturesP11.push(`P1.1_EXCEPTION message=${compactErrorMessage(rawMessage, 650)}`);
      signaturesP12.push('P1.2_DEPENDENCY_P1.1_EXCEPTION');
    }
    if (clientSignals.length > 0) {
      evidenceP11.push(`client signals: ${clientSignals.join(' || ')}`);
      signaturesP11.push(`P1.1_CLIENT_SIGNAL ${clientSignals[0]}`);
    }
    await context.close().catch(() => {});
  } finally {
    fs.rmSync(uploadPath, { force: true });
  }

  return [
    checkResult('P1.1', signaturesP11.length ? 'FAIL' : 'PASS', evidenceP11, signaturesP11),
    checkResult('P1.2', signaturesP12.length ? 'FAIL' : 'PASS', evidenceP12, signaturesP12),
  ];
}

async function runP13(browser, runCtx) {
  const evidence = [];
  const signatures = [];
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAs(page, {
      account: 'staff',
      credentials: runCtx.credentials.staff,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
      authState: runCtx.authState,
    });

    const claimsList = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.staffClaimsList);
    await page.goto(claimsList, { waitUntil: 'networkidle', timeout: TIMEOUTS.nav });
    const staffReadyOnList = await page
      .getByTestId(MARKERS.staff)
      .isVisible({ timeout: TIMEOUTS.marker })
      .catch(() => false);
    evidence.push(`staff_claims_list_url=${claimsList}`);
    evidence.push(`staff_page_ready_on_list=${staffReadyOnList}`);
    if (!staffReadyOnList) {
      signatures.push('P1.3_STAFF_PORTAL_NOT_READY');
      return checkResult('P1.3', 'FAIL', evidence, signatures);
    }

    const claimUrlFromEnv = process.env.STAFF_CLAIM_URL;
    const requireClaimUrl =
      String(process.env.RELEASE_GATE_REQUIRE_STAFF_CLAIM_URL || 'false').toLowerCase() === 'true';
    let detailUrl = null;

    if (claimUrlFromEnv && String(claimUrlFromEnv).trim() !== '') {
      detailUrl = claimUrlFromEnv.startsWith('http')
        ? claimUrlFromEnv
        : buildRouteAllowingLocalePath(runCtx.baseUrl, runCtx.locale, claimUrlFromEnv);
      evidence.push('claim_source=STAFF_CLAIM_URL');
    } else {
      if (requireClaimUrl) {
        signatures.push('P1.3_MISCONFIG_STAFF_CLAIM_URL_REQUIRED');
        return checkResult('P1.3', 'FAIL', evidence, signatures);
      }

      const fallbackTimeoutMs = 10_000;
      const startedAt = Date.now();
      let hrefs = [];

      while (Date.now() - startedAt < fallbackTimeoutMs) {
        hrefs = await page.$$eval('a[data-testid="staff-claims-view"]', anchors =>
          anchors.map(node => node.getAttribute('href')).filter(Boolean)
        );
        if (hrefs.length > 0) {
          break;
        }
        await page.waitForTimeout(500);
      }

      evidence.push(`fallback_search_elapsed_ms=${Date.now() - startedAt}`);
      evidence.push(`fallback_link_count=${hrefs.length}`);
      if (hrefs.length === 0) {
        signatures.push('P1.3_NO_TEST_DATA_STAFF_CLAIMS');
        return checkResult('P1.3', 'SKIPPED', evidence, signatures);
      }
      detailUrl = hrefs[0].startsWith('http')
        ? hrefs[0]
        : buildRouteAllowingLocalePath(runCtx.baseUrl, runCtx.locale, hrefs[0]);
      evidence.push('claim_source=staff_claims_list');
    }

    await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: TIMEOUTS.nav });

    evidence.push(`claim_url=${detailUrl}`);
    const notFoundOnDetail = await page
      .getByTestId(MARKERS.notFound)
      .isVisible({ timeout: TIMEOUTS.quickMarker })
      .catch(() => false);
    evidence.push(`detail_not_found=${notFoundOnDetail}`);
    if (notFoundOnDetail) {
      signatures.push('P1.3_MISCONFIG_STAFF_CLAIM_URL_UNREACHABLE');
      return checkResult('P1.3', 'SKIPPED', evidence, signatures);
    }

    const staffReadyOnDetail = await page
      .getByTestId(MARKERS.staff)
      .isVisible({ timeout: TIMEOUTS.marker })
      .catch(() => false);
    evidence.push(`staff_page_ready_on_detail=${staffReadyOnDetail}`);
    const detailReady = await page
      .locator(SELECTORS.staffClaimDetailReady)
      .isVisible({ timeout: TIMEOUTS.marker })
      .catch(() => false);
    const actionPanelReady = await page
      .locator(SELECTORS.staffClaimActionPanel)
      .isVisible({ timeout: TIMEOUTS.marker })
      .catch(() => false);
    const claimSectionReady = await page
      .locator(SELECTORS.staffClaimSection)
      .isVisible({ timeout: TIMEOUTS.marker })
      .catch(() => false);

    evidence.push(
      `detail_ready=${detailReady} action_panel_ready=${actionPanelReady} claim_section_ready=${claimSectionReady}`
    );
    if (!detailReady && !actionPanelReady && !claimSectionReady) {
      signatures.push('P1.3_DETAIL_READY_MARKER_MISSING');
      return checkResult('P1.3', 'FAIL', evidence, signatures);
    }

    const statusTrigger = page.locator(SELECTORS.claimStatusSelectTrigger);
    const currentStatusLabel = (await statusTrigger.innerText()).trim();
    await statusTrigger.click();
    await page
      .locator(SELECTORS.claimStatusListbox)
      .waitFor({ state: 'visible', timeout: TIMEOUTS.action });
    const options = page.locator(SELECTORS.claimStatusOption);
    const optionCount = await options.count();
    if (optionCount === 0) {
      signatures.push('P1.3_STATUS_OPTIONS_MISSING');
    } else {
      let selectedLabel = null;
      for (let i = 0; i < optionCount; i += 1) {
        const candidate = (await options.nth(i).innerText()).trim();
        if (candidate && candidate.toLowerCase() !== currentStatusLabel.toLowerCase()) {
          selectedLabel = candidate;
          await options.nth(i).click();
          break;
        }
      }
      if (!selectedLabel) {
        signatures.push(`P1.3_NO_STATUS_TRANSITION_AVAILABLE current_status=${currentStatusLabel}`);
      } else {
        evidence.push(`status_change=${currentStatusLabel} -> ${selectedLabel}`);
        const noteValue = `gate-note-${Date.now()}`;
        await page.fill(SELECTORS.claimStatusNote, noteValue);
        await page.getByRole('button', { name: SELECTORS.claimUpdateButtonName }).click();
        await page.waitForTimeout(1600);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
        await page.locator(SELECTORS.staffClaimDetailReady).waitFor({
          state: 'visible',
          timeout: TIMEOUTS.marker,
        });

        const noteVisible = await page
          .locator(SELECTORS.staffClaimNote)
          .getByText(noteValue)
          .isVisible({ timeout: TIMEOUTS.marker })
          .catch(() => false);
        evidence.push(`note persisted=${noteVisible} note="${noteValue}"`);
        if (!noteVisible) {
          signatures.push(`P1.3_NOTE_NOT_PERSISTED note=${noteValue}`);
        }

        const persistedStatusLabel = (
          await page.locator(SELECTORS.claimStatusSelectTrigger).innerText()
        ).trim();
        const statusPersisted = persistedStatusLabel
          .toLowerCase()
          .includes(selectedLabel.toLowerCase());
        evidence.push(
          `status persisted=${statusPersisted} expected="${selectedLabel}" actual="${persistedStatusLabel}"`
        );
        if (!statusPersisted) {
          signatures.push(`P1.3_STATUS_NOT_PERSISTED expected="${selectedLabel}"`);
        }
      }
    }
  } catch (error) {
    const markerState = await markerSnapshot(page).catch(() => ({
      member: false,
      agent: false,
      staff: false,
      admin: false,
    }));
    const screenshotPath = path.join(
      os.tmpdir(),
      `release-gate-p13-failure-${Date.now()}-${Math.random().toString(16).slice(2)}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    evidence.push(`failure_url=${page.url()}`);
    evidence.push(
      `failure_markers member=${markerState.member} agent=${markerState.agent} staff=${markerState.staff} admin=${markerState.admin}`
    );
    evidence.push(`failure_screenshot=${screenshotPath}`);
    const notFoundVisible = await page
      .getByTestId(MARKERS.notFound)
      .isVisible({ timeout: TIMEOUTS.quickMarker })
      .catch(() => false);
    evidence.push(`failure_not_found=${notFoundVisible}`);
    const rawMessage = String(error.message || error);
    const infraMessage = classifyInfraNetworkFailure(rawMessage);
    if (infraMessage) {
      signatures.push(`P1.3_INFRA_NETWORK message=${infraMessage}`);
    } else {
      signatures.push(`P1.3_EXCEPTION message=${compactErrorMessage(rawMessage, 650)}`);
    }
  } finally {
    await context.close();
  }
  return checkResult('P1.3', signatures.length ? 'FAIL' : 'PASS', evidence, signatures);
}

function runVercelLogsSweep(runCtx) {
  const evidence = [];
  const signatures = [];

  const versionCheck = spawnSync('vercel', ['--version'], { encoding: 'utf8' });
  if (versionCheck.error) {
    evidence.push('vercel cli not available; skipped');
    return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
  }

  const commandArgs = [
    'logs',
    '--environment',
    runCtx.envName,
    '--since',
    '60m',
    '--no-branch',
    '--level',
    'error',
  ];

  const logs = spawnSync('vercel', commandArgs, {
    encoding: 'utf8',
    env: process.env,
    timeout: 120_000,
  });

  const combined = `${logs.stdout || ''}\n${logs.stderr || ''}`;
  const lines = combined
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const legacySupported = !isLegacyVercelLogsArgsUnsupported(combined);
  if (legacySupported) {
    if (logs.error) {
      evidence.push(`vercel logs failed to execute; skipped (${logs.error.message})`);
      return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
    }

    if (logs.status !== 0) {
      evidence.push(`vercel logs exited ${logs.status}; skipped`);
      evidence.push(...lines.slice(0, 4));
      return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
    }

    const meaningful = lines.filter(
      line => !EXPECTED_VERCEL_LOG_NOISE.some(pattern => pattern.test(line))
    );
    evidence.push('log_mode=legacy');
    evidence.push(`total error lines=${lines.length}`);
    evidence.push(`non-noise lines=${meaningful.length}`);
    evidence.push(...meaningful.slice(0, 6));

    const unexpectedFunctional = meaningful.filter(line =>
      FUNCTIONAL_LOG_ERROR_HINTS.some(pattern => pattern.test(line))
    );
    if (unexpectedFunctional.length > 0) {
      signatures.push(...unexpectedFunctional.map(line => `P1.5.1_UNEXPECTED_ERROR ${line}`));
      return checkResult('P1.5.1', 'FAIL', evidence, signatures);
    }

    return checkResult('P1.5.1', 'PASS', evidence, signatures);
  }

  const deploymentRef =
    runCtx.deployment?.deploymentUrl && runCtx.deployment.deploymentUrl !== 'unknown'
      ? runCtx.deployment.deploymentUrl
      : runCtx.baseUrl;

  const streamingLogs = spawnSync('vercel', ['logs', deploymentRef, '--json'], {
    encoding: 'utf8',
    env: process.env,
    timeout: VERCEL_LOG_STREAM_TIMEOUT_MS,
  });

  const streamingCombined = `${streamingLogs.stdout || ''}\n${streamingLogs.stderr || ''}`;
  const streamingLines = streamingCombined
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const timedOut = streamingLogs.error && streamingLogs.error.code === 'ETIMEDOUT';
  const unexpectedRuntimeError =
    streamingLogs.error &&
    streamingLogs.error.code !== 'ETIMEDOUT' &&
    streamingLogs.error.code !== 'ETERM';

  if (unexpectedRuntimeError) {
    evidence.push(`vercel logs stream failed; skipped (${streamingLogs.error.message})`);
    evidence.push(...streamingLines.slice(0, 4));
    return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
  }

  if (streamingLogs.status != null && streamingLogs.status !== 0 && !timedOut) {
    evidence.push(`vercel logs stream exited ${streamingLogs.status}; skipped`);
    evidence.push(...streamingLines.slice(0, 4));
    return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
  }

  const runtimeEntries = parseVercelRuntimeJsonLines(streamingLogs.stdout);
  const meaningfulRuntimeEntries = runtimeEntries.filter(entry => {
    const message = runtimeEntryMessage(entry);
    return message.length > 0 && !EXPECTED_VERCEL_LOG_NOISE.some(pattern => pattern.test(message));
  });
  const unexpectedFunctional = meaningfulRuntimeEntries.filter(entry => {
    const level = runtimeEntryLevel(entry);
    const message = runtimeEntryMessage(entry);
    return (
      isErrorRuntimeLevel(level) ||
      FUNCTIONAL_LOG_ERROR_HINTS.some(pattern => pattern.test(message))
    );
  });

  evidence.push('log_mode=streaming-json');
  evidence.push(`deployment_ref=${deploymentRef}`);
  evidence.push(`stream_window_ms=${VERCEL_LOG_STREAM_TIMEOUT_MS}`);
  evidence.push(`stream_timed_out=${timedOut}`);
  evidence.push(`runtime_entries=${runtimeEntries.length}`);
  evidence.push(`runtime_non_noise_entries=${meaningfulRuntimeEntries.length}`);
  evidence.push(
    ...meaningfulRuntimeEntries.slice(0, 6).map(entry => {
      const level = runtimeEntryLevel(entry) || 'unknown';
      const message = runtimeEntryMessage(entry);
      return `runtime_entry level=${level} message=${message}`;
    })
  );

  if (unexpectedFunctional.length > 0) {
    signatures.push(
      ...unexpectedFunctional.map(entry => {
        const level = runtimeEntryLevel(entry) || 'unknown';
        const message = runtimeEntryMessage(entry);
        return `P1.5.1_UNEXPECTED_ERROR level=${level} message=${message}`;
      })
    );
    return checkResult('P1.5.1', 'FAIL', evidence, signatures);
  }

  return checkResult('P1.5.1', 'PASS', evidence, signatures);
}

async function detectDeploymentMetadata(baseUrl, browser) {
  const tryInspect = () => {
    const inspectArgs = ['inspect', baseUrl];
    if (process.env.VERCEL_ORG) {
      inspectArgs.push('--scope', process.env.VERCEL_ORG);
    }

    const inspect = spawnSync('vercel', inspectArgs, {
      encoding: 'utf8',
      env: process.env,
      timeout: 60_000,
    });
    if (inspect.error || inspect.status !== 0) {
      return null;
    }

    const output = `${inspect.stdout || ''}\n${inspect.stderr || ''}`;
    const deploymentIdMatch = output.match(/\bdpl_[A-Za-z0-9]+\b/);
    const deploymentUrlMatch = output.match(/https:\/\/[A-Za-z0-9.-]+\.vercel\.app\b/i);

    if (!deploymentIdMatch && !deploymentUrlMatch) return null;
    return {
      deploymentId: deploymentIdMatch ? deploymentIdMatch[0] : 'unknown',
      deploymentUrl: deploymentUrlMatch ? deploymentUrlMatch[0] : 'unknown',
      source: 'vercel-inspect',
    };
  };

  const cliVersion = spawnSync('vercel', ['--version'], { encoding: 'utf8', timeout: 10_000 });
  if (!cliVersion.error) {
    const inspected = tryInspect();
    if (inspected) return inspected;
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const response = await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.nav,
    });
    const headers = (response && response.headers()) || {};
    const vercelDeploymentUrl = headers['x-vercel-deployment-url'] || 'unknown';
    const vercelIdHeader = headers['x-vercel-id'] || '';
    let deploymentId = 'unknown';
    if (vercelIdHeader.includes('::')) {
      deploymentId = vercelIdHeader.split('::').pop().split('-').pop() || 'unknown';
    }
    if (deploymentId === 'unknown' && /dpl_/i.test(baseUrl)) {
      const match = baseUrl.match(/dpl_[A-Za-z0-9]+/);
      deploymentId = match ? match[0] : 'unknown';
    }
    return {
      deploymentId,
      deploymentUrl: vercelDeploymentUrl,
      source: 'http-headers',
    };
  } catch {
    return {
      deploymentId: 'unknown',
      deploymentUrl: 'unknown',
      source: 'unknown',
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const requiredEnv = REQUIRED_ENV_BY_SUITE[args.suite] || REQUIRED_ENV_BY_SUITE.all;
  const missingEnv = getMissingEnv(requiredEnv);
  if (missingEnv.length > 0) {
    console.error('[release-gate] Missing required env vars:');
    for (const name of missingEnv) {
      console.error(`- ${name}`);
    }
    process.exit(2);
  }

  const credentials = {};
  for (const accountKey of Object.keys(ACCOUNTS)) {
    const account = ACCOUNTS[accountKey];
    credentials[accountKey] = {
      email: process.env[account.emailVar] || '',
      password: process.env[account.passwordVar] || '',
    };
  }

  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch({ headless: true });
  const checks = [];

  try {
    const deployment = await detectDeploymentMetadata(baseUrl, browser);
    const runCtx = {
      baseUrl,
      locale: args.locale,
      suite: args.suite,
      envName: args.envName,
      credentials,
      deployment,
      authState: createAuthState(),
    };

    const selected = SUITES[args.suite];
    const loginDependentSelected = selected.filter(isLoginDependentCheck);
    let preflightBlocked = false;

    if (runCtx.envName === 'production' && loginDependentSelected.length > 0) {
      const preflight = await runAuthEndpointPreflight(runCtx);
      if (preflight.status !== 'PASS') {
        preflightBlocked = true;
        const firstSignature =
          preflight.signatures[0] || 'AUTH_PREFLIGHT_INFRA_NETWORK message=unknown';
        for (const checkId of loginDependentSelected) {
          checks.push(
            checkResult(
              checkId,
              'FAIL',
              [...preflight.evidence],
              [`${checkId}_INFRA_NETWORK_PRECHECK_FAILED ${firstSignature}`]
            )
          );
        }
      }
    }

    if (!preflightBlocked) {
      if (selected.includes('P0.1')) checks.push(await runP01(browser, runCtx));
      if (selected.includes('P0.2')) checks.push(await runP02(browser, runCtx));
      if (selected.includes('P0.3') || selected.includes('P0.4')) {
        const roleChecks = await runP03AndP04(browser, runCtx);
        if (selected.includes('P0.3')) checks.push(roleChecks[0]);
        if (selected.includes('P0.4')) checks.push(roleChecks[1]);
      }
      if (selected.includes('P0.6')) checks.push(await runP06(browser, runCtx));
      if (selected.includes('P1.1') || selected.includes('P1.2')) {
        const memberChecks = await runP11AndP12(browser, runCtx);
        if (selected.includes('P1.1')) checks.push(memberChecks[0]);
        if (selected.includes('P1.2')) checks.push(memberChecks[1]);
      }
      if (selected.includes('P1.3')) checks.push(await runP13(browser, runCtx));
      if (selected.includes('P1.5.1')) checks.push(runVercelLogsSweep(runCtx));
    } else if (selected.includes('P1.5.1')) {
      checks.push(runVercelLogsSweep(runCtx));
    }

    const normalizedChecks = enforceNoSkipOnSelectedChecks(checks, selected, runCtx.envName);

    const report = writeReleaseGateReport({
      outDir: args.outDir,
      envName: args.envName,
      baseUrl,
      suite: args.suite,
      deploymentId: runCtx.deployment.deploymentId,
      deploymentUrl: runCtx.deployment.deploymentUrl,
      deploymentSource: runCtx.deployment.source,
      generatedAt: new Date(),
      executedChecks: selected,
      checks: normalizedChecks,
      accounts: {
        member: credentials.member.email,
        agent: credentials.agent.email,
        staff: credentials.staff.email,
        adminKs: credentials.admin_ks.email,
        adminMk: credentials.admin_mk.email,
      },
      preconditions: {
        migrations: 'not evaluated by runner',
        env: `required release gate env vars present (${requiredEnv.length})`,
        flags: 'none',
      },
    });

    console.log(`[release-gate] report=${report.reportPath}`);
    for (const check of normalizedChecks) {
      console.log(`[release-gate] ${check.id}=${check.status}`);
      for (const signature of check.signatures || []) {
        console.error(`[release-gate] signature ${signature}`);
      }
    }

    const hasFailure = normalizedChecks.some(check => check.status === 'FAIL');
    const hasMisconfig = normalizedChecks.some(check =>
      (check.signatures || []).some(signature => signature.includes('_MISCONFIG_'))
    );
    process.exit(hasMisconfig ? 2 : hasFailure ? 1 : 0);
  } finally {
    await browser.close();
  }
}

module.exports = {
  buildRouteAllowingLocalePath,
  classifyInfraNetworkFailure,
  computeRetryDelayMs,
  enforceNoSkipOnSelectedChecks,
  isLoginDependentCheck,
  isLegacyVercelLogsArgsUnsupported,
  parseVercelRuntimeJsonLines,
  parseRetryAfterSeconds,
  resolveTenantOverrideProbeUrl,
  sessionCacheKeyForAccount,
  shouldDisallowSkippedChecks,
};

if (require.main === module) {
  main().catch(error => {
    console.error(`[release-gate] Fatal error: ${String(error.message || error)}`);
    process.exit(2);
  });
}
