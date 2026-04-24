import { test } from '@playwright/test';

const STAFF_EMAIL = process.env.PILOT_STAFF_EMAIL || process.env.RELEASE_GATE_STAFF_EMAIL;
const STAFF_PASSWORD = process.env.PILOT_STAFF_PASSWORD || process.env.RELEASE_GATE_STAFF_PASSWORD;
const LOGIN_LOCALE = 'en';
const STAFF_LOCALE = 'sq';

function localizedUrl(baseUrl: string, locale: string, pathname: string): string {
  return `${baseUrl}/${locale}${pathname}`;
}

test('Verify Production Claims on Staff Dashboard', async ({ page }, testInfo) => {
  test.setTimeout(60000);

  test.skip(
    !process.env.PILOT_URL,
    'Skipping Live production check on local Gate; set PILOT_URL to run.'
  );

  test.skip(!STAFF_EMAIL || !STAFF_PASSWORD, 'Missing staff credentials for live verification.');

  const BASE_URL = process.env.PILOT_URL || 'https://interdomestik-web.vercel.app';
  const URL = localizedUrl(BASE_URL, STAFF_LOCALE, '/staff/claims');
  console.log('[Verify] Attempting API Login...');

  const loginUrl = `${BASE_URL}/api/auth/sign-in/email`;
  const loginRes = await page.request.post(loginUrl, {
    data: { email: STAFF_EMAIL, password: STAFF_PASSWORD },
    headers: {
      Origin: BASE_URL,
      Referer: localizedUrl(BASE_URL, LOGIN_LOCALE, '/login'),
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
  const screenshot = await page.screenshot({
    fullPage: true,
  });
  await testInfo.attach('dashboard-verify', {
    body: screenshot,
    contentType: 'image/png',
  });
  console.log('✅ Screenshot attached to test output');

  // 3. Print list text for verification
  const rows = await page.locator('table tr, .claims-list-item, [role="row"]').allTextContents();
  console.log('[Verify] Rows Found:', rows.length);
  for (const row of rows.slice(0, 10)) {
    console.log(` - ${row.replaceAll(/\s+/g, ' ').trim()}`);
  }
});
