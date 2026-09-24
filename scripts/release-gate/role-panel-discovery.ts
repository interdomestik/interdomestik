const { SELECTORS, TIMEOUTS } = require('./config.ts');
const { gotoWithSessionRetry } = require('./session-navigation.ts');
const { sleep } = require('./shared.ts');
const { buildRolePanelDiscoveryUrls } = require('./role-panel-targets.ts');

async function waitForRolePanelVisible(page, timeoutMs = TIMEOUTS.nav) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const triggerVisible = await page
      .locator(SELECTORS.roleSelectTrigger)
      .isVisible({ timeout: TIMEOUTS.quickMarker })
      .catch(() => false);
    if (triggerVisible) return true;

    const tableVisible = await page
      .locator(SELECTORS.userRolesTable)
      .isVisible({ timeout: TIMEOUTS.quickMarker })
      .catch(() => false);
    if (tableVisible) {
      const grantVisible = await page
        .getByRole('button', { name: SELECTORS.grantRoleButtonName })
        .isVisible({ timeout: TIMEOUTS.quickMarker })
        .catch(() => false);
      if (grantVisible) return true;
    }

    await sleep(300);
  }

  return false;
}

async function tryRolePanelTarget(options, candidateUrl) {
  const { failureCapture, loginWithRunContext, page, recordEvidence, runCtx } = options;
  let response = null;
  try {
    await gotoWithSessionRetry({
      page,
      navigate: async () => {
        response = null;
        response = await page.goto(candidateUrl, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.nav,
        });
        return response;
      },
      retryLogin: () => loginWithRunContext(page, runCtx, 'admin_ks'),
    });
    const visible = await waitForRolePanelVisible(page);
    recordEvidence(`rp ${page.url()} ${visible}`);
    await failureCapture.captureAttempt({ response });
    return visible ? page.url() : null;
  } catch (error) {
    await failureCapture.captureAttempt({ response, error });
    throw error;
  }
}

async function findVisibleRolePanel(options) {
  const { rolePanelTarget, runCtx } = options;
  for (const candidateUrl of buildRolePanelDiscoveryUrls(runCtx, rolePanelTarget)) {
    const resolved = await tryRolePanelTarget(options, candidateUrl).catch(() => null);
    if (resolved) return resolved;
  }
  return null;
}

module.exports = { findVisibleRolePanel };
