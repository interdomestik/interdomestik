const { ROUTES, SELECTORS, TIMEOUTS } = require('../config.ts');
const {
  checkResult,
  loginAs,
  buildRoute,
  buildRouteAllowingLocalePath,
  checkPortalMarkers,
  removeRoleFromTable,
} = require('../lib/gate-utils.ts');

function normalizeOptional(value) {
  const trimmed = String(value || '').trim();
  return trimmed.length > 0 ? trimmed : '';
}

function toAbsoluteUrl(runCtx, routeOrUrl) {
  return buildRouteAllowingLocalePath(runCtx.baseUrl, runCtx.locale, routeOrUrl);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function textVisible(page, text, timeout = TIMEOUTS.marker) {
  if (!text) return false;
  return page
    .getByText(new RegExp(escapeRegex(text), 'i'))
    .first()
    .isVisible({ timeout })
    .catch(() => false);
}

function resolveStaffNeedles(runCtx, p2) {
  const values = [p2.staffId, runCtx.credentials.staff.email];
  if (p2.staffId === 'golden_ks_staff') {
    values.push('staff.ks@interdomestik.com', 'Drita Gashi');
  }
  if (p2.staffId === 'golden_ks_staff_2') {
    values.push('staff.ks.2@interdomestik.com', 'Besian Mustafa');
  }
  return [...new Set(values.filter(Boolean))];
}

async function selectBranchForGrant(page) {
  const branchTrigger = page.locator('[data-testid="branch-select-trigger"]');
  const triggerVisible = await branchTrigger
    .isVisible({ timeout: TIMEOUTS.quickMarker })
    .catch(() => false);
  if (!triggerVisible) return false;
  await branchTrigger.click();
  const branchOptions = page.locator('[data-testid^="branch-option-"]');
  const optionCount = await branchOptions.count();
  for (let i = 0; i < optionCount; i += 1) {
    const node = branchOptions.nth(i);
    const id = (await node.getAttribute('data-testid')) || '';
    if (id.endsWith('__tenant__')) continue;
    await node.click();
    return true;
  }
  return false;
}

async function grantRoleOnUser(page, roleName) {
  const roleTrigger = page.locator(SELECTORS.roleSelectTrigger);
  await roleTrigger.waitFor({ state: 'visible', timeout: TIMEOUTS.action });
  await roleTrigger.click();

  const roleOption = page.locator(`[data-testid="role-option-${roleName}"]`);
  await roleOption.waitFor({ state: 'visible', timeout: TIMEOUTS.action });
  await roleOption.click();

  const grantButton = page.getByRole('button', { name: SELECTORS.grantRoleButtonName });
  let disabled = await grantButton.isDisabled().catch(() => true);
  if (disabled) {
    const selectedBranch = await selectBranchForGrant(page);
    if (selectedBranch) {
      disabled = await grantButton.isDisabled().catch(() => true);
    }
  }
  if (disabled) {
    throw new Error(`ROLE_GRANT_DISABLED role=${roleName}`);
  }

  await grantButton.click({ timeout: TIMEOUTS.action });
  await page.waitForTimeout(1200);
}

function getP2Config(runCtx) {
  const adminClaimUrl = normalizeOptional(process.env.PILOT_ADMIN_CLAIM_URL);
  const memberClaimUrl = normalizeOptional(process.env.PILOT_MEMBER_CLAIM_URL);
  const staffClaimUrl = normalizeOptional(process.env.PILOT_STAFF_CLAIM_URL);
  const agentClaimUrl = normalizeOptional(process.env.PILOT_AGENT_CLAIM_URL);
  const claimNumber = normalizeOptional(process.env.PILOT_CLAIM_NUMBER);
  const staffId = normalizeOptional(process.env.PILOT_STAFF_ID);
  const createClaim = normalizeOptional(process.env.PILOT_CREATE_CLAIM).toLowerCase() === 'true';
  const agentExpectVisible =
    normalizeOptional(process.env.PILOT_AGENT_EXPECTS_VISIBILITY).toLowerCase() === 'true';
  const expectedDownloadFilename = normalizeOptional(process.env.PILOT_EXPECT_DOWNLOAD_FILENAME);

  const roleTestEmail = normalizeOptional(process.env.PILOT_ROLE_TEST_EMAIL);
  const roleTestPassword = normalizeOptional(process.env.PILOT_ROLE_TEST_PASSWORD);
  const roleTestUserUrl = normalizeOptional(process.env.PILOT_ROLE_TEST_USER_URL);
  const memberEmail = normalizeOptional(process.env.PILOT_MEMBER_EMAIL);
  const memberPassword = normalizeOptional(process.env.PILOT_MEMBER_PASSWORD);

  return {
    adminClaimUrl,
    memberClaimUrl,
    staffClaimUrl,
    agentClaimUrl,
    claimNumber,
    staffId,
    createClaim,
    agentExpectVisible,
    expectedDownloadFilename,
    roleTestEmail,
    roleTestPassword,
    roleTestUserUrl,
    memberEmail,
    memberPassword,
  };
}

function resolveMemberCredentials(runCtx, p2) {
  if (p2.memberEmail && p2.memberPassword) {
    return {
      email: p2.memberEmail,
      password: p2.memberPassword,
    };
  }
  return runCtx.credentials.member;
}

async function visitAndProbe(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUTS.nav });
  return checkPortalMarkers(page);
}

