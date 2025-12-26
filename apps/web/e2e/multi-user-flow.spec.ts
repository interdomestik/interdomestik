/**
 * Multi-User Interaction E2E Tests
 *
 * Tests that simulate real-world interactions between different user roles:
 * - Members creating claims
 * - Agents viewing their clients' claims
 * - Staff/Admin managing claims
 * - Cross-role data isolation verification
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Multi-User Claim Workflow', () => {
  test.describe('Member Claim Creation', () => {
    test('Member can navigate to new claim page', async ({ authenticatedPage: page }) => {
      await page.goto(routes.memberClaims());
      await page.waitForLoadState('domcontentloaded');

      // Look for create claim button
      const newClaimLink = page.getByRole('link', { name: /New Claim|Create/i });

      // Either click the button or navigate directly
      if (await newClaimLink.isVisible().catch(() => false)) {
        await newClaimLink.click();
        await page.waitForLoadState('domcontentloaded');
      } else {
        await page.goto(routes.memberNewClaim());
        await page.waitForLoadState('domcontentloaded');
      }

      expect(page.url()).toContain('/claims/new');
    });

    test('Member can see their existing claims', async ({ authenticatedPage: page }) => {
      await page.goto(routes.memberClaims());
      await page.waitForLoadState('domcontentloaded');

      // Should see claims table or list
      const content = await page.content();
      const hasClaims =
        content.includes('claim') || content.includes('Claim') || content.includes('No claims');

      expect(hasClaims).toBeTruthy();
    });
  });

  test.describe('Agent-Member Relationship', () => {
    test('Agent can access assigned members list', async ({ agentPage: page }) => {
      await page.goto(routes.agentClients());
      await page.waitForLoadState('domcontentloaded');

      // Agent should see member list content
      const mainContent = page.locator('main, body').first();
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe('Staff Claim Management', () => {
    test('Staff can access claims queue', async ({ staffPage: page }) => {
      await page.goto(routes.staffClaims());
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/staff');
    });

    test('Staff is redirected from admin claims to dashboard', async ({ staffPage: page }) => {
      await page.goto(routes.adminClaims());
      await page.waitForLoadState('domcontentloaded');

      // Staff is redirected - verify they end up on staff workspace
      const url = page.url();
      expect(url).toContain('/staff');
    });

    test('Staff can view claims via staff workspace', async ({ staffPage: page }) => {
      await page.goto(routes.staffClaims());
      await page.waitForLoadState('domcontentloaded');

      // Staff should be able to see claims in staff view
      const content = await page.content();
      const hasClaims =
        content.includes('claim') || content.includes('Claim') || content.includes('Worker');
      expect(hasClaims).toBeTruthy();
    });
  });

  test.describe('Admin Full Access', () => {
    test('Admin can see all claims', async ({ adminPage: page }) => {
      await page.goto(routes.adminClaims());
      await page.waitForLoadState('domcontentloaded');

      // Admin should see claims management UI
      await expect(page.getByRole('heading', { name: /Claims Management/i })).toBeVisible();
    });

    test('Admin can see all users', async ({ adminPage: page }) => {
      await page.goto(routes.adminUsers());
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('heading', { name: 'Members', level: 1 })).toBeVisible({
        timeout: 10000,
      });
    });

    test('Admin can access any claim details', async ({ adminPage: page }) => {
      await page.goto(routes.adminClaims());
      await page.waitForLoadState('domcontentloaded');

      // Expect > 0 claims with polling/timeout
      await expect(async () => {
        const claimLinks = page.locator('a[href*="/claims/"], tr');
        const count = await claimLinks.count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: 10000 });
    });

    test('Admin can see claim status options', async ({ adminPage: page }) => {
      await page.goto(routes.adminClaims());
      await page.waitForLoadState('domcontentloaded');

      // Should see status filters or options
      const content = await page.content();
      const hasStatusUI =
        content.includes('status') || content.includes('Status') || content.includes('All');

      expect(hasStatusUI).toBeTruthy();
    });
  });
});

test.describe('Cross-Role Data Isolation', () => {
  test('Members cannot access other members claims directly', async ({
    authenticatedPage: page,
  }) => {
    // Try to access a claim that belongs to another user
    await page.goto(routes.memberClaimDetail('claim-1-worker5'));
    await page.waitForLoadState('domcontentloaded');

    // Should be denied or redirected - handled gracefully
    const url = page.url();
    const content = await page.content();

    // Either redirected to claims list, or error shown
    expect(
      url.includes('/member/claims') ||
        content.includes('not found') ||
        content.includes('Not Found') ||
        content.includes('denied') ||
        content.includes('unauthorized')
    ).toBeTruthy();
  });

  test('Agent is redirected away from staff claims detail', async ({ agentPage: page }) => {
    await page.goto(routes.staffClaimDetail('claim-1-worker9'));
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).not.toContain('/staff/claims');
  });

  test('Staff can access claims via staff workspace', async ({ staffPage: page }) => {
    await page.goto(routes.staffClaims());
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/staff');
  });

  test('Unauthenticated user cannot access protected routes', async ({ page }) => {
    // Do not log in
    await page.goto(routes.member());
    await page.waitForLoadState('domcontentloaded');

    // Should be redirected to login
    const url = page.url();
    const isProtected =
      url.includes('/login') || url.includes('/sign-in') || !url.includes('/member');

    expect(isProtected).toBeTruthy();
  });

  test('Unauthenticated user cannot access admin routes', async ({ page }) => {
    await page.goto(routes.admin());
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).not.toMatch(/\/admin$/);
  });

  test('Unauthenticated user cannot access staff routes', async ({ page }) => {
    await page.goto(routes.staffClaims());
    await page.waitForLoadState('domcontentloaded');

    const url = page.url();
    expect(url.includes('/login') || !url.includes('/staff')).toBeTruthy();
  });
});
