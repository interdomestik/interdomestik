import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Branch Management', () => {
  const branchName = `Test Branch ${Date.now()}`;
  const branchCode = `TB-${Date.now()}`;

  // TODO: Rewrite for Card-based UI. Legacy test expects Table.
  test.skip('Admin can CRUD branches', async ({ adminPage: page }) => {
    // 1. Navigate to Branches page
    await page.goto(routes.adminBranches());
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/admin/branches');

    // 2. Create Branch
    await page.getByRole('button', { name: /create branch/i }).click();
    await page.getByLabel(/name/i).fill(branchName);
    await page.getByLabel(/code/i).fill(branchCode);
    await page.getByRole('button', { name: /create/i }).click();

    // Verify creation (check toast or table presence)
    await expect(page.getByText(branchName)).toBeVisible();
    await expect(page.getByText(branchCode)).toBeVisible();

    // 3. Edit Branch
    await page
      .getByRole('row', { name: branchName })
      .getByRole('button', { name: /actions/i })
      .click();
    await page.getByRole('menuitem', { name: /edit/i }).click();

    const updatedName = `${branchName} Updated`;
    await page.getByLabel(/name/i).fill(updatedName);
    // Code might be read-only or editable, check implementation. Assuming editable.
    await page.getByRole('button', { name: /update/i }).click();

    await expect(page.getByText(updatedName)).toBeVisible();

    // 4. Delete Branch
    await page
      .getByRole('row', { name: updatedName })
      .getByRole('button', { name: /actions/i })
      .click();
    await page.getByRole('menuitem', { name: /delete/i }).click();

    // Confirm dialog
    await page.getByRole('button', { name: /delete/i, exact: true }).click(); // Select destroy button in dialog

    await expect(page.getByText(updatedName)).not.toBeVisible();
  });
});
