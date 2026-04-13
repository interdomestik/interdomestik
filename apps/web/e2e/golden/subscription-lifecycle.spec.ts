import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

async function fillPersisted(page: Page, selector: string, value: string) {
  const input = page.locator(selector);
  let persisted = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    await input.fill('');
    await input.fill(value);

    persisted = (await input.inputValue()) === value;
    if (persisted) {
      break;
    }

    await page.waitForTimeout(250);
  }

  if (!persisted) {
    await expect(input).toHaveValue(value);
  }
}

function resolveTenantId(projectName: string) {
  if (projectName.includes('pilot')) {
    return 'pilot-mk';
  }

  if (projectName.includes('mk')) {
    return 'tenant_mk';
  }

  return 'tenant_ks';
}

/**
 * Subscription Lifecycle (Golden Flow)
 *
 * Verifies: Signup -> Plan Selection -> Checkout (Mock) -> Active Membership
 */
test.describe('Golden Flow: Subscription Lifecycle', () => {
  test('New user can register and subscribe to standard plan', async ({ page }, testInfo) => {
    const projectKey = testInfo.project.name.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase();
    const unique = `${projectKey}-${Date.now().toString(36)}-${testInfo.retry}`;
    const email = `sub-e2e-${unique}@example.com`;
    const password = 'TestPassword123!';
    const fullName = `Sub E2E ${unique}`;
    const tenantId = resolveTenantId(testInfo.project.name);

    // 1. Register
    await gotoApp(page, `${routes.register(testInfo)}?tenantId=${tenantId}`, testInfo, {
      marker: 'registration-page-ready',
    });

    await fillPersisted(page, 'input[name="fullName"]', fullName);
    await fillPersisted(page, 'input[name="email"]', email);
    await fillPersisted(page, 'input[name="password"]', password);
    await fillPersisted(page, 'input[name="confirmPassword"]', password);
    const fullNameInput = page.locator('input[name="fullName"]');
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    const confirmPasswordInput = page.locator('input[name="confirmPassword"]');
    await expect(fullNameInput).toHaveValue(fullName);
    await expect(emailInput).toHaveValue(email);
    await expect(passwordInput).toHaveValue(password);
    await expect(confirmPasswordInput).toHaveValue(password);
    await page.check('#terms');
    await page.click('button[type="submit"]');

    // 2. land on member dashboard - status should be inactive
    await expect(page.getByTestId('dashboard-page-ready')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('member-dashboard-ready')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(new RegExp(`.*${routes.member(testInfo)}`));

    // Rule #4: Use data-testid for critical status
    const statusBadge = page.getByTestId('protection-status');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toContainText(
      /No Active Protection|Pa Mbrojtje Aktive|Нема активна заштита|Nema aktivne zaštite/i
    );

    // 3. Go to pricing to activate
    await gotoApp(page, routes.pricing(testInfo), testInfo, { marker: 'pricing-page-ready' });

    // 4. Start Checkout (Standard)
    await page.getByTestId('plan-cta-standard').click();

    // 5. Verify Success Page
    await expect(page).toHaveURL(/.*\/member\/membership\/success/, { timeout: 15000 });
    await expect(page.getByTestId('success-page-ready')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('success-card')).toBeVisible({ timeout: 15000 });
    const mockActivationStatus = page.getByTestId('mock-activation-status');
    if ((await mockActivationStatus.count()) > 0) {
      await expect(mockActivationStatus).toHaveAttribute('data-state', 'success', {
        timeout: 15000,
      });
    }

    // 6. Verify Active Membership in UI
    let subItemVisible = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await gotoApp(page, routes.memberMembership(testInfo), testInfo, {
        marker: 'membership-page-ready',
      });

      const subItem = page.getByTestId('subscription-item').first();
      if (await subItem.isVisible().catch(() => false)) {
        await expect(subItem).toContainText(/ACTIVE/i);
        await expect(subItem.getByTestId('subscription-plan-name')).toContainText(/Standard/i);
        subItemVisible = true;
        break;
      }

      await page.waitForTimeout(1000);
    }

    expect(subItemVisible).toBe(true);
  });
});
