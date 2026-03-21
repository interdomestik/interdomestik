const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { MARKERS, ROUTES, SELECTORS, TIMEOUTS } = require('./config.ts');
const {
  buildRoute,
  buildRouteAllowingLocalePath,
  envFlag,
  gotoWithTransientRetry,
  markerSnapshot,
  sleep,
} = require('./shared.ts');
const { seedCookieConsentState } = require('./scenario-visits.ts');
const { collectStaffClaimDetailUrls } = require('./staff-claim-driver.ts');
const { gotoWithSessionRetry, loginWithRunContext } = require('./session-navigation.ts');

const MEMBER_DOCUMENTS_CLAIM_CARD_SELECTOR = '[data-testid^="member-documents-claim-"]';
const DEFAULT_P13_STAFF_CLAIM_ROUTE = '/staff/claims/golden_ks_a_claim_05';
const ACTIONABLE_CLAIM_STATUS_LABELS = new Set([
  'Submitted',
  'Verification',
  'Evaluation',
  'Negotiation',
  'Court',
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

function isLoginUrl(url) {
  return /\/login(?:[/?#]|$)/.test(String(url || ''));
}

async function waitForAnyVisible(page, selectors, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const selector of selectors) {
      const visible = await page
        .locator(selector)
        .isVisible({ timeout: TIMEOUTS.quickMarker })
        .catch(() => false);
      if (visible) {
        return selector;
      }
    }
    await page.waitForTimeout(350);
  }
  return null;
}

async function waitForMemberDocumentsSurface(page) {
  const visibleSelector = await waitForAnyVisible(
    page,
    [SELECTORS.memberDocumentsReady, SELECTORS.memberDocumentsEmptyState],
    TIMEOUTS.marker
  );

  if (visibleSelector) {
    return { ready: true, visibleSelector };
  }

  await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }).catch(() => {});
  const retryVisibleSelector = await waitForAnyVisible(
    page,
    [SELECTORS.memberDocumentsReady, SELECTORS.memberDocumentsEmptyState],
    TIMEOUTS.marker
  );

  return {
    ready: Boolean(retryVisibleSelector),
    visibleSelector: retryVisibleSelector,
  };
}

async function waitForStaffClaimDetailSurface(page) {
  const visibleSelector = await waitForAnyVisible(
    page,
    [SELECTORS.staffClaimDetailReady, SELECTORS.staffClaimActionPanel, SELECTORS.staffClaimSection],
    TIMEOUTS.marker
  );

  if (!visibleSelector) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }).catch(() => {});
  }

  const retryVisibleSelector =
    visibleSelector ||
    (await waitForAnyVisible(
      page,
      [
        SELECTORS.staffClaimDetailReady,
        SELECTORS.staffClaimActionPanel,
        SELECTORS.staffClaimSection,
      ],
      TIMEOUTS.marker
    ));

  return {
    detailReady: retryVisibleSelector === SELECTORS.staffClaimDetailReady,
    actionPanelReady: retryVisibleSelector === SELECTORS.staffClaimActionPanel,
    claimSectionReady: retryVisibleSelector === SELECTORS.staffClaimSection,
    visibleSelector: retryVisibleSelector,
  };
}

