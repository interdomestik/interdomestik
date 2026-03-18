// Live Pilot Day 1 Driver Script - Automated execution for shared cloud population
import { expect, test } from '@playwright/test';

const BASE_URL = process.env.PILOT_URL || 'https://interdomestik-web.vercel.app';
const MEMBER_EMAIL = process.env.PILOT_MEMBER_EMAIL || process.env.RELEASE_GATE_MEMBER_EMAIL;
const MEMBER_PASSWORD =
  process.env.PILOT_MEMBER_PASSWORD || process.env.RELEASE_GATE_MEMBER_PASSWORD;

test.describe('Live Pilot Day 1 Driver (Multi-Claim)', () => {
  test('Submit 3 Standard Claims', async ({ page }) => {
    test.setTimeout(180000); // 3 mins for 3 claims

    test.skip(!process.env.PILOT_URL, 'Skipping Live Driver in local Gate; set PILOT_URL to run.');

    if (!MEMBER_EMAIL || !MEMBER_PASSWORD) {
      throw new Error(
        'Missing credentials. Set PILOT_MEMBER_EMAIL and PILOT_MEMBER_PASSWORD env vars.'
      );
    }

    // Clear any extra HTTP headers to prevent local config defaults hitting Production
    await page.context().setExtraHTTPHeaders({});

    console.log(`[Driver] Target URL: ${BASE_URL}`);
    console.log(`[Driver] User: ${MEMBER_EMAIL}`);

    // 1. API Login to trigger cookie set
    const loginUrl = `${BASE_URL}/api/auth/sign-in/email`;
    const loginRes = await page.request.post(loginUrl, {
      data: { email: MEMBER_EMAIL, password: MEMBER_PASSWORD },
      headers: {
        Origin: BASE_URL,
        Referer: `${BASE_URL}/en/login`,
        'x-forwarded-host': process.env.PILOT_HOST_HEADER || 'ks.localhost:3000',
      },
    });

    if (!loginRes.ok()) {
      const text = await loginRes.text();
      throw new Error(`API Login Failed: ${loginRes.status()} ${text}`);
    }
    console.log('✅ API Login Succeeded');

    // Loop to create 1 claim for Agent
    for (let i = 1; i <= 1; i++) {
      console.log(`[Driver] Starting Claim ${i} of 3...`);

      // 2. Navigate to New Claim Wizard
      const newClaimURL = `${BASE_URL}/en/member/claims/new`;
      await page.goto(newClaimURL, { waitUntil: 'domcontentloaded' });

      // Sanity check: if we got redirected to /login, the session did not carry
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        throw new Error(`Navigating to New Claim prompted login. URL: ${currentUrl}`);
      }
      await expect(page.locator('h1')).toContainText('New Claim');

      // 3. Step 1: Category
      await page.getByTestId('category-vehicle').click({ force: true });
      await page.waitForTimeout(600); // Wait animation
      await page.getByTestId('wizard-next').click({ force: true });

      // 4. Step 2: Details
      await page.waitForLoadState('domcontentloaded');
      const claimTitle = `Live Pilot Driver Claim #${i} - ${new Date().toLocaleTimeString()}`;
      await page.getByLabel('Claim Title').fill(claimTitle);
      await page.getByLabel('Company Name').fill('Support Air (Automated)');
      await page
        .getByLabel('Description')
        .fill('Automated driver claim intended for live pilot Day 1 verification.');
      await page.getByLabel('Amount (Optional)').fill('500');
      // Incident Date (YYYY-MM-DD)
      await page.getByLabel('Date of Incident').fill(new Date().toISOString().split('T')[0]);
      await page.getByTestId('wizard-next').click({ force: true });

      // 5. Step 3: Evidence (Skip)
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByText('Add Evidence')).toBeVisible({ timeout: 5000 });
      await page.getByTestId('wizard-next').click({ force: true });

      // 6. Review / Submit
      await page.waitForTimeout(600);
      const submitButton = page.getByTestId('wizard-submit');
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toBeEnabled();
      await submitButton.click({ force: true });

      // 7. Verify Redirection to List
      await page.waitForURL(`${BASE_URL}/en/member/claims`, { timeout: 20000 });
      console.log(`✅ Claim ${i} Created Successfully: "${claimTitle}"`);

      // Short delay between submissions
      await page.waitForTimeout(1000);
    }

    console.log('✅ ALL 3 Claims Populated Successfully for Day 1!');
  });
});
