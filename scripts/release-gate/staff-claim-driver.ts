const { MARKERS, ROUTES, SELECTORS, TIMEOUTS } = require('./config.ts');
const { buildRoute, buildRouteAllowingLocalePath } = require('./shared.ts');
const { collectVisibleTestIds } = require('./scenario-visits.ts');
const { gotoWithSessionRetry, loginWithRunContext } = require('./session-navigation.ts');

async function collectStaffClaimDetailUrls(page, runCtx) {
  const claimsList = buildRoute(runCtx.baseUrl, runCtx.locale, ROUTES.staffClaimsList);
  await gotoWithSessionRetry({
    page,
    navigate: () => page.goto(claimsList, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
    retryLogin: () => loginWithRunContext(page, runCtx, 'staff', { forceFresh: true }),
  });

  const fallbackTimeoutMs = 10_000;
  const startedAt = Date.now();
  let hrefs = [];
  while (Date.now() - startedAt < fallbackTimeoutMs) {
    hrefs = await page.$$eval(SELECTORS.staffClaimOpenButton, anchors =>
      anchors.map(node => node.getAttribute('href')).filter(Boolean)
    );
    if (hrefs.length > 0) break;
    await page.waitForTimeout(500);
  }

  return {
    claimsList,
    elapsedMs: Date.now() - startedAt,
    urls: hrefs.map(href =>
      href.startsWith('http')
        ? href
        : buildRouteAllowingLocalePath(runCtx.baseUrl, runCtx.locale, href)
    ),
  };
}

async function inspectStaffDetailScenario(page, scenario, deps) {
  const {
    collectVisibleTestIds: collectVisibleTestIdsFn = collectVisibleTestIds,
    findMissingBoundaryPhrases,
    findMissingCommercialPromiseSections,
    normalizeBoundaryText,
    routePathsMatch,
  } = deps;

  const finalUrl = page.url();
  const notFound = await page
    .getByTestId(MARKERS.notFound)
    .isVisible({ timeout: TIMEOUTS.quickMarker })
    .catch(() => false);
  const detailReady = await page
    .getByTestId('staff-claim-detail-ready')
    .isVisible({ timeout: TIMEOUTS.marker })
    .catch(() => false);
  const observedByTestId = await collectVisibleTestIdsFn(page, scenario.requiredTestIds);
  const resolvedDetailReady =
    observedByTestId['staff-claim-detail-ready'] === true ? true : detailReady;
  const observedPrerequisites = normalizeBoundaryText(
    await page
      .getByTestId('staff-accepted-recovery-prerequisites')
      .innerText({ timeout: TIMEOUTS.marker })
      .catch(() => '')
  );
  const observedText = normalizeBoundaryText(
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  );
  const missingPrerequisitePhrases = findMissingBoundaryPhrases(
    scenario.requiredPrerequisitePhrases,
    observedPrerequisites
  );
  const missingPhrases = findMissingBoundaryPhrases(scenario.requiredPhrases, observedText);
  const missingTestIds = findMissingCommercialPromiseSections(
    scenario.requiredTestIds,
    observedByTestId
  );

  return {
    finalUrl,
    notFound,
    detailReady,
    missingPrerequisitePhrases,
    missingPhrases,
    missingTestIds,
    observedPrerequisites,
    observedSummary: scenario.requiredTestIds
      .map(testId => `${testId}=${observedByTestId[testId] === true}`)
      .join(','),
    matched:
      routePathsMatch(scenario.url, finalUrl) &&
      !notFound &&
      resolvedDetailReady &&
      missingTestIds.length === 0 &&
      missingPrerequisitePhrases.length === 0 &&
      missingPhrases.length === 0,
  };
}

async function resolveG10Scenario(page, runCtx, scenario, deps) {
  const attemptedUrls = [];
  const visit = async (targetUrl, source) => {
    attemptedUrls.push(`${source}:${targetUrl}`);
    await gotoWithSessionRetry({
      page,
      navigate: () =>
        page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.nav,
        }),
      retryLogin: () => loginWithRunContext(page, runCtx, scenario.account, { forceFresh: true }),
    });
    const inspected = await inspectStaffDetailScenario(page, scenario, deps);
    return {
      ...inspected,
      requestedUrl: targetUrl,
      source,
      attemptedUrls: [...attemptedUrls],
    };
  };
  const visitWithFreshReloginRetry = async (targetUrl, source) => {
    const initialVisit = await visit(targetUrl, source);
    if (!/\/login(?:[/?#]|$)/.test(initialVisit.finalUrl)) {
      return initialVisit;
    }

    await loginWithRunContext(page, runCtx, scenario.account, { forceFresh: true });
    return visit(targetUrl, `${source}_fresh_relogin`);
  };

  const initial = await visitWithFreshReloginRetry(scenario.url, 'configured');
  if (initial.matched) {
    return initial;
  }

  const fallback = await collectStaffClaimDetailUrls(page, runCtx);
  const dedupedFallbackUrls = fallback.urls.filter(
    url => !attemptedUrls.includes(`configured:${url}`)
  );
  for (const candidateUrl of dedupedFallbackUrls) {
    const candidate = await visitWithFreshReloginRetry(candidateUrl, 'fallback');
    if (candidate.matched) {
      return {
        ...candidate,
        fallbackSearchElapsedMs: fallback.elapsedMs,
        fallbackLinkCount: fallback.urls.length,
      };
    }
  }

  return {
    ...initial,
    fallbackSearchElapsedMs: fallback.elapsedMs,
    fallbackLinkCount: fallback.urls.length,
  };
}

module.exports = {
  collectStaffClaimDetailUrls,
  inspectStaffDetailScenario,
  resolveG10Scenario,
};
