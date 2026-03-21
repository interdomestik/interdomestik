const { ACCOUNTS, MARKERS, ROUTES, SELECTORS, TIMEOUTS } = require('./config.ts');
const { gotoWithSessionRetry } = require('./session-navigation.ts');
const {
  assertUrlMarkers,
  buildRoute,
  buildRouteAllowingLocalePath,
  checkResult,
  collectMarkersWithWait,
  expectedMatrixForAccount,
  markerSummary,
  markersToString,
  sleep,
  waitForReadyMarker,
} = require('./shared.ts');

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

async function runP01(browser, runCtx, deps) {
  const { loginWithRunContext } = deps;
  const accounts = ['member', 'agent', 'staff', 'admin_ks'];
  const evidence = [];
  const failures = [];
  let memberDriftSignatureAdded = false;

  for (const account of accounts) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginWithRunContext(page, runCtx, account);

      const matrix = expectedMatrixForAccount(account);
      for (const portal of ROUTES.rbacTargets) {
        const route = `/${portal}`;
        await gotoWithSessionRetry({
          page,
          navigate: () =>
            page.goto(buildRoute(runCtx.baseUrl, runCtx.locale, route), {
              waitUntil: 'domcontentloaded',
              timeout: TIMEOUTS.nav,
            }),
          retryLogin: () => loginWithRunContext(page, runCtx, account),
        });
        await page.waitForTimeout(450);

        const current = await collectMarkersWithWait(page, matrix.canonical);
        evidence.push(`${account} ${markerSummary(route, current)}`);

        const rbacResult = collectRbacFailures({
          account,
          portal,
          route,
          matrix,
          current,
          runCtx,
          memberDriftSignatureAdded,
        });
        memberDriftSignatureAdded = rbacResult.driftRecorded;
        failures.push(...rbacResult.failures);
      }
    } catch (error) {
      failures.push(`P0.1_EXCEPTION account=${account} message=${String(error.message || error)}`);
    } finally {
      await context.close();
    }
  }

  return checkResult('P0.1', failures.length ? 'FAIL' : 'PASS', evidence, failures);
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

async function removeRoleFromTable(page, roleName) {
  const table = page.locator(SELECTORS.userRolesTable);
  const rolePattern = new RegExp(String.raw`\b${roleName}\b`, 'i');
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

function collectRbacFailures(input) {
  const { account, portal, route, matrix, current, runCtx, memberDriftSignatureAdded } = input;
  const failures = [];
  let driftRecorded = memberDriftSignatureAdded;

  if (
    account === 'member' &&
    portal === 'member' &&
    current.member === true &&
    (current.agent === true || current.staff === true || current.admin === true) &&
    !driftRecorded
  ) {
    driftRecorded = true;
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

  return { driftRecorded, failures };
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
  const hasExplicitTarget = rolePanelTarget.source !== 'default';
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
    const visible = await waitForRolePanelVisible(page, TIMEOUTS.nav);
    return visible ? page.url() : null;
  }

  async function ensureRolePanelLoaded(page, initialTargetUrl) {
    const initialResolved = await tryRolePanelTarget(page, initialTargetUrl).catch(() => null);
    if (initialResolved) return initialResolved;

    if (hasExplicitTarget && !rolePanelTarget.allowFallbackDiscovery) return null;

    const fallbackSeedTargets = [
      buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.defaultAdminUserUrl),
      buildRoute(runCtx.baseUrl, runCtx.locale, '/admin/users/pack_ks_staff_extra'),
      buildRoute(runCtx.baseUrl, runCtx.locale, '/admin/users/golden_ks_a_member_1'),
    ];
    const uniqueTargets = [...new Set(fallbackSeedTargets.filter(Boolean))];

    for (const target of uniqueTargets) {
      const resolved = await tryRolePanelTarget(page, target).catch(() => null);
      if (resolved) return resolved;
    }

    await gotoWithSessionRetry({
      page,
      navigate: () =>
        page.goto(buildRoute(runCtx.baseUrl, runCtx.locale, '/admin/users'), {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.nav,
        }),
      retryLogin: () => loginWithRunContext(page, runCtx, 'admin_ks'),
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
        await loginWithRunContext(page, runCtx, 'admin_ks');

        const resolvedTarget = await ensureRolePanelLoaded(page, targetUrl);
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
          `pre-clean removed_existing_role_entries=${cleanupCount}`
        );

        await addRole(page, roleToToggle);
        const afterAddStart = Date.now();
        let afterAdd = false;
        while (Date.now() - afterAddStart < TIMEOUTS.marker) {
          afterAdd = await page
            .locator(SELECTORS.userRolesTable)
            .getByText(new RegExp(String.raw`\b${roleToToggle}\b`, 'i'))
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
            .getByText(new RegExp(String.raw`\b${roleToToggle}\b`, 'i'))
            .isVisible({ timeout: TIMEOUTS.quickMarker })
            .catch(() => false);
          if (!stillVisible) break;
          await sleep(300);
        }
        evidenceP04.push(`removed_role=${roleToToggle} remaining_in_roles_table=${stillVisible}`);
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
  const failures = [];
  const evidence = [];
  const scenarios = [];

  async function withAccount(accountKey, fn) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginWithRunContext(page, runCtx, accountKey);
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
    const urls = checks.map(check => buildRoute(runCtx.baseUrl, runCtx.locale, check.route));

    try {
      await withAccount(accountKey, async page => {
        const observedRows = [];
        const mismatches = [];
        for (const [index, check] of checks.entries()) {
          const result = await assertUrlMarkers(page, id, urls[index], check.expected);
          observedRows.push(`${urls[index]} => ${markersToString(result.observed)}`);
          for (const mismatch of result.mismatches) {
            mismatches.push(mismatch);
          }
        }

        const failureSignature = mismatches[0] ? mismatchSignatureFor(id, mismatches[0]) : '';
        if (failureSignature) failures.push(failureSignature);
        recordScenario({
          id,
          title,
          account: accountKey,
          urls,
          expectedSummary,
          observedSummary: observedRows.join(' || '),
          result: failureSignature ? 'FAIL' : 'PASS',
          failureSignature,
        });
      });
    } catch (error) {
      const failureSignature = `P0.6_${id}_EXCEPTION message=${String(error.message || error)}`;
      failures.push(failureSignature);
      recordScenario({
        id,
        title,
        account: accountKey,
        urls,
        expectedSummary,
        observedSummary: 'exception',
        result: 'FAIL',
        failureSignature,
      });
    }
  }

  await runMultiRouteScenario({
    id: 'S1',
    title: 'Mixed roles: member+agent',
    accountKey: 'agent',
    checks: [
      { route: '/member', expected: { member: true } },
      { route: '/agent', expected: { agent: true } },
      { route: '/staff', expected: { staff: false } },
      { route: '/admin', expected: { admin: false } },
    ],
    expectedSummary:
      '/member member=true; /agent agent=true; /staff staff=false; /admin admin=false',
  });

  await runMultiRouteScenario({
    id: 'S2',
    title: 'Mixed roles: member+staff',
    accountKey: 'staff',
    checks: [
      { route: '/member', expected: { member: true } },
      { route: '/staff', expected: { staff: true } },
      { route: '/agent', expected: { agent: false } },
      { route: '/admin', expected: { admin: false } },
    ],
    expectedSummary:
      '/member member=true; /staff staff=true; /agent agent=false; /admin admin=false',
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
  runCheckWithInfraRetry,
  resolveConfiguredRolePanelTarget,
  resolveTenantOverrideProbeUrl,
  runP01,
  runP02,
  runP03AndP04,
  runP06,
};
