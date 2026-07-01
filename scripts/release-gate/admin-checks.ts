const { ACCOUNTS, MARKERS, ROUTES, SELECTORS, TIMEOUTS } = require('./config.ts');
const { gotoWithSessionRetry } = require('./session-navigation.ts');
const {
  buildRoute,
  buildRouteAllowingLocalePath,
  checkResult,
  markersToString,
  sleep,
  waitForReadyMarker,
} = require('./shared.ts');
const { createP06MarkerAsserter } = require('./p06-marker-assertion.ts');
const { collectP06MultiRouteScenario } = require('./p06-multi-route-runner.ts');
const {
  addRole,
  createMutationResponseCapture,
  removeRoleFromTable,
  roleRowLocator,
} = require('./admin-checks-locators.ts');
const { invalidateP01ProofForRoleTarget } = require('./p01-canonical-proof.ts');
const { runP01 } = require('./p01-rbac-runner.ts');
const { buildP06CanonicalRouteScenarios } = require('./p06-scenarios.ts');
const { buildRolePanelDiscoveryUrls } = require('./role-panel-targets.ts');

const INFRA_NAVIGATION_ERROR_PATTERNS = [
  /ERR_CONNECTION_REFUSED/i,
  /ERR_CONNECTION_TIMED_OUT/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /Timeout \d+ms exceeded/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /ECONNRESET/i,
  /socket hang up/i,
];

const DEFAULT_SCENARIO_EXPECTED_MARKERS = {
  member: '-',
  agent: '-',
  staff: '-',
  admin: '-',
  notFound: '-',
  rolesTable: '-',
};

function mismatchSignatureFor(id, mismatch) {
  return `P0.6_${id}_MARKER_MISMATCH ${mismatch}`;
}
function isInfraNavigationFailure(raw) {
  const message = String(raw || '')
    .replaceAll(/\s+/g, ' ')
    .trim();
  if (!message) return false;
  return INFRA_NAVIGATION_ERROR_PATTERNS.some(pattern => pattern.test(message));
}
async function runCheckWithInfraRetry(run, options = {}) {
  const maxAttempts = options.maxAttempts || 2;
  const retryDelayMs = options.retryDelayMs || 1_500;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      if (!isInfraNavigationFailure(error?.message || error) || attempt >= maxAttempts) {
        throw error;
      }
      await sleep(retryDelayMs * attempt);
    }
  }

  throw lastError || new Error('unreachable infra retry state');
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

function resolveConfiguredRolePanelTarget(runCtx) {
  const configured = String(process.env.RELEASE_GATE_TARGET_USER_URL || '').trim();
  const defaultTarget = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.defaultAdminUserUrl);

  if (!configured) {
    return {
      allowFallbackDiscovery: true,
      source: 'default',
      targetUrl: defaultTarget,
    };
  }

  const targetUrl = /^https?:\/\//i.test(configured)
    ? configured
    : buildRoute(runCtx.baseUrl, runCtx.locale, configured);
  const overrideProbe = resolveTenantOverrideProbeUrl(runCtx);

  let allowFallbackDiscovery = false;

  try {
    const target = new URL(targetUrl);
    const override = new URL(overrideProbe.url);
    const targetTenantId = target.searchParams.get('tenantId');
    const adminKsTenantId = ACCOUNTS.admin_ks.tenantId;
    allowFallbackDiscovery =
      target.href === override.href ||
      (Boolean(targetTenantId) && targetTenantId !== adminKsTenantId);
  } catch {
    allowFallbackDiscovery = false;
  }

  return {
    allowFallbackDiscovery,
    source: allowFallbackDiscovery ? 'env-cross-tenant-probe' : 'env',
    targetUrl,
  };
}

async function compactRoleTableText(page) {
  return page
    .locator(SELECTORS.userRolesTable)
    .innerText({ timeout: TIMEOUTS.quickMarker })
    .then(text =>
      String(text || '')
        .replaceAll(/\s+/g, ' ')
        .trim()
        .slice(0, 240)
    )
    .catch(error => `unavailable:${String(error?.message || error).slice(0, 120)}`);
}

async function runP02(browser, runCtx, deps) {
  const { loginWithRunContext } = deps;
  const evidence = [];
  const failures = [];
  try {
    await runCheckWithInfraRetry(async attempt => {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await loginWithRunContext(page, runCtx, 'admin_mk');

        const route = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.crossTenantProbe);
        await gotoWithSessionRetry({
          page,
          navigate: () =>
            page.goto(route, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
          retryLogin: () => loginWithRunContext(page, runCtx, 'admin_mk', { forceFresh: true }),
        });
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
          `attempt=${attempt} route=${route} not-found-page=${notFoundVisible} user-roles-table=${rolesTableVisible}`
        );

        if (!notFoundVisible && rolesTableVisible) {
          failures.push(
            `P0.2_CROSS_TENANT_BREACH route=/${runCtx.locale}${ROUTES.crossTenantProbe} not_found=${notFoundVisible} roles_table=${rolesTableVisible}`
          );
        }
      } finally {
        await context.close();
      }
    });
  } catch (error) {
    failures.push(`P0.2_EXCEPTION message=${String(error.message || error)}`);
  }
  return checkResult('P0.2', failures.length ? 'FAIL' : 'PASS', evidence, failures);
}