function compactErrorMessage(raw, maxLength = 420) {
  return String(raw || '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function classifyInfraNetworkFailure(raw) {
  const message = compactErrorMessage(raw, 650);
  if (!message) return null;
  const matched = INFRA_NETWORK_ERROR_PATTERNS.some(pattern => pattern.test(message));
  return matched ? message : null;
}

function selectAlternativeActionableStatus(currentLabel, optionLabels) {
  const normalizedCurrent = String(currentLabel || '')
    .trim()
    .toLowerCase();
  for (const optionLabel of optionLabels) {
    const normalizedOption = String(optionLabel || '').trim();
    if (!normalizedOption || normalizedOption.toLowerCase() === normalizedCurrent) continue;
    if (ACTIONABLE_CLAIM_STATUS_LABELS.has(normalizedOption)) {
      return normalizedOption;
    }
  }
  return null;
}

async function closeBrowserContextWithTimeout(context, timeoutMs = 5_000) {
  if (!context) return;
  await Promise.race([context.close().catch(() => {}), sleep(timeoutMs)]);
}

function trimTrailingSlashes(pathname) {
  let end = pathname.length;
  while (end > 1 && pathname.codePointAt(end - 1) === 47) {
    end -= 1;
  }
  return pathname.slice(0, end);
}

function resolveConfiguredStaffClaimDetailUrl(runCtx) {
  const configured = String(process.env.STAFF_CLAIM_URL || '').trim();
  if (!configured) {
    return {
      reason: 'missing',
      source: 'missing',
      url: null,
    };
  }

  const targetUrl = /^https?:\/\//i.test(configured)
    ? configured
    : buildRouteAllowingLocalePath(runCtx.baseUrl, runCtx.locale, configured);

  try {
    const resolvedTarget = new URL(targetUrl);
    const resolvedList = new URL(buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.staffClaimsList));
    const normalizePath = pathname => trimTrailingSlashes(pathname) || '/';
    if (normalizePath(resolvedTarget.pathname) === normalizePath(resolvedList.pathname)) {
      return {
        reason: 'list-url',
        source: 'ignored-list',
        url: null,
      };
    }
  } catch {
    return {
      reason: 'invalid-url',
      source: 'invalid',
      url: null,
    };
  }

  return {
    reason: null,
    source: 'env',
    url: targetUrl,
  };
}

