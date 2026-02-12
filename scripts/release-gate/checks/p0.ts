const { ROUTES, MARKERS, SELECTORS, TIMEOUTS } = require('../config.ts');
const {
  checkResult,
  loginAs,
  buildRoute,
  buildRouteAllowingLocalePath,
  markerSummary,
  markersToString,
  collectMarkersWithWait,
  expectedMatrixForAccount,
  waitForReadyMarker,
  assertUrlMarkers,
  sleep,
  removeRoleFromTable,
  addRole,
} = require('../lib/gate-utils.ts');

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
  const defaultTarget = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.defaultAdminUserUrl);
  const targetUrl =
    targetFromEnv && targetFromEnv.startsWith('http')
      ? targetFromEnv
      : targetFromEnv
        ? buildRoute(runCtx.baseUrl, runCtx.locale, targetFromEnv)
        : defaultTarget;

  async function ensureRolePanelLoaded(initialTargetUrl) {
    await page.goto(initialTargetUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
    const initialVisible = await page
      .locator(SELECTORS.roleSelectTrigger)
      .isVisible({ timeout: TIMEOUTS.marker })
      .catch(() => false);
    if (initialVisible) return page.url();

    await page.goto(buildRoute(runCtx.baseUrl, runCtx.locale, '/admin/users'), {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.nav,
    });
    const profileLink = page.locator('a[href*="/admin/users/"]').first();
    const hasProfileLink = await profileLink
      .isVisible({ timeout: TIMEOUTS.marker })
      .catch(() => false);
    if (!hasProfileLink) return null;
    await profileLink.click();
    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUTS.nav });
    const visible = await page
      .locator(SELECTORS.roleSelectTrigger)
      .isVisible({ timeout: TIMEOUTS.marker })
      .catch(() => false);
    return visible ? page.url() : null;
  }

  try {
    await loginAs(page, {
      account: 'admin_ks',
      credentials: runCtx.credentials.admin_ks,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
    });

    const resolvedTarget = await ensureRolePanelLoaded(targetUrl);
    if (!resolvedTarget) {
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
    const mkUserUrl = String(process.env.RELEASE_GATE_MK_USER_URL || '').trim();
    if (!mkUserUrl) {
      recordScenario({
        id: 'S5',
        title: 'Tenant override injection (optional)',
        account: 'admin_ks',
        urls: [],
        expectedSummary: 'notFound=true OR rolesTable=false',
        observedSummary: 'SKIPPED: RELEASE_GATE_MK_USER_URL missing',
        result: 'SKIPPED',
      });
    } else {
      try {
        await withAccount('admin_ks', async page => {
          const url = /^https?:\/\//i.test(mkUserUrl)
            ? mkUserUrl
            : buildRouteAllowingLocalePath(runCtx.baseUrl, runCtx.locale, mkUserUrl);
          const result = await assertUrlMarkers(page, 'S5', url, {});
          const passes = result.observed.notFound || result.observed.rolesTable === false;
          const failureSignature = passes
            ? ''
            : `P0.6_S5_MARKER_MISMATCH expected (notFound=true OR rolesTable=false) got ${markersToString(result.observed)}`;
          if (failureSignature) failures.push(failureSignature);
          recordScenario({
            id: 'S5',
            title: 'Tenant override injection (optional)',
            account: 'admin_ks',
            urls: [url],
            expectedSummary: 'notFound=true OR rolesTable=false',
            observedSummary: markersToString(result.observed),
            result: failureSignature ? 'FAIL' : 'PASS',
            failureSignature,
          });
        });
      } catch (error) {
        const failureSignature = `P0.6_S5_EXCEPTION message=${String(error.message || error)}`;
        failures.push(failureSignature);
        recordScenario({
          id: 'S5',
          title: 'Tenant override injection (optional)',
          account: 'admin_ks',
          urls: [mkUserUrl],
          expectedSummary: 'notFound=true OR rolesTable=false',
          observedSummary: 'exception',
          result: 'FAIL',
          failureSignature,
        });
      }
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

module.exports = {
  runP01,
  runP02,
  runP03AndP04,
  runP06,
};
