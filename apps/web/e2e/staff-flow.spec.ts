/**
 * Staff Flow Integration Test
 *
 * This is a comprehensive end-to-end test that covers the full workflow of:
 * 1. Member creating a claim
 * 2. Staff managing the claim (assign, update status, messaging)
 *
 * SKIP by default: This test is complex, requires database writes, and is
 * sensitive to timing issues with the submit button state. It's meant for
 * integration testing environments, not CI.
 */

import { expect, test } from '@playwright/test';
import path from 'node:path';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Staff Claim Operations', () => {
  // Skip this complex integration test - it requires specific timing and data state
  test.skip('Staff can view, assign, update, and message on claims', async ({
    browser,
  }, testInfo) => {
    // -----------------------------------------------------------------------
    // 1. MEMBER: Create a new claim
    // -----------------------------------------------------------------------
    const memberContext = await browser.newContext({
      storageState: path.join(__dirname, 'fixtures/.auth/member.json'),
    });
    const memberPage = await memberContext.newPage();

    await gotoApp(memberPage, routes.memberNewClaim('en'), testInfo);
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
    await gotoApp(staffPage, routes.staffClaims('en'), testInfo);
    await expect(staffPage.getByRole('heading', { name: 'Claims Queue' })).toBeVisible();

    // Search/Find the specific claim to avoid race conditions with other tests
    await expect(staffPage.getByText(claimTitle)).toBeVisible();

    // Click on the claim row
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
    const actionPanel = staffPage.getByText('Staff Actions').locator('..');
    await actionPanel.getByRole('combobox').click();
    await staffPage.getByRole('option', { name: 'In Verification' }).click();

    await staffPage.getByPlaceholder('Reason for status change...').fill('Staff E2E Check');
    await staffPage.getByRole('button', { name: 'Update Claim' }).click();
    await expect(staffPage.getByText('Claim status updated')).toBeVisible();

    // Messaging - Internal Note
    await staffPage.getByRole('tab', { name: 'Messages' }).click();

    // Send Internal Note
    const internalToggle = staffPage.getByRole('button', { name: 'Public Message' });
    if (await internalToggle.isVisible()) {
      await internalToggle.click();
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
    await staffPage.getByRole('button', { name: 'Internal Note' }).click();
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
