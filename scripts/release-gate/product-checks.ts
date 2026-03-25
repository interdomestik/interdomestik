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
  normalizeRoutePath,
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

async function waitForStaffClaimsListSurface(page) {
  const visibleSelector = await waitForAnyVisible(
    page,
    [
      `[data-testid="${MARKERS.staff}"]`,
      '[data-testid="staff-claims-queue"]',
      '[data-testid="staff-claims-list"]',
      '[data-testid="page-title"]',
    ],
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
        `[data-testid="${MARKERS.staff}"]`,
        '[data-testid="staff-claims-queue"]',
        '[data-testid="staff-claims-list"]',
        '[data-testid="page-title"]',
      ],
      TIMEOUTS.marker
    ));

  return {
    markerReady: retryVisibleSelector === `[data-testid="${MARKERS.staff}"]`,
    queueReady: retryVisibleSelector === '[data-testid="staff-claims-queue"]',
    listReady: retryVisibleSelector === '[data-testid="staff-claims-list"]',
    titleReady: retryVisibleSelector === '[data-testid="page-title"]',
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

function stripQueryAndFragment(value) {
  return String(value || '')
    .trim()
    .split(/[?#]/, 1)[0]
    .trim();
}

function isSameOriginUrl(candidateUrl, baseUrl) {
  try {
    return new URL(candidateUrl).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function isStaffClaimsListPath(pathname, locale) {
  const normalizedPath = normalizeRoutePath(pathname);
  return (
    normalizedPath === '/staff/claims' ||
    normalizedPath === `/${String(locale || '').trim()}/staff/claims`
  );
}

function isStaffClaimsDetailPath(pathname, locale) {
  const normalizedPath = normalizeRoutePath(pathname);
  const segments = normalizedPath.split('/').filter(Boolean);
  return (
    segments.length === 4 &&
    segments[0] === String(locale || '').trim() &&
    segments[1] === 'staff' &&
    segments[2] === 'claims' &&
    segments[3].length > 0
  );
}

function buildCanonicalStaffClaimUrl(runCtx, candidatePath) {
  return buildRouteAllowingLocalePath(
    runCtx.baseUrl,
    runCtx.locale,
    stripQueryAndFragment(candidatePath)
  );
}

function resolveConfiguredStaffClaimDetailUrl(runCtx) {
  const configured = String(process.env.STAFF_CLAIM_URL || '').trim();
  if (!configured) {
    return {
      reason: 'missing',
      source: 'missing',
      url: null,
      pathnameFamily: null,
    };
  }

  try {
    if (/^https?:\/\//i.test(configured)) {
      const parsed = new URL(configured);
      if (!isSameOriginUrl(configured, runCtx.baseUrl)) {
        return {
          reason: 'cross-origin',
          source: 'invalid',
          url: null,
          pathnameFamily: normalizeRoutePath(parsed.pathname),
        };
      }
      const targetUrl = buildCanonicalStaffClaimUrl(runCtx, parsed.pathname);
      const pathnameFamily = normalizeRoutePath(targetUrl);
      if (isStaffClaimsListPath(pathnameFamily, runCtx.locale)) {
        return {
          reason: 'list-url',
          source: 'ignored-list',
          url: null,
          pathnameFamily,
        };
      }
      if (!isStaffClaimsDetailPath(pathnameFamily, runCtx.locale)) {
        return {
          reason: 'invalid-detail-shape',
          source: 'invalid',
          url: null,
          pathnameFamily,
        };
      }
      return {
        reason: null,
        source: 'env',
        url: targetUrl,
        pathnameFamily,
      };
    }

    const targetUrl = buildCanonicalStaffClaimUrl(runCtx, configured);
    const pathnameFamily = normalizeRoutePath(targetUrl);
    if (isStaffClaimsListPath(pathnameFamily, runCtx.locale)) {
      return {
        reason: 'list-url',
        source: 'ignored-list',
        url: null,
        pathnameFamily,
      };
    }
    if (!isStaffClaimsDetailPath(pathnameFamily, runCtx.locale)) {
      return {
        reason: 'invalid-detail-shape',
        source: 'invalid',
        url: null,
        pathnameFamily,
      };
    }
    return {
      reason: null,
      source: 'env',
      url: targetUrl,
      pathnameFamily,
    };
  } catch {
    return {
      reason: 'invalid-url',
      source: 'invalid',
      url: null,
      pathnameFamily: null,
    };
  }
}

function selectPreferredStaffClaimDetailUrl(urls, runCtx) {
  const deterministicUrl = buildRoute(runCtx.baseUrl, runCtx.locale, DEFAULT_P13_STAFF_CLAIM_ROUTE);
  const deterministicPath = normalizeRoutePath(deterministicUrl);
  for (const candidateUrl of urls) {
    if (normalizeRoutePath(candidateUrl) === deterministicPath) {
      return candidateUrl;
    }
  }
  return urls[0] || null;
}

async function resolveP13StaffClaimDetailTarget(page, runCtx, deps = {}) {
  const collectStaffClaimDetailUrlsFn =
    deps.collectStaffClaimDetailUrls || collectStaffClaimDetailUrls;
  const configured = resolveConfiguredStaffClaimDetailUrl(runCtx);
  const evidence = [
    `configured_staff_claim_source=${configured.source}`,
    `configured_staff_claim_reason=${configured.reason || 'none'}`,
  ];

  if (configured.pathnameFamily) {
    evidence.push(`configured_staff_claim_pathname_family=${configured.pathnameFamily}`);
  }

  if (configured.url) {
    evidence.push('claim_source=STAFF_CLAIM_URL_OVERRIDE');
    return {
      detailUrl: configured.url,
      source: 'configured',
      evidence,
      configured,
    };
  }

  if (configured.reason && configured.reason !== 'missing') {
    evidence.push(`configured_staff_claim_rejected reason=${configured.reason}`);
  }

  const fallback = await collectStaffClaimDetailUrlsFn(page, runCtx);
  evidence.push(
    `fallback_search_elapsed_ms=${fallback.elapsedMs}`,
    `fallback_link_count=${fallback.urls.length}`
  );

  if (fallback.urls.length > 0) {
    const fallbackUrl = selectPreferredStaffClaimDetailUrl(fallback.urls, runCtx);
    evidence.push(`fallback_detail_url=${fallbackUrl}`, 'claim_source=staff_claims_list_fallback');
    return {
      detailUrl: fallbackUrl,
      source: 'list-discovery',
      evidence,
      configured,
      fallbackSearchElapsedMs: fallback.elapsedMs,
      fallbackLinkCount: fallback.urls.length,
    };
  }

  const deterministicUrl = buildRoute(runCtx.baseUrl, runCtx.locale, DEFAULT_P13_STAFF_CLAIM_ROUTE);
  evidence.push(
    `deterministic_detail_url=${deterministicUrl}`,
    'claim_source=deterministic_staff_claim'
  );
  return {
    detailUrl: deterministicUrl,
    source: 'deterministic',
    evidence,
    configured,
    fallbackSearchElapsedMs: fallback.elapsedMs,
    fallbackLinkCount: fallback.urls.length,
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
  } finally {
    if (reloginContext && reloginContext !== context) {
      await closeBrowserContextWithTimeout(reloginContext);
    }
    await closeBrowserContextWithTimeout(context);
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
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedCookieConsentState({ context, page, baseUrl: runCtx.baseUrl });

  try {
    await loginWithRunContext(page, runCtx, 'staff');
    evidence.push(`staff_login_url=${page.url()}`);

    const claimsList = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.staffClaimsList);
    await gotoWithSessionRetry({
      page,
      navigate: () =>
        page.goto(claimsList, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
      retryLogin: () => loginWithRunContext(page, runCtx, 'staff', { forceFresh: true }),
    });
    const staffListSurface = await waitForStaffClaimsListSurface(page);
    const staffReadyOnList =
      staffListSurface.markerReady ||
      staffListSurface.queueReady ||
      staffListSurface.listReady ||
      staffListSurface.titleReady;
    evidence.push(
      `staff_claims_list_url=${claimsList}`,
      `staff_claims_list_final_url=${page.url()}`,
      `staff_page_ready_on_list=${staffReadyOnList}`,
      `staff_list_visible_selector=${staffListSurface.visibleSelector || 'none'}`
    );
    if (!staffReadyOnList) {
      signatures.push('P1.3_STAFF_PORTAL_NOT_READY');
      return checkResult('P1.3', 'FAIL', evidence, signatures);
    }

    const detailTarget = await resolveP13StaffClaimDetailTarget(page, runCtx, deps);
    evidence.push(
      ...detailTarget.evidence,
      `detail_target_source=${detailTarget.source}`,
      `detail_target_url=${detailTarget.detailUrl}`
    );

    await gotoWithSessionRetry({
      page,
      navigate: () =>
        page.goto(detailTarget.detailUrl, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.nav,
        }),
      retryLogin: () => loginWithRunContext(page, runCtx, 'staff', { forceFresh: true }),
      stopOnLoginBounce: true,
    });

    evidence.push(`detail_url_after_open=${page.url()}`);
    const detailBounceAfterOpen = isLoginUrl(page.url());
    evidence.push(`detail_bounced_to_login_after_open=${detailBounceAfterOpen}`);
    if (detailBounceAfterOpen) {
      signatures.push('P1.3_DETAIL_BOUNCED_TO_LOGIN_AFTER_OPEN');
      return checkResult('P1.3', 'FAIL', evidence, signatures);
    }

    const notFoundOnDetail = await page
      .getByTestId(MARKERS.notFound)
      .isVisible({ timeout: TIMEOUTS.quickMarker })
      .catch(() => false);
    evidence.push(`detail_not_found=${notFoundOnDetail}`);
    if (notFoundOnDetail) {
      signatures.push('P1.3_STAFF_CLAIM_DETAIL_NOT_FOUND');
      return checkResult('P1.3', 'FAIL', evidence, signatures);
    }

    let detailSurface = await waitForStaffClaimDetailSurface(page);
    const detailReady =
      detailSurface.detailReady ||
      detailSurface.actionPanelReady ||
      detailSurface.claimSectionReady;
    evidence.push(
      `staff_page_ready_on_detail=${detailReady}`,
      `detail_visible_selector=${detailSurface.visibleSelector || 'none'}`
    );
    if (!detailReady) {
      signatures.push('P1.3_DETAIL_READY_MARKER_MISSING');
      return checkResult('P1.3', 'FAIL', evidence, signatures);
    }

    const refreshedUrl = await gotoWithSessionRetry({
      page,
      navigate: () =>
        page.reload({
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.nav,
        }),
      retryLogin: () => loginWithRunContext(page, runCtx, 'staff', { forceFresh: true }),
      stopOnLoginBounce: true,
    });

    evidence.push(`detail_url_after_refresh=${refreshedUrl}`);
    const detailBounceAfterRefresh = isLoginUrl(page.url());
    evidence.push(`detail_bounced_to_login_after_refresh=${detailBounceAfterRefresh}`);
    if (detailBounceAfterRefresh) {
      signatures.push('P1.3_DETAIL_BOUNCED_TO_LOGIN_AFTER_REFRESH');
      return checkResult('P1.3', 'FAIL', evidence, signatures);
    }

    detailSurface = await waitForStaffClaimDetailSurface(page);
    const detailReadyAfterRefresh =
      detailSurface.detailReady ||
      detailSurface.actionPanelReady ||
      detailSurface.claimSectionReady;
    evidence.push(
      `staff_page_ready_after_refresh=${detailReadyAfterRefresh}`,
      `refresh_visible_selector=${detailSurface.visibleSelector || 'none'}`
    );
    if (!detailReadyAfterRefresh) {
      signatures.push('P1.3_DETAIL_NOT_READY_AFTER_REFRESH');
      return checkResult('P1.3', 'FAIL', evidence, signatures);
    }

    if (normalizeRoutePath(page.url()) !== normalizeRoutePath(detailTarget.detailUrl)) {
      signatures.push(
        `P1.3_DETAIL_URL_CHANGED_AFTER_REFRESH expected=${normalizeRoutePath(detailTarget.detailUrl)} actual=${normalizeRoutePath(page.url())}`
      );
      return checkResult('P1.3', 'FAIL', evidence, signatures);
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
    await closeBrowserContextWithTimeout(context);
  }

  return checkResult('P1.3', signatures.length ? 'FAIL' : 'PASS', evidence, signatures);
}

module.exports = {
  classifyInfraNetworkFailure,
  compactErrorMessage,
  resolveConfiguredStaffClaimDetailUrl,
  resolveP13StaffClaimDetailTarget,
  runP11AndP12,
  runP13,
  selectAlternativeActionableStatus,
  waitForStaffClaimsListSurface,
};
