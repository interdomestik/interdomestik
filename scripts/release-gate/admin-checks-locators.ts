const { MARKERS, SELECTORS, TIMEOUTS } = require('./config.ts');
const { markerSnapshot, resolvePlaywright } = require('./shared.ts');

function markerSelector(markerKey) {
  return `[data-testid="${MARKERS[markerKey]}"]`;
}

async function waitForPortalMarkerState(page, preferredMarker) {
  if (preferredMarker) {
    await page
      .getByTestId(MARKERS[preferredMarker])
      .waitFor({ state: 'visible', timeout: TIMEOUTS.marker })
      .catch(() => {});
    return markerSnapshot(page);
  }

  const anyPortalSelector = ['member', 'agent', 'staff', 'admin', 'notFound']
    .map(markerSelector)
    .join(',');
  await page
    .locator(anyPortalSelector)
    .first()
    .waitFor({ state: 'visible', timeout: TIMEOUTS.marker })
    .catch(() => {});
  return markerSnapshot(page);
}

async function removeRoleFromTable(page, roleName) {
  const targetRow = roleRowLocator(page, roleName);
  try {
    await targetRow.waitFor({ state: 'visible', timeout: TIMEOUTS.marker });
    await resolveRoleRowActionButton(targetRow).click({ timeout: TIMEOUTS.action });
    return true;
  } catch {
    return false;
  }
}

function resolveRoleRowActionButton(row) {
  const byRoleButton = row.getByRole?.('button', { name: SELECTORS.removeRoleButtonName });
  if (byRoleButton?.first) {
    return byRoleButton.first();
  }
  const genericButton = row.locator('button');
  return genericButton?.first ? genericButton.first() : genericButton;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roleTextPattern(roleName) {
  return new RegExp(String.raw`\b${escapeRegExp(roleName)}\b`, 'i');
}

function roleRowLocator(page, roleName) {
  return page
    .locator(SELECTORS.userRolesTable)
    .locator('tr')
    .filter({ hasText: roleTextPattern(roleName) })
    .first();
}

async function addRole(page, roleName) {
  const { expect } = resolvePlaywright();
  const trigger = page.locator(SELECTORS.roleSelectTrigger);
  await trigger.waitFor({ state: 'visible', timeout: TIMEOUTS.action });
  await trigger.click();

  const roleOption = page.locator(`[data-testid="role-option-${roleName}"]`);
  const opened = await Promise.race([
    page
      .locator(SELECTORS.roleSelectContent)
      .waitFor({ state: 'visible', timeout: TIMEOUTS.action })
      .then(() => true)
      .catch(() => false),
    roleOption
      .waitFor({ state: 'visible', timeout: TIMEOUTS.action })
      .then(() => true)
      .catch(() => false),
  ]);

  if (!opened) {
    await trigger.click().catch(() => {});
    await roleOption.waitFor({ state: 'visible', timeout: TIMEOUTS.action });
  }

  await roleOption.click();
  await expect(trigger).toContainText(roleTextPattern(roleName), { timeout: TIMEOUTS.action });
  await page.getByRole('button', { name: SELECTORS.grantRoleButtonName }).click();
}

function compactResponseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.pathname}${url.search ? '?…' : ''}`;
  } catch {
    return String(rawUrl || '').slice(0, 120);
  }
}

function compactResponseBody(raw, maxLength = 180) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function createMutationResponseCapture(page, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const entries = [];
  const pending = [];
  const onResponse = response => {
    const task = (async () => {
      const request = response.request();
      const method = request.method();
      if (method === 'GET' || !response.url().startsWith(origin)) return;
      const status = response.status();
      const contentType = String(response.headers?.()['content-type'] || '').split(';')[0];
      const body = status >= 400 ? compactResponseBody(await response.text().catch(() => '')) : '';
      entries.push(
        `${method} ${status} ${compactResponseUrl(response.url())} content_type=${contentType || 'unknown'}${body ? ` body=${body}` : ''}`
      );
    })();
    pending.push(task);
  };

  page.on('response', onResponse);
  return {
    async stop() {
      page.off('response', onResponse);
      await Promise.allSettled(pending);
      return entries;
    },
  };
}

module.exports = {
  addRole,
  createMutationResponseCapture,
  removeRoleFromTable,
  roleRowLocator,
  waitForPortalMarkerState,
};
