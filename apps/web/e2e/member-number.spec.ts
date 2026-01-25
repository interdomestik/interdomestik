import { db } from '@interdomestik/database/db';
import { tenants, user } from '@interdomestik/database/schema';
import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

// Enable full trace for this test suite
test.use({ trace: 'on' });

test.describe('Member Number Hardening @quarantine', () => {
  test.beforeEach(({ page }) => {
    // Diagnostics: Console & Network (with noise filtering)
    page.on('console', msg => {
      const text = msg.text();
      // Filter out standard React/Next.js dev noise
      if (
        text.includes('React DevTools') ||
        text.includes('[HMR]') ||
        text.includes('[Fast Refresh]')
      ) {
        return;
      }
      console.log(`[BROWSER]: ${text}`);
    });
    page.on('pageerror', err => console.error(`[BROWSER ERROR]: ${err}`));
    page.on('response', async resp => {
      if (resp.status() >= 400 && resp.url().includes('/api')) {
        const body = await resp.text().catch(() => 'no-body');
        console.log(`[API ERROR ${resp.status()}]: ${resp.url()} - ${body}`);
      }
    });
  });

  test('should assign member number immediately upon registration (Production Grade)', async ({
    page,
  }) => {
    // 0. Get a valid tenant
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.isActive, true),
    });
    if (!tenant) throw new Error('No active tenant found for test');

    // 1. Register a new member
    const email = `mem-prod-${Date.now()}@example.com`;
    const password = 'Password123!';

    await gotoApp(page, `${routes.register(test.info())}?tenantId=${tenant.id}`, test.info(), {
      marker: 'auth-ready',
    });

    await page.fill('input[name="fullName"]', 'Test ProdMember');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="confirmPassword"]', password);

    // Robust terms handling
    const termsButton = page.locator('button[role="checkbox"]');
    if ((await termsButton.getAttribute('aria-checked')) !== 'true') {
      await termsButton.click();
    }

    // 2. Submit & Wait for Server Response (Primary Signal)
    console.log('Clicking submit & waiting for API response...');
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('sign-up') && resp.status() === 200
    );

    // We also watch for potential redirects, but don't strictly require them to happen *instantly* vs the DB check
    const redirectPromise = page.waitForURL(/\/member/, { timeout: 15000 }).catch(() => 'timeout');

    await page.click('button[type="submit"]');

    const response = await responsePromise;
    console.log(`Registration API Success: ${response.status()} ${response.url()}`);

    // Wait for redirect or timeout (just for UI state, doesn't fail test hard yet)
    await redirectPromise;

    // Capture state if visual redirect failed (but API worked)
    if (page.url().includes('/register')) {
      console.log('WARN: Page is still on /register, taking screenshot...');
      await page.screenshot({ path: 'registration-ui-state.png' });
    }

    // 3. Verify DB State (The Real Truth)
    const member = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    if (!member) {
      throw new Error(`User ${email} NOT found in DB after successful API call`);
    }

    console.log('DB Assertion: Checking Role...');
    expect(member.role).toBe('member');

    console.log('DB Assertion: Checking Member Number presence...');
    expect(member.memberNumber).not.toBeNull();
    expect(member.memberNumberIssuedAt).not.toBeNull();
    expect(member.memberNumber).toMatch(/^MEM-\d{4}-\d{6}$/);

    console.log(`Verified Member Number: ${member.memberNumber}`);

    // Year Check
    const effectiveDate = member.createdAt;
    const expectedYear = effectiveDate.getFullYear();
    const actualYear = parseInt(member.memberNumber!.split('-')[1]);

    console.log(`DB Assertion: Year Derivation (${expectedYear}) vs Actual (${actualYear})`);
    expect(actualYear).toBe(expectedYear);

    // 4. Immutability Check (Relogin)
    console.log('Immutability Check: Re-logging in...');
    await page.context().clearCookies();
    await gotoApp(page, routes.login(test.info()), test.info(), { marker: 'auth-ready' });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/member/);

    const memberAfterLogin = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    expect(memberAfterLogin?.memberNumber).toBe(member.memberNumber);
    console.log('Immutability Verified: Member number unchanged after login.');
  });

  test('should self-heal missing member number on login with correct year', async ({ page }) => {
    // 0. Get a valid tenant
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.isActive, true),
    });
    if (!tenant) throw new Error('No active tenant found for test');

    // 1. Seed a user created in previous year without member number
    const lastYear = new Date().getFullYear() - 1;
    const pastDate = new Date(`${lastYear}-06-15T12:00:00Z`); // Specific date in past year
    const email = `heal-${Date.now()}@example.com`;
    const password = 'Password123!';

    // Register normally first
    await gotoApp(page, `${routes.register(test.info())}?tenantId=${tenant.id}`, test.info(), {
      marker: 'auth-ready',
    });
    await page.fill('input[name="fullName"]', 'Heal Member');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="confirmPassword"]', password);

    // Robustly handle terms checkbox
    const termsButton = page.locator('button[role="checkbox"]');
    const isChecked2 = (await termsButton.getAttribute('aria-checked')) === 'true';
    if (!isChecked2) {
      await termsButton.click();
    }

    console.log('Clicking submit...');
    await page.click('button[type="submit"]');

    try {
      await page.waitForURL(/\/member|\/dashboard/, { timeout: 60000 });
    } catch (e) {
      const errorText = await page
        .locator('.text-red-500')
        .textContent()
        .catch(() => null);
      if (errorText) throw new Error(`Registration (Setup) failed: ${errorText}`);
      throw e;
    }

    // Simulating "broken state": remove memberNumber and backdate createdAt
    await db
      .update(user)
      .set({
        memberNumber: null,
        memberNumberIssuedAt: null,
        createdAt: pastDate,
      })
      .where(eq(user.email, email));

    // Logout
    await page.context().clearCookies();
    await gotoApp(page, routes.login(test.info()), test.info(), { marker: 'auth-ready' });

    // 2. Login again to trigger self-heal
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/member|\/dashboard/);

    // 3. Verify self-heal worked and respected the creation year
    const healedMember = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    expect(healedMember?.memberNumber).toMatch(new RegExp(`^MEM-${lastYear}-\\d{6}$`));
    console.log(
      `Verified self-heal: ${healedMember?.memberNumber} for user created in ${lastYear}`
    );
  });
});
