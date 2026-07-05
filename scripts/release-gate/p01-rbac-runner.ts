const { ROUTES, TIMEOUTS } = require('./config.ts');
const { collectRbacFailures, shouldRetryP01FreshContext } = require('./p01-rbac-failures.ts');
const { collectFreshUntilStable } = require('./p01-rbac-stabilization.ts');
const { recordP01CanonicalProof } = require('./p01-canonical-proof.ts');
const { gotoWithSessionRetry } = require('./session-navigation.ts');
const {
  buildRoute,
  checkResult,
  expectedMatrixForAccount,
  markerSummary,
  sleep,
} = require('./shared.ts');
const { waitForPortalMarkerState } = require('./admin-checks-locators.ts');

const P01_STABILIZATION_RETRY_WINDOW_MS = Number.parseInt(
  process.env.RELEASE_GATE_P01_STABILIZATION_RETRY_WINDOW_MS || '5000',
  10
);
const P01_STABILIZATION_RETRY_INTERVAL_MS = Number.parseInt(
  process.env.RELEASE_GATE_P01_STABILIZATION_RETRY_INTERVAL_MS || '1000',
  10
);

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
      if (portal === matrix.canonical) {
        recordP01CanonicalProof(runCtx, account, route, matrix.canonical, current);
      }

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
  const sleepFn = deps.sleep || sleep;
  const stabilizationRetryWindowMs = Number.isFinite(deps.stabilizationRetryWindowMs)
    ? deps.stabilizationRetryWindowMs
    : P01_STABILIZATION_RETRY_WINDOW_MS;
  const stabilizationRetryIntervalMs = Number.isFinite(deps.stabilizationRetryIntervalMs)
    ? deps.stabilizationRetryIntervalMs
    : P01_STABILIZATION_RETRY_INTERVAL_MS;
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
      let finalAttempt = shouldRetryFresh
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
      if (shouldRetryP01FreshContext(finalAttempt)) {
        const stabilized = await collectFreshUntilStable({
          account,
          browser,
          collectAttempt: collectP01AccountAttempt,
          intervalMs: stabilizationRetryIntervalMs,
          loginWithRunContext,
          runCtx,
          sleepFn,
          startingAttempt: finalAttempt,
          windowMs: stabilizationRetryWindowMs,
        });
        evidence.push(
          `retry=stabilized-fresh-context account=${account} probes=${stabilized.probes}`
        );
        finalAttempt = stabilized.attempt;
      }
      evidence.push(...finalAttempt.evidence);
      memberDriftSignatureAdded = finalAttempt.driftRecorded;
      failures.push(...finalAttempt.failures);
    } catch (error) {
      failures.push(`P0.1_EXCEPTION account=${account} message=${String(error.message || error)}`);
    }
  }

  return checkResult('P0.1', failures.length ? 'FAIL' : 'PASS', evidence, failures);
}
module.exports = { collectP01AccountAttempt, runP01, shouldRetryP01FreshContext };
