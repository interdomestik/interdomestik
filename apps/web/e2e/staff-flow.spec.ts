import { expect, test } from '@playwright/test';
import path from 'node:path';

test.describe('Staff Claim Operations', () => {
  test('Staff can view, assign, update, and message on claims', async ({ browser }) => {
    // -----------------------------------------------------------------------
    // 1. MEMBER: Create a new claim
    // -----------------------------------------------------------------------
    const memberContext = await browser.newContext({
      storageState: path.join(__dirname, 'fixtures/.auth/member.json'),
    });
    const memberPage = await memberContext.newPage();

    await memberPage.goto('/en/member/claims/new');
    await expect(memberPage.locator('h1')).toContainText('New Claim');

    // Step 1: Category
    await memberPage.waitForLoadState('domcontentloaded');
    await memberPage.getByTestId('category-vehicle').click();
    await memberPage.waitForTimeout(600);
    await memberPage.getByTestId('wizard-next').click();

    // Step 2: Details
    await memberPage.waitForLoadState('domcontentloaded');
    const claimTitle = `Staff Test Claim ${Date.now()}`;
    await memberPage.getByLabel('Claim Title').fill(claimTitle);
    await memberPage.getByLabel('Company Name').fill('Staff Flow Corp');
    await memberPage.getByLabel('Description').fill('Testing staff operations');
    await memberPage.getByLabel('Amount (Optional)').fill('1000');
    // Handle date input (might be tricky, skipping if not strictly required or use fill)
    // Assuming date is optional or defaults, or fill it:
    await memberPage.getByLabel('Date of Incident').fill(new Date().toISOString().split('T')[0]);

    await memberPage.getByTestId('wizard-next').click();

    // Step 3: Evidence (Skip)
    await memberPage.getByTestId('wizard-next').click();

    // Submit
    const submitButton = memberPage.getByTestId('wizard-submit');
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    // Wait for redirect to list
    await memberPage.waitForURL(url => url.pathname.includes('/member/claims'));
    await memberContext.close();

    // -----------------------------------------------------------------------
    // 2. STAFF: Manage the claim
    // -----------------------------------------------------------------------
    const staffContext = await browser.newContext({
      storageState: path.join(__dirname, 'fixtures/.auth/staff.json'),
    });
    const staffPage = await staffContext.newPage();

    // Go to staff claims queue
    await staffPage.goto('/en/staff/claims');
    await expect(staffPage.getByRole('heading', { name: 'Claims Queue' })).toBeVisible();

    // Search/Find the specific claim to avoid race conditions with other tests
    // Assuming list shows newest first, it should be top.
    // Verify title exists in table
    await expect(staffPage.getByText(claimTitle)).toBeVisible();

    // Click on the claim row (find row by text)
    await staffPage
      .getByRole('row', { name: claimTitle })
      .getByRole('link', { name: 'Review Case' })
      .click();

    // Verify Detail Page
    await expect(staffPage.getByText('Claim Details')).toBeVisible();

    // Assign to Me
    const assignButton = staffPage.getByRole('button', { name: 'Assign to Me' });
    if (await assignButton.isVisible()) {
      await assignButton.click();
      await expect(staffPage.getByText('Claim assigned to you')).toBeVisible();
    }

    // Update Status
    // Region: Staff Actions
    const actionPanel = staffPage.getByText('Staff Actions').locator('..');

    // Update Status
    // Open select (Select matching the label nearby or just use the first one in the panel)
    // There might be multiple select triggers, so let's be specific
    await actionPanel.getByRole('combobox').click();
    // Select "In Verification"
    await staffPage.getByRole('option', { name: 'In Verification' }).click();

    await staffPage.getByPlaceholder('Reason for status change...').fill('Staff E2E Check');
    await staffPage.getByRole('button', { name: 'Update Claim' }).click();
    await expect(staffPage.getByText('Claim status updated')).toBeVisible();

    // Messaging - Internal Note
    await staffPage.getByRole('tab', { name: 'Messages' }).click();

    // Send Internal Note
    const internalToggle = staffPage.getByRole('button', { name: 'Public Message' });
    if (await internalToggle.isVisible()) {
      await internalToggle.click(); // Toggle to Internal
    }

    const internalMsg = `Internal note ${Date.now()}`;
    await staffPage.getByPlaceholder('Add an internal note...').fill(internalMsg);
    await staffPage
      .getByRole('button')
      .filter({ has: staffPage.locator('svg.lucide-send') })
      .click();
    await expect(staffPage.getByText(internalMsg)).toBeVisible();
    await expect(staffPage.getByText('Internal', { exact: true }).last()).toBeVisible();

    // Send Public Message
    await staffPage.getByRole('button', { name: 'Internal Note' }).click(); // Toggle to Public
    const publicMsg = `Public msg ${Date.now()}`;
    await staffPage.getByPlaceholder('Type a message...').fill(publicMsg);
    await staffPage
      .getByRole('button')
      .filter({ has: staffPage.locator('svg.lucide-send') })
      .click();
    await expect(staffPage.getByText(publicMsg)).toBeVisible();

    await staffContext.close();
  });
});
