import { expect, test } from '@playwright/test';

test('Verify Production Claims on Staff Dashboard', async ({ page }) => {
  test.setTimeout(60000);

  test.skip(
    !process.env.PILOT_URL,
    'Skipping Live production check on local Gate; set PILOT_URL to run.'
  );

  const BASE_URL = process.env.PILOT_URL || 'https://interdomestik-web.vercel.app';
  const URL = `${BASE_URL}/sq/staff/claims`;
  console.log('[Verify] Attempting API Login...');

  const loginUrl = `${BASE_URL}/api/auth/sign-in/email`;
  const loginRes = await page.request.post(loginUrl, {
    data: { email: 'staff.ks.extra@interdomestik.com', password: 'GoldenPass123!' },
    headers: {
      Origin: BASE_URL,
      Referer: `${BASE_URL}/en/login`,
      'x-forwarded-host': 'ks.interdomestik.com',
    },
  });

  if (!loginRes.ok()) {
    const text = await loginRes.text();
    throw new Error(`API Login Failed: ${loginRes.status()} ${text}`);
  }
  console.log('✅ API Login Succeeded');

  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  console.log(`[Verify] Logged In. URL is: ${page.url()}`);

  // 2. Wait for list and take screenshot
  await page.waitForTimeout(4000); // let list load
  await page.screenshot({
    path: '/Users/arbenlila/.gemini/antigravity/brain/594ad325-e11c-4758-bb69-94bc2f8c0e1c/dashboard_verify.png',
    fullPage: true,
  });
  console.log('✅ Screenshot saved to dashboard_verify.png');

  // 3. Print list text for verification
  const rows = await page.locator('table tr, .claims-list-item, [role="row"]').allTextContents();
  console.log('[Verify] Rows Found:', rows.length);
  for (const row of rows.slice(0, 10)) {
    console.log(` - ${row.replace(/\s+/g, ' ').trim()}`);
  }
});
