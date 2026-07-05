const { shouldRetryP01FreshContext } = require('./p01-rbac-failures.ts');

async function collectFreshUntilStable(input) {
  const {
    account,
    browser,
    collectAttempt,
    intervalMs,
    loginWithRunContext,
    runCtx,
    sleepFn,
    startingAttempt,
  } = input;
  let windowMs = Number.isFinite(input.windowMs) && input.windowMs > 0 ? input.windowMs : 0;
  const stableIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 0;
  let attempt = startingAttempt;
  let probes = 0;

  while (shouldRetryP01FreshContext(attempt) && windowMs > 0 && stableIntervalMs > 0) {
    const waitMs = Math.min(stableIntervalMs, windowMs);
    await sleepFn(waitMs);
    windowMs -= waitMs;
    probes += 1;
    attempt = await collectAttempt({
      account,
      browser,
      forceFresh: true,
      loginWithRunContext,
      memberDriftSignatureAdded: attempt.driftRecorded,
      runCtx,
    });
  }

  return { attempt, probes };
}

module.exports = { collectFreshUntilStable };
