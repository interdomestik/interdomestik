import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Pro Scaffold (Golden)', () => {
  test('Agent can switch between Lite and Pro workspace', async ({ page, loginAs }) => {
    // 1. Login as Agent
    await loginAs('agent');

    // 2. Start at Lite Dashboard
    await expect(page).toHaveURL(/\/agent$/);
    await expect(page.getByTestId('agent-home')).toBeVisible();

    // 3. Switch to Pro
    const switchProBtn = page.getByTestId('agent-switch-pro');
    await expect(switchProBtn).toBeVisible();
    await switchProBtn.click();

    // 4. Verify Pro Workspace
    await expect(page).toHaveURL(/\/agent\/workspace/);
    await expect(page.getByTestId('agent-pro-shell')).toBeVisible();
    await expect(page.getByText('Agent Pro Workspace')).toBeVisible();

    // 5. Switch back to Lite
    const switchLiteBtn = page.getByTestId('agent-switch-lite');
    await expect(switchLiteBtn).toBeVisible();
    await switchLiteBtn.click();

    // 6. Verify back at Lite
    await expect(page).toHaveURL(/\/agent$/);
    await expect(page.getByTestId('agent-home')).toBeVisible();
  });
});
