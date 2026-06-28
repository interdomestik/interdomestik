async function hasVisibleTestId(page, testId) {
  const count = await page
    .locator(`[data-testid="${testId}"]:visible`)
    .count()
    .catch(() => 0);
  return count > 0;
}

module.exports = { hasVisibleTestId };
