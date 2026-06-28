const { TIMEOUTS } = require('./config.ts');
const { gotoWithSessionRetry } = require('./session-navigation.ts');
const { collectUrlMarkerAssertion } = require('./shared.ts');

function shouldForceFreshAfterNotFound(result) {
  const expectsReadyMarker = Object.values(result.expected || {}).some(value => value === true);
  return result.status === 'FAIL' && expectsReadyMarker && result.observed?.notFound === true;
}

async function assertP06UrlMarkers(page, accountKey, label, url, expected, deps) {
  const { loginWithRunContext, runCtx } = deps;
  const navigate = () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav });
  await gotoWithSessionRetry({
    page,
    navigate,
    retryLogin: () => loginWithRunContext(page, runCtx, accountKey, { forceFresh: true }),
  });

  const result = await collectUrlMarkerAssertion(page, label, url, expected);
  if (!shouldForceFreshAfterNotFound(result)) return result;

  await loginWithRunContext(page, runCtx, accountKey, { forceFresh: true });
  await gotoWithSessionRetry({
    page,
    navigate,
    retryLogin: () => loginWithRunContext(page, runCtx, accountKey, { forceFresh: true }),
  });
  return collectUrlMarkerAssertion(page, label, url, expected);
}

function createP06MarkerAsserter(deps) {
  return (page, accountKey, label, url, expected) =>
    assertP06UrlMarkers(page, accountKey, label, url, expected, deps);
}

module.exports = {
  assertP06UrlMarkers,
  createP06MarkerAsserter,
  shouldForceFreshAfterNotFound,
};
