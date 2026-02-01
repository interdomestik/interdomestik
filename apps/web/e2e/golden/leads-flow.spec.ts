import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

test.describe('Leads & Conversion Flow (Golden)', () => {
  const uniqueId = Date.now().toString(36); // Deterministic based on time
  const leadData = {
    firstName: `Lead${uniqueId}`,
    lastName: 'Test',
    email: `lead${uniqueId}@example.com`,
    phone: '+38344123123',
    notes: 'Interested in annual plan',
  };

  test('Agent creates lead, takes cash payment, and Admin converts', async ({
    page,
    loginAs,
  }, testInfo) => {
    // 1. Agent Login & Lead Creation
    await test.step('Agent creates a new lead', async () => {
      await loginAs('agent');
      await gotoApp(page, '/agent/leads', testInfo, { marker: 'body' });

      // Open Create Dialog
      await page.getByRole('button', { name: 'New Lead' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Create New Lead' })).toBeVisible();

      // Fill Form
      await page.getByLabel('First Name').fill(leadData.firstName);
      await page.getByLabel('Last Name').fill(leadData.lastName);
      await page.getByLabel('Email').fill(leadData.email);
      await page.getByLabel('Phone').fill(leadData.phone);
      await page.getByLabel('Notes').fill(leadData.notes);

      // Submit
      await page.getByRole('button', { name: 'Create Lead' }).click();

      // Verify Success using Sonner toast or seeing it in list
      try {
        await expect(page.getByText('Lead created successfully')).toBeVisible({ timeout: 5000 });
      } catch (e) {
        // Log any visible text that looks like a toast or error
        const toasts = page.locator('li[data-sonner-toast]');
        if ((await toasts.count()) > 0) {
          const toastText = await toasts.first().textContent();
          console.error(`Toast visible: ${toastText}`);
          throw new Error(`Create Lead failed with toast: ${toastText}`);
        }
        throw e;
      }

      // Verify in list
      await expect(page.getByRole('cell', { name: leadData.email })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'New', exact: true })).toBeVisible();
    });

    // 2. Mark Contacted
    await test.step('Agent marks lead as contacted', async () => {
      // Find row with our lead
      const row = page.getByRole('row').filter({ hasText: leadData.email });

      await row.getByRole('button', { name: 'Mark Contacted' }).click();

      await expect(page.getByText('Lead marked as contacted')).toBeVisible();
      await expect(row.getByText('Contacted', { exact: true })).toBeVisible();
    });

    // 3. Cash Payment
    await test.step('Agent initiates cash payment', async () => {
      const row = page.getByRole('row').filter({ hasText: leadData.email });

      await row.getByRole('button', { name: 'Pay Cash' }).click();

      await expect(page.getByText('Cash payment recorded')).toBeVisible();
      await expect(row.getByText('Waiting Approval')).toBeVisible();
    });

    // 4. Admin Verification
    await test.step('Admin approves payment and converts lead', async () => {
      await loginAs('admin');
      // In V2, verification ops center is at /admin/leads
      await gotoApp(page, '/admin/leads', testInfo, { marker: 'body' });

      // Find the row in the V2 table
      const verificationRow = page
        .getByTestId('cash-verification-row')
        .filter({ hasText: `${leadData.firstName} ${leadData.lastName}` });

      await expect(verificationRow).toBeVisible();

      // In V2, we approve directly from the row
      await verificationRow.getByTestId('cash-approve').click();

      // Wait for success toast
      await expect(page.getByText('Pagesa u aprovua.')).toBeVisible();
    });

    // 5. Verify Conversion
    await test.step('Verify lead is converted', async () => {
      await loginAs('agent');
      await gotoApp(page, '/agent/leads', testInfo, { marker: 'body' });

      const row = page.getByRole('row').filter({ hasText: leadData.email });
      // Badge text in StatusBadge.tsx is 'Member' for 'converted'
      await expect(row.getByText('Member', { exact: true })).toBeVisible();
      // Action text in LeadActions.tsx is 'Complete' for 'converted'
      await expect(row.getByText('Complete', { exact: true })).toBeVisible();
    });
  });
});
