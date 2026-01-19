import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';

/**
 * Leads & Conversion Flow
 *
 * @ticket INTERDO-Q004: Re-enable after leads creation UI is stabilized
 * @expiry 2026-02-15
 */
test.describe('Leads & Conversion Flow (Golden)', () => {
  const uniqueId = Date.now().toString(36);
  const leadData = {
    firstName: `Lead${uniqueId}`,
    lastName: 'Test',
    email: `lead${uniqueId}@example.com`,
    phone: '+38344123123',
    notes: 'Interested in annual plan',
  };

  const localeFromPage = (page: { url: () => string }) => {
    const pathname = new URL(page.url()).pathname;
    const locale = pathname.split('/')[1];
    return locale || 'sq';
  };

  test('Agent creates lead, takes cash payment, and Admin converts', async ({ page, loginAs }) => {
    // 1. Agent Login & Lead Creation
    await test.step('Agent creates a new lead', async () => {
      await loginAs('agent');
      const locale = localeFromPage(page);
      await page.goto(`/${locale}/agent/leads`);

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

      // Verify Success
      try {
        await expect(page.getByText('Lead created successfully')).toBeVisible({ timeout: 5000 });
      } catch (e) {
        const toasts = page.locator('li[data-sonner-toast]');
        if ((await toasts.count()) > 0) {
          const toastText = await toasts.first().textContent();
          console.error(`Toast visible: ${toastText}`);
          throw new Error(`Create Lead failed with toast: ${toastText}`);
        }
        throw e;
      }

      // Verify in list
      const row = page.getByRole('row').filter({ hasText: leadData.email });
      await expect(row).toBeVisible();
      await expect(row).toContainText('New', { ignoreCase: true });
    });

    // 2. Mark Contacted
    await test.step('Agent marks lead as contacted', async () => {
      const row = page.getByRole('row').filter({ hasText: leadData.email });
      await row.click();

      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();

      // Expand More Actions
      await drawer.getByText('More Actions').click();
      await drawer.getByRole('button', { name: 'Mark Contacted' }).click();
      await expect(page.getByText('Lead marked as contacted')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(row).toContainText('Contacted', { ignoreCase: true });
    });

    // 3. Cash Payment
    await test.step('Agent initiates cash payment', async () => {
      const row = page.getByRole('row').filter({ hasText: leadData.email });
      await row.click();

      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();

      // Verify status updated in drawer to ensure actions are refreshed
      await expect(drawer).toContainText('Contacted', { ignoreCase: true });

      // Expand More Actions
      await drawer.getByText('More Actions').click();
      await expect(drawer.getByRole('button', { name: 'Request Payment' })).toBeVisible();
      await drawer.getByRole('button', { name: 'Request Payment' }).click();
      await expect(page.getByText('Payment requested')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(row).toContainText('Payment Pending', { ignoreCase: true });
    });

    // 4. Admin Verification
    await test.step('Admin approves payment and converts lead', async () => {
      await loginAs('admin');
      const locale = localeFromPage(page);
      await page.goto(`/${locale}/admin/leads`);

      const verificationRow = page
        .getByTestId('cash-verification-row')
        .filter({ hasText: `${leadData.firstName} ${leadData.lastName}` });

      await expect(verificationRow).toBeVisible();
      await verificationRow.getByTestId('cash-approve').click();
      await expect(page.getByText('Pagesa u aprovua.')).toBeVisible();
    });

    // 5. Verify Conversion
    await test.step('Verify lead is converted', async () => {
      await loginAs('agent');
      const locale = localeFromPage(page);
      await page.goto(`/${locale}/agent/leads`);

      const row = page.getByRole('row').filter({ hasText: leadData.email });
      await expect(row.getByText('Member', { exact: true })).toBeVisible();
      await expect(row.getByText('Complete', { exact: true })).toBeVisible();
    });
  });
});
