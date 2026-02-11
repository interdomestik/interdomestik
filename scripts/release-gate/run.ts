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
  ROLE_IPS,
  ACCOUNTS,
  REQUIRED_ENV_BY_SUITE,
  EXPECTED_VERCEL_LOG_NOISE,
  FUNCTIONAL_LOG_ERROR_HINTS,
} = require('./config.ts');
const { writeReleaseGateReport } = require('./report.ts');

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

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

function buildRoute(baseUrl, locale, routePath) {
  const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `${baseUrl}/${locale}${normalized}`;
}

function getMissingEnv(requiredVars) {
  return requiredVars.filter(
    varName => !process.env[varName] || String(process.env[varName]).trim() === ''
  );
}

function checkResult(id, status, evidence, signatures) {
  return {
    id,
    status,
    evidence: evidence || [],
    signatures: signatures || [],
  };
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

async function loginAs(page, params) {
  const { account, credentials, baseUrl, locale } = params;
  const origin = new URL(baseUrl).origin;
  const loginUrl = `${origin}/api/auth/sign-in/email`;

  await page.context().clearCookies();

  const response = await page.request.post(loginUrl, {
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

  if (!response.ok()) {
    throw new Error(
      `AUTH_LOGIN_FAILED account=${account} status=${response.status()} url=${response.url()}`
    );
  }

  const marker = roleMarkerForAccount(account);
  const defaultPath =
    account === 'agent' ? ROUTES.rbacTargets[1] : account.replace('_ks', '').replace('_mk', '');
  await page.goto(buildRoute(baseUrl, locale, `/${defaultPath}`), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUTS.nav,
  });
  await page.getByTestId(marker).waitFor({ state: 'visible', timeout: TIMEOUTS.marker });
}

async function markerSnapshot(page) {
  const markerKeys = ['member', 'agent', 'staff', 'admin'];
  const snapshot = {};
  for (const markerKey of markerKeys) {
    snapshot[markerKey] = await page
      .getByTestId(MARKERS[markerKey])
      .isVisible({ timeout: TIMEOUTS.quickMarker })
      .catch(() => false);
  }
  return snapshot;
}

function markerSummary(route, markerState) {
  return `${route} => member=${markerState.member}, agent=${markerState.agent}, staff=${markerState.staff}, admin=${markerState.admin}`;
}

async function runP01(browser, runCtx) {
  const accounts = ['member', 'agent', 'staff', 'admin_ks'];
  const evidence = [];
  const failures = [];

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

      const expectedMarker = ACCOUNTS[account].roleMarker;
      for (const portal of ROUTES.rbacTargets) {
        const route = `/${portal}`;
        await page.goto(buildRoute(runCtx.baseUrl, runCtx.locale, route), {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.nav,
        });
        await page.waitForTimeout(350);

        const current = await markerSnapshot(page);
        evidence.push(`${account} ${markerSummary(route, current)}`);

        const expectedVisible = current[expectedMarker] === true;
        const others = Object.keys(current).filter(key => key !== expectedMarker);
        const unexpectedVisible = others.filter(key => current[key] === true);

        if (!expectedVisible || unexpectedVisible.length > 0) {
          failures.push(
            `P0.1_RBAC_MARKER_MISMATCH account=${account} route=/${runCtx.locale}${route} expected=${expectedMarker} visible=${JSON.stringify(current)}`
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
  await page.locator(SELECTORS.roleSelectTrigger).click();
  await page
    .locator(SELECTORS.roleSelectContent)
    .waitFor({ state: 'visible', timeout: TIMEOUTS.action });
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
  const defaultTarget = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.defaultAdminUserUrl);
  const targetUrl =
    targetFromEnv && targetFromEnv.startsWith('http')
      ? targetFromEnv
      : targetFromEnv
        ? buildRoute(runCtx.baseUrl, runCtx.locale, targetFromEnv)
        : defaultTarget;

  try {
    await loginAs(page, {
      account: 'admin_ks',
      credentials: runCtx.credentials.admin_ks,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
    await page
      .locator(SELECTORS.roleSelectTrigger)
      .waitFor({ state: 'visible', timeout: TIMEOUTS.marker });

    let cleanupCount = 0;
    while (cleanupCount < 4) {
      const removed = await removeRoleFromTable(page, roleToToggle);
      if (!removed) break;
      cleanupCount += 1;
    }
    evidenceP03.push(`target=${targetUrl}`);
    evidenceP03.push(`pre-clean removed_existing_role_entries=${cleanupCount}`);

    await addRole(page, roleToToggle);
    const afterAdd = await page
      .locator(SELECTORS.userRolesTable)
      .getByText(new RegExp(`\\b${roleToToggle}\\b`, 'i'))
      .isVisible({ timeout: TIMEOUTS.action })
      .catch(() => false);
    evidenceP03.push(`added_role=${roleToToggle} visible_in_roles_table=${afterAdd}`);
    if (!afterAdd) {
      failuresP03.push(`P0.3_ROLE_ADD_FAILED role=${roleToToggle} target=${targetUrl}`);
    }

    const removedAddedRole = await removeRoleFromTable(page, roleToToggle);
    if (!removedAddedRole) {
      failuresP04.push(`P0.4_ROLE_REMOVE_CLICK_FAILED role=${roleToToggle} target=${targetUrl}`);
    }

    const stillVisible = await page
      .locator(SELECTORS.userRolesTable)
      .getByText(new RegExp(`\\b${roleToToggle}\\b`, 'i'))
      .isVisible({ timeout: TIMEOUTS.action })
      .catch(() => false);
    evidenceP04.push(`removed_role=${roleToToggle} remaining_in_roles_table=${stillVisible}`);
    if (stillVisible) {
      failuresP04.push(`P0.4_ROLE_REMOVE_FAILED role=${roleToToggle} target=${targetUrl}`);
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

async function runP11AndP12(browser, runCtx) {
  const evidenceP11 = [];
  const signaturesP11 = [];
  const evidenceP12 = [];
  const signaturesP12 = [];

  const now = Date.now();
  const uploadName = `gate-upload-${now}.txt`;
  const uploadPath = path.join(os.tmpdir(), uploadName);
  fs.writeFileSync(uploadPath, `release-gate upload ${now}\n`, 'utf8');

  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  let signedUploadStatuses = [];
  let documentsDownloadStatuses = [];
  let persistenceAfterRefresh = false;
  let persistenceAfterRelogin = false;

  page.on('response', response => {
    const url = response.url();
    if (url.includes('/storage/v1/object/upload/sign/')) {
      signedUploadStatuses.push(`${response.status()}@${url}`);
    }
    if (url.includes('/api/documents/') && url.includes('/download')) {
      documentsDownloadStatuses.push(`${response.status()}@${url}`);
    }
  });

  try {
    await loginAs(page, {
      account: 'member',
      credentials: runCtx.credentials.member,
      baseUrl: runCtx.baseUrl,
      locale: runCtx.locale,
    });

    const docsUrl = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.memberDocuments);
    await page.goto(docsUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
    await page.locator(SELECTORS.memberDocumentsUploadButtons).first().waitFor({
      state: 'visible',
      timeout: TIMEOUTS.marker,
    });

    await page.locator(SELECTORS.memberDocumentsUploadButtons).first().click();
    await page.getByRole('dialog', { name: SELECTORS.uploadDialogName }).waitFor({
      state: 'visible',
      timeout: TIMEOUTS.action,
    });
    await page.setInputFiles(SELECTORS.fileInput, uploadPath);
    await page.getByRole('button', { name: SELECTORS.uploadButtonName }).click();
    await page.waitForTimeout(1600);
    await page.getByText(uploadName).waitFor({ state: 'visible', timeout: TIMEOUTS.upload });
    evidenceP11.push(`upload file listed after submit: ${uploadName}`);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
    persistenceAfterRefresh = await page
      .getByText(uploadName)
      .isVisible({ timeout: TIMEOUTS.marker })
      .catch(() => false);
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
    });
    await reloginPage.goto(docsUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
    persistenceAfterRelogin = await reloginPage
      .getByText(uploadName)
      .isVisible({ timeout: TIMEOUTS.marker })
      .catch(() => false);
    evidenceP11.push(`after logout/login listed=${persistenceAfterRelogin}`);

    const signed200 = signedUploadStatuses.some(entry => entry.startsWith('200@'));
    evidenceP11.push(
      `signed upload statuses: ${signedUploadStatuses.length ? signedUploadStatuses.join(' | ') : 'none captured'}`
    );
    if (!persistenceAfterRefresh || !persistenceAfterRelogin) {
      signaturesP11.push(
        `P1.1_UPLOAD_PERSISTENCE_FAILED refresh=${persistenceAfterRefresh} relogin=${persistenceAfterRelogin} file=${uploadName}`
      );
    }
    if (!signed200 && !(persistenceAfterRefresh && persistenceAfterRelogin)) {
      signaturesP11.push(`P1.1_SIGNED_UPLOAD_NOT_CONFIRMED file=${uploadName}`);
    }

    const fileRow = reloginPage.locator('div, tr').filter({ hasText: uploadName }).first();
    await fileRow.getByRole('button', { name: SELECTORS.downloadButtonName }).click();
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
      .click()
      .catch(() => {});
    await popupPromise;
    evidenceP12.push(`inline/open action succeeded=${inlineOpened}`);

    if (!has200DownloadResponse && !inlineOpened) {
      signaturesP12.push(`P1.2_DOWNLOAD_FAILED file=${uploadName}`);
    }

    await reloginContext.close();
  } catch (error) {
    signaturesP11.push(`P1.1_EXCEPTION message=${String(error.message || error)}`);
    signaturesP12.push(`P1.2_EXCEPTION message=${String(error.message || error)}`);
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
    });

    const claimUrlFromEnv = process.env.STAFF_CLAIM_URL;
    let detailUrl =
      claimUrlFromEnv && claimUrlFromEnv.startsWith('http')
        ? claimUrlFromEnv
        : claimUrlFromEnv
          ? buildRoute(runCtx.baseUrl, runCtx.locale, claimUrlFromEnv)
          : null;

    if (!detailUrl) {
      const claimsList = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.staffClaimsList);
      await page.goto(claimsList, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
      await page.getByTestId(MARKERS.staff).waitFor({ state: 'visible', timeout: TIMEOUTS.marker });
      await page.locator(SELECTORS.staffClaimOpenButton).first().click();
      await page.waitForURL(/\/staff\/claims\/[^/?#]+/, { timeout: TIMEOUTS.nav });
      detailUrl = page.url();
    } else {
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
    }

    evidence.push(`claim_url=${detailUrl}`);
    await page.locator(SELECTORS.staffClaimDetailReady).waitFor({
      state: 'visible',
      timeout: TIMEOUTS.marker,
    });
    await page.locator(SELECTORS.staffClaimActionPanel).waitFor({
      state: 'visible',
      timeout: TIMEOUTS.marker,
    });

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

        const statusPersisted = await page
          .locator(SELECTORS.staffClaimSection)
          .getByText(selectedLabel, { exact: false })
          .isVisible({ timeout: TIMEOUTS.marker })
          .catch(() => false);
        evidence.push(`status persisted=${statusPersisted}`);
        if (!statusPersisted) {
          signatures.push(`P1.3_STATUS_NOT_PERSISTED expected="${selectedLabel}"`);
        }
      }
    }
  } catch (error) {
    signatures.push(`P1.3_EXCEPTION message=${String(error.message || error)}`);
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

  if (logs.error) {
    evidence.push(`vercel logs failed to execute; skipped (${logs.error.message})`);
    return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
  }

  const combined = `${logs.stdout || ''}\n${logs.stderr || ''}`;
  const lines = combined
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (logs.status !== 0) {
    evidence.push(`vercel logs exited ${logs.status}; skipped`);
    evidence.push(...lines.slice(0, 4));
    return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
  }

  const meaningful = lines.filter(
    line => !EXPECTED_VERCEL_LOG_NOISE.some(pattern => pattern.test(line))
  );

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
    };

    const selected = SUITES[args.suite];

    if (selected.includes('P0.1')) checks.push(await runP01(browser, runCtx));
    if (selected.includes('P0.2')) checks.push(await runP02(browser, runCtx));
    if (selected.includes('P0.3') || selected.includes('P0.4')) {
      const roleChecks = await runP03AndP04(browser, runCtx);
      if (selected.includes('P0.3')) checks.push(roleChecks[0]);
      if (selected.includes('P0.4')) checks.push(roleChecks[1]);
    }
    if (selected.includes('P1.1') || selected.includes('P1.2')) {
      const memberChecks = await runP11AndP12(browser, runCtx);
      if (selected.includes('P1.1')) checks.push(memberChecks[0]);
      if (selected.includes('P1.2')) checks.push(memberChecks[1]);
    }
    if (selected.includes('P1.3')) checks.push(await runP13(browser, runCtx));
    if (selected.includes('P1.5.1')) checks.push(runVercelLogsSweep(runCtx));

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
      checks,
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
    for (const check of checks) {
      console.log(`[release-gate] ${check.id}=${check.status}`);
      for (const signature of check.signatures || []) {
        console.error(`[release-gate] signature ${signature}`);
      }
    }

    const hasFailure = checks.some(check => check.status === 'FAIL');
    process.exit(hasFailure ? 1 : 0);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(`[release-gate] Fatal error: ${String(error.message || error)}`);
  process.exit(2);
});
