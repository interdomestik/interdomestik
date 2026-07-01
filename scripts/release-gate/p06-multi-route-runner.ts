const { resolveP01CanonicalProof } = require('./p01-canonical-proof.ts');
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

async function collectAttempt(input, forceFresh, liveItems) {
  const { accountKey, assertP06Markers } = input;
  return withAccount(input, forceFresh, async page => {
    const resultsByIndex = [];
    for (const { check, index, url } of liveItems) {
      resultsByIndex[index] = await assertP06Markers(
        page,
        accountKey,
        input.id,
        url,
        check.expected
      );
    }
    return resultsByIndex;
  });
}

async function collectP06MultiRouteScenario(input) {
  const urls = input.checks.map(check =>
    buildRoute(input.runCtx.baseUrl, input.runCtx.locale, check.route)
  );
  const attemptInput = { ...input, urls };
  const liveItems = [];
  let results = input.checks.map((check, index) => {
    const proof = resolveP01CanonicalProof(
      input.runCtx,
      input.accountKey,
      check.route,
      check.expected
    );
    if (!proof) {
      liveItems.push({ check, index, url: urls[index] });
      return null;
    }
    return { ...proof, url: urls[index] };
  });
  let retriedFreshContext = false;

  if (liveItems.length > 0) {
    const firstAttempt = await collectAttempt(attemptInput, false, liveItems);
    results = results.map((result, index) => result || firstAttempt[index]);

    if (shouldRetryWithFreshContext(liveItems.map(({ index }) => results[index]))) {
      const freshAttempt = await collectAttempt(attemptInput, true, liveItems);
      results = results.map((result, index) => freshAttempt[index] || result);
      retriedFreshContext = true;
    }
  }

  const observedRows = [];
  const mismatches = [];
  for (const [index, result] of results.entries()) {
    const source = result.source === 'p01-proof' ? 'p01-proof ' : '';
    observedRows.push(`${source}${urls[index]} => ${markersToString(result.observed)}`);
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