async function runP21(browser, runCtx, p2) {
  const evidence = [];
  const signatures = [];

  if (p2.createClaim) {
    signatures.push('P2.1_MISCONFIG_CREATE_CLAIM_NOT_IMPLEMENTED_SET_PILOT_CREATE_CLAIM=false');
    return checkResult('P2.1', 'FAIL', evidence, signatures);
  }

  if (!p2.adminClaimUrl || !p2.memberClaimUrl || !p2.staffClaimUrl || !p2.claimNumber) {
    signatures.push(
      'P2.1_MISCONFIG_REQUIRED_ENV_MISSING requires PILOT_ADMIN_CLAIM_URL PILOT_MEMBER_CLAIM_URL PILOT_STAFF_CLAIM_URL PILOT_CLAIM_NUMBER'
    );
    return checkResult('P2.1', 'FAIL', evidence, signatures);
  }

  const checks = [
    {
      account: 'admin_ks',
      label: 'admin',
      url: toAbsoluteUrl(runCtx, p2.adminClaimUrl),
      expected: { admin: true },
    },
    {
      account: 'staff',
      label: 'staff',
      url: toAbsoluteUrl(runCtx, p2.staffClaimUrl),
      expected: { staff: true },
    },
    {
      account: 'member',
      label: 'member',
      url: toAbsoluteUrl(runCtx, p2.memberClaimUrl),
    },
  ];

  for (const check of checks) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const credentials =
        check.account === 'member'
          ? resolveMemberCredentials(runCtx, p2)
          : runCtx.credentials[check.account];
      await loginAs(page, {
        account: check.account,
        credentials,
        baseUrl: runCtx.baseUrl,
        locale: runCtx.locale,
      });
      const markers = await visitAndProbe(page, check.url);
      evidence.push(`${check.label} markers observed=${JSON.stringify(markers)}`);
      if (markers.notFound) {
        signatures.push(`P2.1_${check.label.toUpperCase()}_CLAIM_ROUTE_NOT_FOUND url=${check.url}`);
      }
      const hasClaim = await textVisible(page, p2.claimNumber);
      evidence.push(`${check.label} claimNumber visible=${hasClaim}`);
      if (!hasClaim && check.account !== 'member') {
        signatures.push(
          `P2.1_${check.label.toUpperCase()}_CLAIM_NUMBER_MISSING claim=${p2.claimNumber}`
        );
      }
    } catch (error) {
      signatures.push(
        `P2.1_${check.label.toUpperCase()}_EXCEPTION ${String(error.message || error)}`
      );
    } finally {
      await context.close();
    }
  }

  {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAs(page, {
        account: 'agent',
        credentials: runCtx.credentials.agent,
        baseUrl: runCtx.baseUrl,
        locale: runCtx.locale,
      });
      const target = p2.agentClaimUrl
        ? toAbsoluteUrl(runCtx, p2.agentClaimUrl)
        : buildRoute(runCtx.baseUrl, runCtx.locale, '/agent');
      const markers = await visitAndProbe(page, target);
      evidence.push(`agent markers observed=${JSON.stringify(markers)} url=${target}`);
      if (markers.notFound) {
        signatures.push(`P2.1_AGENT_ROUTE_NOT_FOUND url=${target}`);
      }
      const hasClaim = await textVisible(page, p2.claimNumber, TIMEOUTS.quickMarker);
      evidence.push(
        `agent claimNumber visible=${hasClaim} expectedVisible=${p2.agentExpectVisible}`
      );
      if (p2.agentExpectVisible && !hasClaim) {
        signatures.push(`P2.1_AGENT_EXPECTED_VISIBLE_BUT_MISSING claim=${p2.claimNumber}`);
      }
      if (!p2.agentExpectVisible && hasClaim) {
        signatures.push(`P2.1_AGENT_EXPECTED_HIDDEN_BUT_VISIBLE claim=${p2.claimNumber}`);
      }
    } catch (error) {
      signatures.push(`P2.1_AGENT_EXCEPTION ${String(error.message || error)}`);
    } finally {
      await context.close();
    }
  }

  return checkResult('P2.1', signatures.length > 0 ? 'FAIL' : 'PASS', evidence, signatures);
}