async function runP11AndP12(browser, runCtx, deps) {
  const { checkResult } = deps;
  const evidenceP11 = [];
  const signaturesP11 = [];
  const evidenceP12 = [];
  const signaturesP12 = [];

  const now = Date.now();
  const uploadName = `gate-upload-${now}.pdf`;
  const uploadPath = path.join(os.tmpdir(), uploadName);
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
  await seedCookieConsentState({ context, page, baseUrl: runCtx.baseUrl });
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
  let reloginContext = null;
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
    await loginWithRunContext(page, runCtx, 'member');

    const docsUrl = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.memberDocuments);
    await gotoWithSessionRetry({
      page,
      navigate: () => page.goto(docsUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
      retryLogin: () => loginWithRunContext(page, runCtx, 'member', { forceFresh: true }),
    });
    let initialDocumentsSurface = await waitForMemberDocumentsSurface(page);
    evidenceP11.push(`member_documents_url=${page.url()}`);
    if (!initialDocumentsSurface.ready && isLoginUrl(page.url())) {
      await loginWithRunContext(page, runCtx, 'member');
      await gotoWithSessionRetry({
        page,
        navigate: () =>
          page.goto(docsUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
        retryLogin: () => loginWithRunContext(page, runCtx, 'member', { forceFresh: true }),
      });
      initialDocumentsSurface = await waitForMemberDocumentsSurface(page);
      evidenceP11.push(`member_documents_url_retry=${page.url()}`);
    }
    evidenceP11.push(
      `member_documents_surface=${initialDocumentsSurface.visibleSelector || 'none'}`
    );
    if (!initialDocumentsSurface.ready) {
      throw new Error('MEMBER_DOCUMENTS_SURFACE_NOT_READY');
    }
    const claimCards = page.locator(MEMBER_DOCUMENTS_CLAIM_CARD_SELECTOR);
    const claimCardCount = await claimCards.count();
    evidenceP11.push(`member documents claim card count=${claimCardCount}`);
    if (claimCardCount === 0) {
      const createClaimVisible = await page
        .locator(SELECTORS.memberDocumentsCreateClaim)
        .isVisible({ timeout: TIMEOUTS.marker })
        .catch(() => false);
      evidenceP11.push(`member documents empty-state create claim visible=${createClaimVisible}`);
      if (!createClaimVisible) {
        signaturesP11.push('P1.1_MEMBER_DOCUMENTS_EMPTY_STATE_INVALID');
      }
      evidenceP12.push('skip_reason=valid_member_empty_state_no_claim_cards');
      return [
        checkResult('P1.1', signaturesP11.length ? 'FAIL' : 'PASS', evidenceP11, signaturesP11),
        checkResult('P1.2', 'SKIPPED', evidenceP12, ['P1.2_SKIPPED_VALID_MEMBER_EMPTY_STATE']),
      ];
    }

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

    reloginContext = await browser.newContext({ acceptDownloads: true });
    const reloginPage = await reloginContext.newPage();
    await seedCookieConsentState({
      context: reloginContext,
      page: reloginPage,
      baseUrl: runCtx.baseUrl,
    });
    reloginPage.on('response', response => {
      const url = response.url();
      if (url.includes('/api/documents/') && url.includes('/download')) {
        documentsDownloadStatuses.push(`${response.status()}@${url}`);
      }
    });

    await loginWithRunContext(reloginPage, runCtx, 'member');
    await gotoWithSessionRetry({
      page: reloginPage,
      navigate: () =>
        reloginPage.goto(docsUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
      retryLogin: () => loginWithRunContext(reloginPage, runCtx, 'member', { forceFresh: true }),
    });
    let reloginDocumentsSurface = await waitForMemberDocumentsSurface(reloginPage);
    evidenceP11.push(`member_documents_url_relogin=${reloginPage.url()}`);
    if (!reloginDocumentsSurface.ready && isLoginUrl(reloginPage.url())) {
      await loginWithRunContext(reloginPage, runCtx, 'member');
      await gotoWithSessionRetry({
        page: reloginPage,
        navigate: () =>
          reloginPage.goto(docsUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
        retryLogin: () =>
          loginWithRunContext(reloginPage, runCtx, 'member', {
            forceFresh: true,
          }),
      });
      reloginDocumentsSurface = await waitForMemberDocumentsSurface(reloginPage);
      evidenceP11.push(`member_documents_url_relogin_retry=${reloginPage.url()}`);
    }
    evidenceP11.push(
      `member_documents_surface_relogin=${reloginDocumentsSurface.visibleSelector || 'none'}`
    );
    if (!reloginDocumentsSurface.ready) {
      throw new Error('MEMBER_DOCUMENTS_SURFACE_NOT_READY_RELOGIN');
    }
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
      evidenceP12.push(
        `download response 200 observed=${has200DownloadResponse}`,
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

async function runP13(browser, runCtx, deps) {
  const { checkResult } = deps;
  const evidence = [];
  const signatures = [];
  let context = await browser.newContext();
  let page = await context.newPage();
  await seedCookieConsentState({ context, page, baseUrl: runCtx.baseUrl });

  const reopenStaffContext = async targetUrl => {
    await context.close().catch(() => {});
    context = await browser.newContext();
    page = await context.newPage();
    await seedCookieConsentState({ context, page, baseUrl: runCtx.baseUrl });
    await loginWithRunContext(page, runCtx, 'staff');
    await gotoWithSessionRetry({
      page,
      navigate: () =>
        page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
      retryLogin: () => loginWithRunContext(page, runCtx, 'staff', { forceFresh: true }),
    });
  };
  try {
    await loginWithRunContext(page, runCtx, 'staff');

    const claimsList = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.staffClaimsList);
    await gotoWithSessionRetry({
      page,
      navigate: () =>
        page.goto(claimsList, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
      retryLogin: () => loginWithRunContext(page, runCtx, 'staff', { forceFresh: true }),
    });
    const staffReadyOnList = await page
      .getByTestId(MARKERS.staff)
      .isVisible({ timeout: TIMEOUTS.marker })
      .catch(() => false);
    evidence.push(
      `staff_claims_list_url=${claimsList}`,
      `staff_page_ready_on_list=${staffReadyOnList}`
    );
    if (!staffReadyOnList) {
      signatures.push('P1.3_STAFF_PORTAL_NOT_READY');
      return checkResult('P1.3', 'FAIL', evidence, signatures);
    }

    const configuredClaim = resolveConfiguredStaffClaimDetailUrl(runCtx);
    const allowListFallback = envFlag('RELEASE_GATE_ALLOW_STAFF_CLAIM_LIST_FALLBACK', false);
    let detailUrl = null;

    if (configuredClaim.url) {
      detailUrl = configuredClaim.url;
      evidence.push('claim_source=STAFF_CLAIM_URL_OVERRIDE');
    } else {
      if (configuredClaim.reason === 'list-url') {
        evidence.push('claim_source=STAFF_CLAIM_URL_IGNORED_LIST');
      }

      const deterministicDetailUrl = buildRoute(
        runCtx.baseUrl,
        runCtx.locale,
        DEFAULT_P13_STAFF_CLAIM_ROUTE
      );
      await reopenStaffContext(deterministicDetailUrl);
      let deterministicNotFound = await page
        .getByTestId(MARKERS.notFound)
        .isVisible({ timeout: TIMEOUTS.quickMarker })
        .catch(() => false);
      let deterministicSurface = await waitForStaffClaimDetailSurface(page);
      let deterministicReady =
        deterministicSurface.detailReady ||
        deterministicSurface.actionPanelReady ||
        deterministicSurface.claimSectionReady;
      evidence.push(`deterministic_url=${page.url()}`);

      if (!deterministicNotFound && !deterministicReady && isLoginUrl(page.url())) {
        await reopenStaffContext(deterministicDetailUrl);
        deterministicNotFound = await page
          .getByTestId(MARKERS.notFound)
          .isVisible({ timeout: TIMEOUTS.quickMarker })
          .catch(() => false);
        deterministicSurface = await waitForStaffClaimDetailSurface(page);
        deterministicReady =
          deterministicSurface.detailReady ||
          deterministicSurface.actionPanelReady ||
          deterministicSurface.claimSectionReady;
        evidence.push(`deterministic_url_retry=${page.url()}`);
      }

      if (!deterministicNotFound && deterministicReady) {
        detailUrl = deterministicDetailUrl;
        evidence.push('claim_source=deterministic_staff_claim');
      } else {
        const landedOnClaimsList =
          trimTrailingSlashes(new URL(page.url()).pathname) ===
          trimTrailingSlashes(new URL(claimsList).pathname);
        evidence.push(
          `deterministic_claim_ready=${deterministicReady} deterministic_claim_not_found=${deterministicNotFound} deterministic_visible_selector=${deterministicSurface.visibleSelector || 'none'}`
        );

        if (!deterministicNotFound && landedOnClaimsList) {
          const fallback = await collectStaffClaimDetailUrls(page, runCtx);
          const preferredFallbackUrl =
            fallback.urls.find(url => url.endsWith(DEFAULT_P13_STAFF_CLAIM_ROUTE)) ||
            fallback.urls[0] ||
            null;
          evidence.push(
            `fallback_search_elapsed_ms=${fallback.elapsedMs}`,
            `fallback_link_count=${fallback.urls.length}`
          );
          if (preferredFallbackUrl) {
            detailUrl = preferredFallbackUrl;
            evidence.push('claim_source=staff_claims_list_fallback');
          }
        }

        if (detailUrl) {
          // Continue with the resolved fallback detail URL rather than failing on
          // a list redirect from the deterministic canonical path.
        } else if (!allowListFallback) {
          signatures.push(
            deterministicNotFound
              ? 'P1.3_DETERMINISTIC_STAFF_CLAIM_NOT_FOUND'
              : 'P1.3_DETERMINISTIC_STAFF_CLAIM_NOT_READY'
          );
          return checkResult('P1.3', 'FAIL', evidence, signatures);
        } else {
          const fallback = await collectStaffClaimDetailUrls(page, runCtx);
          evidence.push(
            `fallback_search_elapsed_ms=${fallback.elapsedMs}`,
            `fallback_link_count=${fallback.urls.length}`
          );
          if (fallback.urls.length === 0) {
            signatures.push('P1.3_NO_TEST_DATA_STAFF_CLAIMS');
            return checkResult('P1.3', 'SKIPPED', evidence, signatures);
          }
          detailUrl = fallback.urls[0];
          evidence.push('claim_source=staff_claims_list');
        }
      }
    }

    await reopenStaffContext(detailUrl);

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

    let detailSurface = await waitForStaffClaimDetailSurface(page);
    if (
      !detailSurface.detailReady &&
      !detailSurface.actionPanelReady &&
      !detailSurface.claimSectionReady &&
      isLoginUrl(page.url())
    ) {
      await reopenStaffContext(detailUrl);
      detailSurface = await waitForStaffClaimDetailSurface(page);
      evidence.push(`claim_url_retry=${page.url()}`);
    }
    const detailReady = detailSurface.detailReady;
    const actionPanelReady = detailSurface.actionPanelReady;
    const claimSectionReady = detailSurface.claimSectionReady;
    evidence.push(
      `staff_page_ready_on_detail=${detailReady}`,
      `detail_visible_selector=${detailSurface.visibleSelector || 'none'}`
    );

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
      const optionLabels = [];
      for (let i = 0; i < optionCount; i += 1) {
        optionLabels.push((await options.nth(i).innerText()).trim());
      }
      const selectedLabel = selectAlternativeActionableStatus(currentStatusLabel, optionLabels);
      if (selectedLabel) {
        for (let i = 0; i < optionCount; i += 1) {
          const candidate = optionLabels[i];
          if (candidate === selectedLabel) {
            await options.nth(i).click();
            break;
          }
        }
        evidence.push(`status_change=${currentStatusLabel} -> ${selectedLabel}`);
        const noteValue = `gate-note-${Date.now()}`;
        await page.fill(SELECTORS.claimStatusNote, noteValue);
        const updateButton = page.getByRole('button', { name: SELECTORS.claimUpdateButtonName });
        await updateButton.click();
        await page
          .waitForFunction(
            selector => {
              const button = document.querySelector(selector);
              return button instanceof HTMLButtonElement && button.disabled;
            },
            '[data-testid="staff-update-claim-button"]',
            { timeout: TIMEOUTS.action }
          )
          .catch(() => {});
        await page
          .waitForFunction(
            selector => {
              const button = document.querySelector(selector);
              return button instanceof HTMLButtonElement && !button.disabled;
            },
            '[data-testid="staff-update-claim-button"]',
            { timeout: TIMEOUTS.nav }
          )
          .catch(() => {});
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
      } else {
        signatures.push(
          `P1.3_NO_ACTIONABLE_STATUS_TRANSITION current_status=${currentStatusLabel} options=${optionLabels.join('|')}`
        );
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
      `release-gate-p13-failure-${Date.now()}-${crypto.randomUUID()}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    evidence.push(
      `failure_url=${page.url()}`,
      `failure_markers member=${markerState.member} agent=${markerState.agent} staff=${markerState.staff} admin=${markerState.admin}`,
      `failure_screenshot=${screenshotPath}`
    );
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
    if (reloginContext && reloginContext !== context) {
      await closeBrowserContextWithTimeout(reloginContext);
    }
    await closeBrowserContextWithTimeout(context);
  }

  return checkResult('P1.3', signatures.length ? 'FAIL' : 'PASS', evidence, signatures);
}

module.exports = {
  classifyInfraNetworkFailure,
  compactErrorMessage,
  resolveConfiguredStaffClaimDetailUrl,
  runP11AndP12,
  runP13,
  selectAlternativeActionableStatus,
};
