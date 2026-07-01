const { ROUTES, TIMEOUTS } = require('./config.ts');
const { gotoWithSessionRetry } = require('./session-navigation.ts');
const { buildRoute, checkResult, expectedMatrixForAccount, markerSummary } = require('./shared.ts');
const { waitForPortalMarkerState } = require('./admin-checks-locators.ts');

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

function isPositiveCanonicalNotFoundFailure(failure) {
  return (
    String(failure).startsWith('P0.1_RBAC_CANONICAL_MARKER_MISSING ') &&
    String(failure).includes('"notFound":true')
  );
}

function shouldRetryP01FreshContext(firstAttempt) {
  return (
    firstAttempt.positiveCanonicalNotFound &&
    firstAttempt.failures.length > 0 &&
    firstAttempt.failures.every(isPositiveCanonicalNotFoundFailure)
  );
}

async function collectP01AccountAttempt(input) {
  const { account, browser, forceFresh, loginWithRunContext, memberDriftSignatureAdded, runCtx } =
    input;
  const context = await browser.newContext();
  const evidence = [];
  const failures = [];
  let driftRecorded = memberDriftSignatureAdded;
  let positiveCanonicalNotFound = false;

  try {
    const page = await context.newPage();
    await loginWithRunContext(page, runCtx, account, forceFresh ? { forceFresh: true } : undefined);

    const matrix = expectedMatrixForAccount(account);
    for (const portal of new Set([matrix.canonical, ...ROUTES.rbacTargets])) {
      const route = `/${portal}`;
      await gotoWithSessionRetry({
        page,
        navigate: () =>
          page.goto(buildRoute(runCtx.baseUrl, runCtx.locale, route), {
            waitUntil: 'domcontentloaded',
            timeout: TIMEOUTS.nav,
          }),
        retryLogin: () =>
          loginWithRunContext(page, runCtx, account, forceFresh ? { forceFresh: true } : undefined),
      });
      const current = await waitForPortalMarkerState(
        page,
        portal === matrix.canonical ? portal : null
      );
      evidence.push(`${account} ${markerSummary(route, current)}`);
      positiveCanonicalNotFound ||= portal === matrix.canonical && current.notFound === true;

      const rbacResult = collectRbacFailures({
        account,
        portal,
        route,
        matrix,
        current,
        runCtx,
        memberDriftSignatureAdded: driftRecorded,
      });
      driftRecorded = rbacResult.driftRecorded;
      failures.push(...rbacResult.failures);
    }
  } finally {
    await context.close();
  }

  return { evidence, failures, driftRecorded, positiveCanonicalNotFound };
}

async function runP01(browser, runCtx, deps) {
  const { loginWithRunContext } = deps;
  const evidence = [];
  const failures = [];
  let memberDriftSignatureAdded = false;

  for (const account of ['member', 'agent', 'staff', 'admin_ks']) {
    try {
      const first = await collectP01AccountAttempt({
        account,
        browser,
        forceFresh: false,
        loginWithRunContext,
        memberDriftSignatureAdded,
        runCtx,
      });
      const shouldRetryFresh = shouldRetryP01FreshContext(first);
      const finalAttempt = shouldRetryFresh
        ? await collectP01AccountAttempt({
            account,
            browser,
            forceFresh: true,
            loginWithRunContext,
            memberDriftSignatureAdded: first.driftRecorded,
            runCtx,
          })
        : first;

      if (shouldRetryFresh) evidence.push(`retry=fresh-context account=${account}`);
      evidence.push(...finalAttempt.evidence);
      memberDriftSignatureAdded = finalAttempt.driftRecorded;
      failures.push(...finalAttempt.failures);
    } catch (error) {
      failures.push(`P0.1_EXCEPTION account=${account} message=${String(error.message || error)}`);
    }
  }

  return checkResult('P0.1', failures.length ? 'FAIL' : 'PASS', evidence, failures);
}
module.exports = {
  collectP01AccountAttempt,
  runP01,
  shouldRetryP01FreshContext,
};