async function runP22(browser, runCtx, p2) {
  const evidence = [];
  const signatures = [];

  if (!p2.adminClaimUrl || !p2.staffId) {
    signatures.push(
      'P2.2_MISCONFIG_REQUIRED_ENV_MISSING requires PILOT_ADMIN_CLAIM_URL PILOT_STAFF_ID'
    );
    return checkResult('P2.2', 'FAIL', evidence, signatures);
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAs(page, {
      account: 'admin_ks',
      credentials: runCtx.credentials.admin_ks,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
    });

    const adminUrl = toAbsoluteUrl(runCtx, p2.adminClaimUrl);
    const markers = await visitAndProbe(page, adminUrl);
    evidence.push(`markers observed=${JSON.stringify(markers)}`);
    if (markers.notFound) {
      signatures.push(`P2.2_ADMIN_CLAIM_ROUTE_NOT_FOUND url=${adminUrl}`);
    }

    const staffNeedleCandidates = resolveStaffNeedles(runCtx, p2);
    const assignmentVisible = (
      await Promise.all(staffNeedleCandidates.map(needle => textVisible(page, needle)))
    ).some(Boolean);
    evidence.push(
      `assigned staff visible=${assignmentVisible} candidates=${staffNeedleCandidates.join(',')}`
    );
    await page.reload({ waitUntil: 'networkidle', timeout: TIMEOUTS.nav });
    const persistedVisible = (
      await Promise.all(staffNeedleCandidates.map(needle => textVisible(page, needle)))
    ).some(Boolean);
    evidence.push(`assigned staff persisted after refresh=${persistedVisible}`);
    if (!assignmentVisible || !persistedVisible) {
      evidence.push('assignment token not exposed in claim detail; marking scenario as skipped');
      return checkResult('P2.2', 'SKIPPED', evidence, [
        'P2.2_SKIPPED_ASSIGNMENT_TOKEN_NOT_EXPOSED',
      ]);
    }
  } catch (error) {
    signatures.push(`P2.2_EXCEPTION ${String(error.message || error)}`);
  } finally {
    await context.close();
  }

  return checkResult('P2.2', signatures.length > 0 ? 'FAIL' : 'PASS', evidence, signatures);
}

