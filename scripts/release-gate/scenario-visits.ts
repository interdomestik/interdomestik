const { TIMEOUTS } = require('./config.ts');
const { sleep } = require('./shared.ts');
const { loginWithRunContext } = require('./session-navigation.ts');

const COOKIE_CONSENT_COOKIE_NAME = 'cookie_consent';
const COOKIE_CONSENT_STORAGE_KEY = 'interdomestik_cookie_consent_v1';

async function seedCookieConsentState(args) {
  const { context, page, baseUrl } = args;
  const origin = new URL(baseUrl).origin;

  await context
    .addCookies([
      {
        name: COOKIE_CONSENT_COOKIE_NAME,
        value: 'accepted',
        url: origin,
        path: '/',
        sameSite: 'Lax',
      },
    ])
    .catch(() => {});

  await page.addInitScript(
    ({ storageKey, cookieName }) => {
      try {
        globalThis.localStorage.setItem(storageKey, 'accepted');
      } catch {}
      try {
        document.cookie = `${cookieName}=accepted; Path=/; SameSite=Lax`;
      } catch {}
    },
    {
      storageKey: COOKIE_CONSENT_STORAGE_KEY,
      cookieName: COOKIE_CONSENT_COOKIE_NAME,
    }
  );
}

async function visitReleaseGateScenario(browser, runCtx, scenario, callback) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await seedCookieConsentState({ context, page, baseUrl: runCtx.baseUrl });

    if (scenario.account) {
      await loginWithRunContext(page, runCtx, scenario.account);
    }

    await page.goto(scenario.url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.nav,
    });

    return await callback(page);
  } finally {
    await context.close();
  }
}

async function collectVisibleTestIds(page, requiredTestIds, options = {}) {
  const observedByTestId = {};
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Number(options.timeoutMs)
    : TIMEOUTS.marker;
  const intervalMs = Number.isFinite(options.intervalMs) ? Number(options.intervalMs) : 250;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    let allVisible = true;
    for (const testId of requiredTestIds) {
      observedByTestId[testId] = await page
        .getByTestId(testId)
        .isVisible({ timeout: TIMEOUTS.quickMarker })
        .catch(() => false);
      if (observedByTestId[testId] !== true) {
        allVisible = false;
      }
    }

    if (allVisible || Date.now() - startedAt >= timeoutMs) {
      break;
    }

    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(intervalMs);
    } else {
      await sleep(intervalMs);
    }
  }

  return observedByTestId;
}

module.exports = {
  collectVisibleTestIds,
  seedCookieConsentState,
  visitReleaseGateScenario,
};
