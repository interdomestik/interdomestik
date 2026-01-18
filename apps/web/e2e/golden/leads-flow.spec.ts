import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';

test.describe('Leads & Conversion Flow (Golden)', () => {
  const uniqueId = Date.now().toString(36); // Deterministic based on time
  const leadData = {
    firstName: `Lead${uniqueId}`,
    lastName: 'Test',
    email: `lead${uniqueId}@example.com`,
    phone: '+38344123123',
    notes: 'Interested in annual plan',
  };

  test('Agent creates lead, takes cash payment, and Admin converts', async ({ page, loginAs }) => {
    // 1. Agent Login & Lead Creation
    await test.step('Agent creates a new lead', async () => {
      await loginAs('agent');
      await page.goto('/agent/leads');

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
      await loginAs('admin'); // Re-login as Admin
      // assuming /admin/verification is the path, or via dashboard.
      // Based on previous contexts, verify page is at /admin/verification or similar.
      // Let's check routes. But usually it's /admin/verification/cash-queue or similar?
      // Let's check apps/web/src/app/[locale]/(dashboard)/admin/verification/page.tsx or sidebar.
      // Actually I saw 'Admin Verification Queue (Cash)' in verify.spec.ts pointing to /admin/verification

      await page.goto('/admin/leads');

      // Find the verification item. It might be by lead name or amount.
      // The list likely shows 'Lead Name' or similar.
      const verificationRow = page
        .getByRole('row')
        .filter({ hasText: `${leadData.firstName} ${leadData.lastName}` });

      // Click specific Verify button or link.
      // In `admin-verification-flow.spec.ts`: await page.getByRole('link', { name: 'Verify' }).first().click();
      // Assuming row action:
      await verificationRow.getByRole('link', { name: 'Verify' }).click();

      // On Detail Page
      await expect(page.getByText('Cash Payment Verification')).toBeVisible();
      await page.getByRole('button', { name: 'Approve Payment' }).click();

      // Confirm dialog if any, or simple action.
      // Assuming simple action or standard dialog.
      // Checking verify.spec.ts: await page.getByRole('button', { name: 'Approve' }).click();

      // Wait for success
      await expect(page.getByText('Payment verified')).toBeVisible();
    });

    // 5. Verify Conversion
    await test.step('Verify lead is converted', async () => {
      await loginAs('agent');
      await page.goto('/agent/leads');

      const row = page.getByRole('row').filter({ hasText: leadData.email });
      await expect(row.getByText('Complete')).toBeVisible(); // 'Member' badge
      await expect(row.getByText('Member', { exact: true })).toBeVisible();
    });
  });
});