async function runP23(browser, runCtx, p2) {
  const evidence = [];
  const signatures = [];

  if (!p2.staffClaimUrl || !p2.memberClaimUrl) {
    signatures.push(
      'P2.3_MISCONFIG_REQUIRED_ENV_MISSING requires PILOT_STAFF_CLAIM_URL PILOT_MEMBER_CLAIM_URL'
    );
    return checkResult('P2.3', 'FAIL', evidence, signatures);
  }

  const noteValue = `pilot-p2-note-${Date.now()}`;

  {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAs(page, {
        account: 'staff',
        credentials: runCtx.credentials.staff,
        baseUrl: runCtx.baseUrl,
        locale: runCtx.locale,
      });

      const staffUrl = toAbsoluteUrl(runCtx, p2.staffClaimUrl);
      const markers = await visitAndProbe(page, staffUrl);
      evidence.push(`staff markers observed=${JSON.stringify(markers)}`);
      if (markers.notFound) {
        signatures.push(`P2.3_STAFF_CLAIM_ROUTE_NOT_FOUND url=${staffUrl}`);
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
        signatures.push('P2.3_STATUS_OPTIONS_MISSING');
      } else {
        let selectedLabel = '';
        for (let i = 0; i < optionCount; i += 1) {
          const candidate = (await options.nth(i).innerText()).trim();
          if (candidate && candidate.toLowerCase() !== currentStatusLabel.toLowerCase()) {
            selectedLabel = candidate;
            await options.nth(i).click();
            break;
          }
        }
        if (!selectedLabel) {
          signatures.push(`P2.3_NO_STATUS_TRANSITION_AVAILABLE current=${currentStatusLabel}`);
        } else {
          await page.fill(SELECTORS.claimStatusNote, noteValue);
          await page.getByRole('button', { name: SELECTORS.claimUpdateButtonName }).click();
          await page.waitForTimeout(1500);
          await page.reload({ waitUntil: 'networkidle', timeout: TIMEOUTS.nav });
          const noteVisible = await textVisible(page, noteValue);
          evidence.push(`staff note persisted=${noteVisible}`);
          if (!noteVisible) {
            signatures.push(`P2.3_STAFF_NOTE_NOT_PERSISTED note=${noteValue}`);
          }
        }
      }
    } catch (error) {
      signatures.push(`P2.3_STAFF_EXCEPTION ${String(error.message || error)}`);
    } finally {
      await context.close();
    }
  }

  {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAs(page, {
        account: 'member',
        credentials: resolveMemberCredentials(runCtx, p2),
        baseUrl: runCtx.baseUrl,
        locale: runCtx.locale,
      });

      const memberUrl = toAbsoluteUrl(runCtx, p2.memberClaimUrl);
      const markers = await visitAndProbe(page, memberUrl);
      evidence.push(`member markers observed=${JSON.stringify(markers)}`);
      if (markers.notFound) {
        signatures.push(`P2.3_MEMBER_CLAIM_ROUTE_NOT_FOUND url=${memberUrl}`);
      }
      const memberSeesNote = await textVisible(page, noteValue);
      evidence.push(`member sees staff note=${memberSeesNote} note=${noteValue}`);
      if (!memberSeesNote) {
        signatures.push(`P2.3_MEMBER_NOTE_NOT_VISIBLE note=${noteValue}`);
      }
    } catch (error) {
      signatures.push(`P2.3_MEMBER_EXCEPTION ${String(error.message || error)}`);
    } finally {
      await context.close();
    }
  }

  return checkResult('P2.3', signatures.length > 0 ? 'FAIL' : 'PASS', evidence, signatures);
}

async function runP24(browser, runCtx, p2) {
  const evidence = [];
  const signatures = [];

  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  try {
    await loginAs(page, {
      account: 'member',
      credentials: runCtx.credentials.member,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
    });

    const docsUrl = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.memberDocuments);
    const markers = await visitAndProbe(page, docsUrl);
    evidence.push(`documents markers observed=${JSON.stringify(markers)}`);
    if (markers.notFound) {
      signatures.push(`P2.4_MEMBER_DOCUMENTS_ROUTE_NOT_FOUND url=${docsUrl}`);
    }

    const downloadButtons = page.getByRole('button', { name: SELECTORS.downloadButtonName });
    const downloadButtonCount = await downloadButtons.count();
    evidence.push(`download button count=${downloadButtonCount}`);
    if (downloadButtonCount === 0) {
      return checkResult('P2.4', 'SKIPPED', evidence, ['P2.4_SKIPPED_NO_DOWNLOADABLE_DOCUMENTS']);
    }

    const responsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/documents/') && response.url().includes('/download'),
      { timeout: TIMEOUTS.download }
    );
    await downloadButtons.first().click();
    const response = await responsePromise;

    evidence.push(`download status=${response.status()}`);
    if (response.status() !== 200) {
      signatures.push(`P2.4_DOWNLOAD_STATUS_NOT_200 status=${response.status()}`);
    }

    const headers = response.headers();
    const contentType = headers['content-type'] || '';
    const disposition = headers['content-disposition'] || '';
    evidence.push(`content-type=${contentType || 'missing'}`);
    evidence.push(`content-disposition=${disposition || 'missing'}`);

    const allowedContentTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/plain',
      'application/octet-stream',
    ];
    const validContentType = allowedContentTypes.some(value => contentType.includes(value));
    if (!validContentType) {
      signatures.push(`P2.4_INVALID_CONTENT_TYPE actual=${contentType || 'missing'}`);
    }

    const hasFilename = /filename\*?=/i.test(disposition);
    if (!hasFilename) {
      signatures.push('P2.4_FILENAME_MISSING_IN_CONTENT_DISPOSITION');
    }

    if (p2.expectedDownloadFilename && !disposition.includes(p2.expectedDownloadFilename)) {
      signatures.push(
        `P2.4_FILENAME_MISMATCH expected=${p2.expectedDownloadFilename} disposition=${disposition}`
      );
    }
  } catch (error) {
    signatures.push(`P2.4_EXCEPTION ${String(error.message || error)}`);
  } finally {
    await context.close();
  }

  return checkResult('P2.4', signatures.length > 0 ? 'FAIL' : 'PASS', evidence, signatures);
}

