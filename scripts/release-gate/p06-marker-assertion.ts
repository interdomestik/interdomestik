const { TIMEOUTS } = require('./config.ts');
const { gotoWithSessionRetry } = require('./session-navigation.ts');
const { collectUrlMarkerAssertion } = require('./shared.ts');

async function assertP06UrlMarkers(page, accountKey, label, url, expected, deps) {
  const { loginWithRunContext, runCtx } = deps;
  await gotoWithSessionRetry({
    page,
    navigate: () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.nav }),
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
};