async function runP03AndP04(browser, runCtx, deps) {
  const { loginWithRunContext } = deps;
  const roleToToggle = String(process.env.RELEASE_GATE_ROLE || 'promoter')
    .trim()
    .toLowerCase();
  const requireRolePanel = process.env.RELEASE_GATE_REQUIRE_ROLE_PANEL !== 'false';
  const evidenceP03 = [];
  const evidenceP04 = [];
  const failuresP03 = [];
  const failuresP04 = [];

  if (!requireRolePanel) {
    const reason = 'role_panel_checks_disabled (RELEASE_GATE_REQUIRE_ROLE_PANEL=false)';
    evidenceP03.push(reason);
    evidenceP04.push(reason);
    return [
      checkResult('P0.3', 'SKIPPED', evidenceP03, []),
      checkResult('P0.4', 'SKIPPED', evidenceP04, []),
    ];
  }

  const rolePanelTarget = resolveConfiguredRolePanelTarget(runCtx);
  const targetUrl = rolePanelTarget.targetUrl;
  async function waitForRolePanelVisible(page, timeoutMs = TIMEOUTS.nav) {
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

  async function tryRolePanelTarget(page, targetUrl) {
    await gotoWithSessionRetry({
      page,
      navigate: () =>
        page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
      retryLogin: () => loginWithRunContext(page, runCtx, 'admin_ks'),
    });
    const ok = await waitForRolePanelVisible(page, TIMEOUTS.nav);
    evidenceP03.push(`rp ${page.url()} ${ok}`);
    return ok ? page.url() : null;
  }

  async function ensureRolePanelLoaded(page) {
    for (const candidateUrl of buildRolePanelDiscoveryUrls(runCtx, rolePanelTarget)) {
      const resolved = await tryRolePanelTarget(page, candidateUrl).catch(() => null);
      if (resolved) return resolved;
    }
    return null;
  }

  try {
    await runCheckWithInfraRetry(async attempt => {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await loginWithRunContext(page, runCtx, 'admin_ks', { forceFresh: true });

        const resolvedTarget = await ensureRolePanelLoaded(page);
        evidenceP03.push(
          `attempt=${attempt} target_source=${rolePanelTarget.source}`,
          `target_fallback_allowed=${rolePanelTarget.allowFallbackDiscovery}`
        );
        if (!resolvedTarget) {
          failuresP03.push(`P0.3_ROLE_PANEL_UNAVAILABLE target=${targetUrl}`);
          failuresP04.push(`P0.4_ROLE_PANEL_UNAVAILABLE target=${targetUrl}`);
          return;
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
        evidenceP03.push(
          `target=${resolvedTarget}`,
          `pre-clean removed_existing_role_entries=${cleanupCount}`,
          `table_before_grant=${await compactRoleTableText(page)}`
        );
        invalidateP01ProofForRoleTarget(runCtx, resolvedTarget);

        const grantCapture = createMutationResponseCapture(page, runCtx.baseUrl);
        await addRole(page, roleToToggle);
        const afterAdd = await roleRowLocator(page, roleToToggle)
          .waitFor({ state: 'visible', timeout: TIMEOUTS.marker })
          .then(() => true)
          .catch(() => false);
        const grantResponses = await grantCapture.stop();
        if (grantResponses.length > 0) {
          evidenceP03.push(`grant_responses=${grantResponses.join(' | ')}`);
        }
        evidenceP03.push(
          `table_after_grant=${await compactRoleTableText(page)}`,
          `added_role=${roleToToggle} visible_in_roles_table=${afterAdd}`
        );
        if (!afterAdd) {
          failuresP03.push(`P0.3_ROLE_ADD_FAILED role=${roleToToggle} target=${resolvedTarget}`);
        }

        const revokeCapture = createMutationResponseCapture(page, runCtx.baseUrl);
        const removedAddedRole = await removeRoleFromTable(page, roleToToggle);
        if (!removedAddedRole) {
          failuresP04.push(
            `P0.4_ROLE_REMOVE_CLICK_FAILED role=${roleToToggle} target=${resolvedTarget}`
          );
        }

        const stillVisible = await roleRowLocator(page, roleToToggle)
          .waitFor({ state: 'hidden', timeout: TIMEOUTS.marker })
          .then(() => false)
          .catch(() => true);
        const revokeResponses = await revokeCapture.stop();
        if (revokeResponses.length > 0) {
          evidenceP04.push(`revoke_responses=${revokeResponses.join(' | ')}`);
        }
        evidenceP04.push(
          `table_after_revoke=${await compactRoleTableText(page)}`,
          `removed_role=${roleToToggle} remaining_in_roles_table=${stillVisible}`
        );
        if (stillVisible) {
          failuresP04.push(`P0.4_ROLE_REMOVE_FAILED role=${roleToToggle} target=${resolvedTarget}`);
        }
      } finally {
        await context.close();
      }
    });
  } catch (error) {
    failuresP03.push(`P0.3_EXCEPTION message=${String(error.message || error)}`);
    failuresP04.push(`P0.4_EXCEPTION message=${String(error.message || error)}`);
  }

  return [
    checkResult('P0.3', failuresP03.length ? 'FAIL' : 'PASS', evidenceP03, failuresP03),
    checkResult('P0.4', failuresP04.length ? 'FAIL' : 'PASS', evidenceP04, failuresP04),
  ];
}

async function runP06(browser, runCtx, deps) {
  const { loginWithRunContext } = deps;
  const assertP06Markers = createP06MarkerAsserter({ loginWithRunContext, runCtx });
  const failures = [];
  const evidence = [];
  const scenarios = [];

  async function withAccount(accountKey, fn, options = {}) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await loginWithRunContext(page, runCtx, accountKey, {
        forceFresh: options.forceFresh === true,
      });
      return await fn(page);
    } finally {
      await context.close();
    }
  }

  function recordScenario(scenario) {
    scenarios.push(scenario);
    evidence.push(
      `${scenario.id} ${scenario.title} result=${scenario.result} account=${scenario.account}`,
      `  url=${scenario.urls.join(' | ')}`,
      `  expected=${scenario.expectedSummary}`,
      `  observed=${scenario.observedSummary}`
    );
    if (scenario.failureSignature) {
      evidence.push(`  signature=${scenario.failureSignature}`);
    }
  }

  async function runSimpleScenario(input) {
    const { id, title, accountKey, route, expected } = input;
    try {
      const result = await withAccount(accountKey, async page =>
        assertP06Markers(
          page,
          accountKey,
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
        expectedSummary: markersToString(
          Object.assign({}, DEFAULT_SCENARIO_EXPECTED_MARKERS, expected)
        ),
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

  async function runMultiRouteScenario(input) {
    const { id, title, accountKey, checks, expectedSummary } = input;

    try {
      const { urls, observedSummary, mismatches } = await collectP06MultiRouteScenario({
        id,
        accountKey,
        assertP06Markers,
        browser,
        checks,
        loginWithRunContext,
        runCtx,
      });
      const failureSignature = mismatches[0] ? mismatchSignatureFor(id, mismatches[0]) : '';
      if (failureSignature) failures.push(failureSignature);
      recordScenario({
        id,
        title,
        account: accountKey,
        urls,
        expectedSummary,
        observedSummary,
        result: failureSignature ? 'FAIL' : 'PASS',
        failureSignature,
      });
    } catch (error) {
      const failureSignature = `P0.6_${id}_EXCEPTION message=${String(error.message || error)}`;
      failures.push(failureSignature);
      recordScenario({
        id,
        title,
        account: accountKey,
        urls: checks.map(check => buildRoute(runCtx.baseUrl, runCtx.locale, check.route)),
        expectedSummary,
        observedSummary: 'exception',
        result: 'FAIL',
        failureSignature,
      });
    }
  }

  for (const scenario of buildP06CanonicalRouteScenarios()) {
    await runMultiRouteScenario(scenario);
  }

  try {
    await withAccount('agent', async page => {
      const url = buildRoute(runCtx.baseUrl, runCtx.locale, '/admin/users/golden_ks_staff');
      const result = await assertP06Markers(page, 'agent', 'S3', url, { rolesTable: false });
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

  {
    const s5Probe = resolveTenantOverrideProbeUrl(runCtx);
    try {
      await withAccount('admin_ks', async page => {
        const result = await assertP06Markers(page, 'admin_ks', 'S5', s5Probe.url, {});
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
      await gotoWithSessionRetry({
        page,
        navigate: () => page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUTS.nav }),
        retryLogin: () => loginWithRunContext(page, runCtx, 'agent'),
      });
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

module.exports = {
  isInfraNavigationFailure,
  removeRoleFromTable,
  runCheckWithInfraRetry,
  resolveConfiguredRolePanelTarget,
  resolveTenantOverrideProbeUrl,
  runP01,
  runP02,
  runP03AndP04,
  runP06,
};