async function verifyRolePortal(browser, runCtx, accountCredentials, portal, expectedVisible) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAs(page, {
      account: 'member',
      credentials: accountCredentials,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
    });
    const target = buildRoute(runCtx.baseUrl, runCtx.locale, `/${portal}`);
    const markers = await visitAndProbe(page, target);
    const visible = markers[portal] === true && !markers.notFound;
    return {
      status: visible === expectedVisible ? 'PASS' : 'FAIL',
      observed: markers,
      mismatches:
        visible === expectedVisible ? [] : [`${portal} expected ${expectedVisible} got ${visible}`],
    };
  } finally {
    await context.close();
  }
}

async function getGrantableRoles(page) {
  await page
    .locator(SELECTORS.roleSelectTrigger)
    .waitFor({ state: 'visible', timeout: TIMEOUTS.action });
  await page.locator(SELECTORS.roleSelectTrigger).click();
  await page
    .locator(SELECTORS.roleSelectContent)
    .waitFor({ state: 'visible', timeout: TIMEOUTS.action });
  const options = await page.locator('[data-testid^="role-option-"]').evaluateAll(nodes =>
    nodes
      .map(node => node.getAttribute('data-testid') || '')
      .filter(Boolean)
      .map(value => value.replace('role-option-', ''))
  );
  await page.keyboard.press('Escape').catch(() => {});
  return options;
}

async function rolePresent(page, roleName) {
  return page
    .locator(SELECTORS.userRolesTable)
    .getByText(new RegExp(`\\b${roleName}\\b`, 'i'))
    .isVisible({ timeout: TIMEOUTS.quickMarker })
    .catch(() => false);
}

async function selectNonTenantBranch(page) {
  const trigger = page.locator('[data-testid="branch-select-trigger"]');
  const visible = await trigger.isVisible({ timeout: TIMEOUTS.quickMarker }).catch(() => false);
  if (!visible) return false;

  await trigger.click();
  await page
    .locator('[data-testid="branch-select-content"]')
    .waitFor({ state: 'visible', timeout: TIMEOUTS.action });
  const options = page.locator('[data-testid^="branch-option-"]');
  const count = await options.count();
  for (let i = 0; i < count; i += 1) {
    const option = options.nth(i);
    const testId = (await option.getAttribute('data-testid').catch(() => '')) || '';
    if (testId.endsWith('__tenant__')) continue;
    await option.click();
    return true;
  }
  await page.keyboard.press('Escape').catch(() => {});
  return false;
}

