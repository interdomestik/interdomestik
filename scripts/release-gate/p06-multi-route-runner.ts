const { buildRoute, markersToString } = require('./shared.ts');

function shouldRetryWithFreshContext(results) {
  return results.some(
    ({ expected, observed, mismatches }) =>
      mismatches.length > 0 &&
      observed.notFound === true &&
      Object.values(expected || {}).some(value => value === true)
  );
}

async function withAccount(input, forceFresh, fn) {
  const { browser, runCtx, loginWithRunContext, accountKey } = input;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await loginWithRunContext(page, runCtx, accountKey, { forceFresh });
    return await fn(page);
  } finally {
    await context.close();
  }
}

async function collectAttempt(input, forceFresh) {
  const { checks, urls, accountKey, assertP06Markers } = input;
  return withAccount(input, forceFresh, async page => {
    const results = [];
    for (const [index, check] of checks.entries()) {
      results.push(await assertP06Markers(page, accountKey, input.id, urls[index], check.expected));
    }
    return results;
  });
}

async function collectP06MultiRouteScenario(input) {
  const urls = input.checks.map(check =>
    buildRoute(input.runCtx.baseUrl, input.runCtx.locale, check.route)
  );
  const attemptInput = { ...input, urls };
  let results = await collectAttempt(attemptInput, false);
  let retriedFreshContext = false;

  if (shouldRetryWithFreshContext(results)) {
    results = await collectAttempt(attemptInput, true);
    retriedFreshContext = true;
  }

  const observedRows = [];
  const mismatches = [];
  for (const [index, result] of results.entries()) {
    observedRows.push(`${urls[index]} => ${markersToString(result.observed)}`);
    mismatches.push(...result.mismatches);
  }

  const observedSummary = [
    retriedFreshContext ? 'retry=fresh-context' : '',
    observedRows.join(' || '),
  ]
    .filter(Boolean)
    .join(' || ');

  return { urls, observedSummary, mismatches };
}

module.exports = {
  collectP06MultiRouteScenario,
  shouldRetryWithFreshContext,
};
