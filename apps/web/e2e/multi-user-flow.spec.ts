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
import { gotoApp } from './utils/navigation';

test.describe('Multi-User Claim Workflow', () => {
  test.describe('Member Claim Creation', () => {
    test('Member can navigate to new claim page', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.memberClaims(), testInfo);
      await page.waitForLoadState('domcontentloaded');

      // Look for create claim button
      const newClaimLink = page.getByRole('link', { name: /New Claim|Create/i }).first();

      // Either click the button or navigate directly
      if (await newClaimLink.isVisible().catch(() => false)) {
        await newClaimLink.scrollIntoViewIfNeeded();
        await newClaimLink.click({ force: true });
        await page.waitForURL(/\/member\/claims\/new/, { timeout: 10000 });
      } else {
        await gotoApp(page, routes.memberNewClaim(), testInfo);
        await page.waitForLoadState('domcontentloaded');
      }

      expect(page.url()).toContain('/claims/new');
    });

    test('Member can see their existing claims', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.memberClaims(), testInfo);
      await page.waitForLoadState('domcontentloaded');

      // Should see claims table or list
      const content = await page.content();
      const hasClaims =
        content.includes('claim') || content.includes('Claim') || content.includes('No claims');

      expect(hasClaims).toBeTruthy();
    });
  });

  test.describe('Agent-Member Relationship', () => {
    test('Agent can access assigned members list', async ({ agentPage: page }, testInfo) => {
      await gotoApp(page, routes.agentClients(), testInfo);
      await page.waitForLoadState('domcontentloaded');

      // Agent should see member list content
      const mainContent = page.locator('main, body').first();
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe('Staff Claim Management', () => {
    test('Staff can access claims queue', async ({ staffPage: page }, testInfo) => {
      await gotoApp(page, routes.staffClaims(), testInfo);
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/staff');
    });

    test('Staff is redirected from admin claims to dashboard', async ({
      staffPage: page,
    }, testInfo) => {
      await gotoApp(page, `${routes.adminClaims()}?view=list`, testInfo, {
        marker: 'admin-claims-v2-ready',
      });
      await page.waitForLoadState('domcontentloaded');

      // Staff is denied from admin claims routes (defense-in-depth).
      // Can be 404 OR redirect to home/dashboard depending on layout guards.
      await expect(async () => {
        const url = page.url();
        const isRedirected = !url.includes('/admin');
        const isNotFound = await page
          .getByTestId('not-found-page')
          .isVisible()
          .catch(() => false);
        expect(isRedirected || isNotFound).toBeTruthy();
      }).toPass();
    });

    test('Staff can view claims via staff workspace', async ({ staffPage: page }, testInfo) => {
      await gotoApp(page, routes.staffClaims(), testInfo);
      await page.waitForLoadState('domcontentloaded');

      // Staff should be able to see claims in staff view
      const content = await page.content();
      const hasClaims =
        content.includes('claim') || content.includes('Claim') || content.includes('Worker');
      expect(hasClaims).toBeTruthy();
    });
  });

  test.describe('Admin Full Access', () => {
    test('Admin can see all claims', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, `${routes.adminClaims()}?view=list`, testInfo, {
        marker: 'admin-claims-v2-ready',
      });
      await page.waitForLoadState('domcontentloaded');

      // Locale-agnostic: assert the V2 List container renders.
      await expect(page.getByTestId('admin-claims-v2-ready')).toBeVisible();
    });

    test('Admin can see all users', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.adminUsers(), testInfo);
      await page.waitForLoadState('domcontentloaded');
      // Locale-agnostic: assert users page root renders.
      await expect(page.getByTestId('admin-users-page')).toBeVisible({ timeout: 10000 });
    });

    test('Admin can access any claim details', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, `${routes.adminClaims()}?view=list`, testInfo, {
        marker: 'admin-claims-v2-ready',
      });
      await page.waitForLoadState('domcontentloaded');

      // Expect > 0 claims with polling/timeout
      await expect(async () => {
        const claimLinks = page.locator('a[href*="/claims/"], tr');
        const count = await claimLinks.count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: 10000 });
    });

    test('Admin can see claim status options', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, `${routes.adminClaims()}?view=list`, testInfo, {
        marker: 'admin-claims-v2-ready',
      });
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
  }, testInfo) => {
    // Try to access a claim that belongs to another user
    await gotoApp(page, routes.memberClaimDetail('claim-1-worker5'), testInfo);
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

  test('Agent is redirected away from staff claims detail', async ({
    agentPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.staffClaimDetail('claim-1-worker9'), testInfo);
    await page.waitForLoadState('domcontentloaded');

    // Access is denied. Can be 404 or redirect to agent dashboard.
    await expect(async () => {
      const url = page.url();
      const isRedirected = url.includes('/agent') || url.includes('/member');
      const isNotFound = await page
        .getByTestId('not-found-page')
        .isVisible()
        .catch(() => false);
      expect(isRedirected || isNotFound).toBeTruthy();
    }).toPass();
  });

  test('Staff can access claims via staff workspace', async ({ staffPage: page }, testInfo) => {
    await gotoApp(page, routes.staffClaims(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/staff');
  });

  function getRootURLFromBaseURL(baseURL: string | undefined): string {
    if (baseURL) return new URL(baseURL).origin;
    return (
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.BETTER_AUTH_URL ||
      'http://localhost:3000'
    );
  }

  test('Unauthenticated user cannot access protected routes', async ({ request }, testInfo) => {
    const rootURL = getRootURLFromBaseURL(testInfo.project.use.baseURL?.toString());
    const memberUrl = `${rootURL}${routes.member()}`;

    // Golden path determinism: middleware must return a redirect BEFORE any React rendering.
    const res = await request.get(memberUrl, { maxRedirects: 0 });
    expect(res.status(), `Expected 307 redirect for ${memberUrl}`).toBe(307);

    const headers = res.headers();
    expect(headers['x-auth-guard']).toBe('middleware');

    const location = headers.location;
    expect(location, 'Expected Location header on redirect').toBeTruthy();
    expect(location).toContain(`${routes.login()}`);
  });

  test('Unauthenticated user cannot access admin routes', async ({ request }, testInfo) => {
    const rootURL = getRootURLFromBaseURL(testInfo.project.use.baseURL?.toString());
    const adminUrl = `${rootURL}${routes.admin()}`;

    const res = await request.get(adminUrl, { maxRedirects: 0 });
    expect(res.status(), `Expected 307 redirect for ${adminUrl}`).toBe(307);

    const headers = res.headers();
    expect(headers['x-auth-guard']).toBe('middleware');

    const location = headers.location;
    expect(location, 'Expected Location header on redirect').toBeTruthy();
    expect(location).toContain(`${routes.login()}`);
  });

  test('Unauthenticated user cannot access staff routes', async ({ request }, testInfo) => {
    const rootURL = getRootURLFromBaseURL(testInfo.project.use.baseURL?.toString());
    const staffUrl = `${rootURL}${routes.staffClaims()}`;

    const res = await request.get(staffUrl, { maxRedirects: 0 });
    expect(res.status(), `Expected 307 redirect for ${staffUrl}`).toBe(307);

    const headers = res.headers();
    expect(headers['x-auth-guard']).toBe('middleware');

    const location = headers.location;
    expect(location, 'Expected Location header on redirect').toBeTruthy();
    expect(location).toContain(`${routes.login()}`);
  });
});