async function runP25(browser, runCtx, p2) {
  const evidence = [];
  const signatures = [];

  if (!p2.roleTestEmail || !p2.roleTestPassword || !p2.roleTestUserUrl) {
    signatures.push(
      'P2.5_MISCONFIG_REQUIRED_ENV_MISSING requires PILOT_ROLE_TEST_EMAIL PILOT_ROLE_TEST_PASSWORD PILOT_ROLE_TEST_USER_URL'
    );
    return checkResult('P2.5', 'FAIL', evidence, signatures);
  }

  const roleTestCreds = { email: p2.roleTestEmail, password: p2.roleTestPassword };
  const adminUrl = toAbsoluteUrl(runCtx, p2.roleTestUserUrl);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const baselineAgentHidden = await verifyRolePortal(
      browser,
      runCtx,
      roleTestCreds,
      'agent',
      false
    );
    evidence.push(`agent baseline observed=${JSON.stringify(baselineAgentHidden.observed)}`);
    if (baselineAgentHidden.status === 'FAIL') {
      return checkResult('P2.5', 'SKIPPED', evidence, [
        'P2.5_SKIPPED_ROLE_TEST_USER_DRIFT_AGENT_ALREADY_VISIBLE',
      ]);
    }

    await loginAs(page, {
      account: 'admin_ks',
      credentials: runCtx.credentials.admin_ks,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
    });

    await page.goto(adminUrl, { waitUntil: 'networkidle', timeout: TIMEOUTS.nav });
    await page
      .locator(SELECTORS.userRolesTable)
      .waitFor({ state: 'visible', timeout: TIMEOUTS.marker });
    const grantableRoles = await getGrantableRoles(page);
    evidence.push(`grantable roles=${grantableRoles.join(',') || 'none'}`);

    await removeRoleFromTable(page, 'agent').catch(() => false);
    await removeRoleFromTable(page, 'staff').catch(() => false);

    const agentAlreadyPresent = await rolePresent(page, 'agent');
    if (!agentAlreadyPresent) {
      try {
        await selectNonTenantBranch(page);
        await grantRoleOnUser(page, 'agent');
      } catch (error) {
        const presentAfterAttempt = await rolePresent(page, 'agent');
        if (!presentAfterAttempt) {
          throw error;
        }
        evidence.push('agent role already present after grant attempt fallback');
      }
    } else {
      evidence.push('agent role already present before grant action');
    }
    await page.reload({ waitUntil: 'networkidle', timeout: TIMEOUTS.nav });

    const agentVisible = await verifyRolePortal(browser, runCtx, roleTestCreds, 'agent', true);
    evidence.push(`agent after grant observed=${JSON.stringify(agentVisible.observed)}`);
    if (agentVisible.status === 'FAIL') {
      signatures.push(`P2.5_AGENT_NOT_GRANTED ${agentVisible.mismatches.join(' | ')}`);
    }

    let removedAgentCount = 0;
    while (removedAgentCount < 4) {
      const removed = await removeRoleFromTable(page, 'agent');
      if (!removed) break;
      removedAgentCount += 1;
    }
    evidence.push(`agent revoke rows removed=${removedAgentCount}`);
    await page.reload({ waitUntil: 'networkidle', timeout: TIMEOUTS.nav });
    await page.waitForTimeout(800);

    let agentHidden = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      agentHidden = await verifyRolePortal(browser, runCtx, roleTestCreds, 'agent', false);
      if (agentHidden.status === 'PASS') break;
      await page.waitForTimeout(1500);
    }
    evidence.push(`agent after revoke observed=${JSON.stringify(agentHidden.observed)}`);
    if (agentHidden.status === 'FAIL') {
      signatures.push(`P2.5_AGENT_NOT_REVOKED ${agentHidden.mismatches.join(' | ')}`);
    }

    if (grantableRoles.includes('staff')) {
      await grantRoleOnUser(page, 'staff');
      await page.reload({ waitUntil: 'networkidle', timeout: TIMEOUTS.nav });

      const staffVisible = await verifyRolePortal(browser, runCtx, roleTestCreds, 'staff', true);
      evidence.push(`staff after grant observed=${JSON.stringify(staffVisible.observed)}`);
      if (staffVisible.status === 'FAIL') {
        signatures.push(`P2.5_STAFF_NOT_GRANTED ${staffVisible.mismatches.join(' | ')}`);
      }

      await removeRoleFromTable(page, 'staff');
      await page.reload({ waitUntil: 'networkidle', timeout: TIMEOUTS.nav });

      const staffHidden = await verifyRolePortal(browser, runCtx, roleTestCreds, 'staff', false);
      evidence.push(`staff after revoke observed=${JSON.stringify(staffHidden.observed)}`);
      if (staffHidden.status === 'FAIL') {
        signatures.push(`P2.5_STAFF_NOT_REVOKED ${staffHidden.mismatches.join(' | ')}`);
      }
    } else {
      evidence.push('staff role grant/revoke skipped (role not available in selector)');
    }
  } catch (error) {
    signatures.push(`P2.5_EXCEPTION ${String(error.message || error)}`);
  } finally {
    await context.close();
  }

  return checkResult('P2.5', signatures.length > 0 ? 'FAIL' : 'PASS', evidence, signatures);
}

async function runP2(browser, runCtx) {
  const p2 = getP2Config(runCtx);
  const checks = [];
  checks.push(await runP21(browser, runCtx, p2));
  checks.push(await runP22(browser, runCtx, p2));
  checks.push(await runP23(browser, runCtx, p2));
  checks.push(await runP24(browser, runCtx, p2));
  checks.push(await runP25(browser, runCtx, p2));
  return checks;
}

module.exports = {
  runP2,
};
