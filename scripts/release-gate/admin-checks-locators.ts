const { MARKERS, SELECTORS, TIMEOUTS } = require('./config.ts');
const { createMutationResponseCapture } = require('./admin-checks-response-capture.ts');
const { markerSnapshot, resolvePlaywright } = require('./shared.ts');

function terminalMarkerKeys(preferredMarker) {
  if (preferredMarker) return [preferredMarker, 'notFound'];
  return ['member', 'agent', 'staff', 'admin', 'notFound'];
}

function hasTerminalMarker(snapshot, preferredMarker) {
  return terminalMarkerKeys(preferredMarker).some(key => snapshot[key] === true);
}

async function waitForPortalMarkerState(page, preferredMarker) {
  const { expect } = resolvePlaywright();
  let snapshot = await markerSnapshot(page);
  if (hasTerminalMarker(snapshot, preferredMarker)) return snapshot;
  await expect
    .poll(
      async () => {
        snapshot = await markerSnapshot(page);
        return hasTerminalMarker(snapshot, preferredMarker);
      },
      { timeout: TIMEOUTS.marker }
    )
    .toBe(true)
    .catch(() => {});
  return snapshot;
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

function caseInsensitiveLiteral(value) {
  return String(value).replace(/[a-z]/gi, char => `[${char.toLowerCase()}${char.toUpperCase()}]`);
}

function roleTextPattern(roleName) {
  const normalizedRoleName = String(roleName || '').trim();
  if (!normalizedRoleName) return /a^/;
  const roleLiteral = caseInsensitiveLiteral(escapeRegExp(normalizedRoleName));
  return new RegExp(String.raw`\b${roleLiteral}(?=\b|Tenant-wide)`);
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

module.exports = {
  addRole,
  createMutationResponseCapture,
  removeRoleFromTable,
  roleRowLocator,
  waitForPortalMarkerState,
};
