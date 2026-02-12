const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  ROUTES,
  MARKERS,
  SELECTORS,
  TIMEOUTS,
  EXPECTED_VERCEL_LOG_NOISE,
  FUNCTIONAL_LOG_ERROR_HINTS,
} = require('../config.ts');
const {
  checkResult,
  envFlag,
  loginAs,
  buildRoute,
  sleep,
  markerSnapshot,
} = require('../lib/gate-utils.ts');

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
  const requireMemberUpload = envFlag('RELEASE_GATE_REQUIRE_MEMBER_UPLOAD', true);

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
    await page.waitForTimeout(1600);
    await page.getByText(uploadName).waitFor({ state: 'visible', timeout: TIMEOUTS.upload });
    evidenceP11.push(`upload file listed after submit: ${uploadName}`);

    const refreshStart = Date.now();
    while (Date.now() - refreshStart < TIMEOUTS.upload) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
      persistenceAfterRefresh = await page
        .getByText(uploadName)
        .isVisible({ timeout: TIMEOUTS.quickMarker })
        .catch(() => false);
      if (persistenceAfterRefresh) break;
      await sleep(500);
    }
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
    const reloginStart = Date.now();
    while (Date.now() - reloginStart < TIMEOUTS.upload) {
      persistenceAfterRelogin = await reloginPage
        .getByText(uploadName)
        .isVisible({ timeout: TIMEOUTS.quickMarker })
        .catch(() => false);
      if (persistenceAfterRelogin) break;
      await reloginPage
        .reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav })
        .catch(() => {});
      await sleep(500);
    }
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
    if (rawMessage.includes('NO_MEMBER_DOCUMENT_UPLOAD_BUTTONS')) {
      signaturesP11.push(
        'P1.1_MISCONFIG_MEMBER_UPLOAD_PRECONDITION_NOT_MET reason=no_upload_entry_buttons'
      );
    } else {
      signaturesP11.push(`P1.1_EXCEPTION message=${rawMessage}`);
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
        : buildRoute(runCtx.baseUrl, runCtx.locale, claimUrlFromEnv);
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
        : buildRoute(runCtx.baseUrl, runCtx.locale, hrefs[0]);
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

module.exports = {
  runP11AndP12,
  runP13,
  runVercelLogsSweep,
};
