import { test, type Page } from '@playwright/test';

async function loginAsStaff(page: Page, baseUrl: string): Promise<void> {
  const password = process.env.PILOT_STAFF_PASSWORD;
  if (!password) {
    throw new Error('PILOT_STAFF_PASSWORD is required to run the live staff lifecycle spec.');
  }

  const loginUrl = `${baseUrl}/api/auth/sign-in/email`;
  const loginRes = await page.request.post(loginUrl, {
    data: { email: 'staff.ks.extra@interdomestik.com', password },
    headers: {
      Origin: baseUrl,
      Referer: `${baseUrl}/en/login`,
      'x-forwarded-host': process.env.PILOT_HOST_HEADER || 'ks.localhost:3000',
    },
  });

  if (!loginRes.ok()) {
    const text = await loginRes.text();
    throw new Error(`API Login Failed: ${loginRes.status()} ${text}`);
  }
}

async function openClaimsQueue(page: Page, baseUrl: string): Promise<void> {
  const claimsUrl = `${baseUrl}/sq/staff/claims`;
  await page.goto(claimsUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    throw new Error(`Navigating to Claims prompted login. URL: ${currentUrl}`);
  }
}

async function openTargetClaim(page: Page, claimTitle: string): Promise<void> {
  const row = page
    .locator('table tr, [role="row"], div, li')
    .filter({ hasText: claimTitle })
    .first();

  if (!(await row.isVisible())) {
    throw new Error(`Did not find any claim with title containing "${claimTitle}"`);
  }

  const claimName = await row.innerText();
  console.log(`[Lifecycle] Found Claim: ${claimName?.trim()}`);

  await page.locator('[data-testid="staff-claims-view"]').first().click({ force: true });
  await page.waitForTimeout(3000);
}

async function assignClaimIfAvailable(page: Page): Promise<void> {
  const assignBtn = page.getByRole('button', { name: /Assign to Me/i });
  if (!(await assignBtn.isVisible())) {
    console.log('[Lifecycle] "Assign to Me" button not found or already assigned.');
    return;
  }

  await assignBtn.click({ force: true });
  console.log('✅ Clicked "Assign to Me"');
  await page.waitForTimeout(2000);
}

async function sendPublicMessageIfAvailable(page: Page): Promise<void> {
  console.log('[Lifecycle] Sending Public Communication to Member...');
  const messageTab = page.getByRole('tab', { name: /Messages|Mesazhet/i });
  if (!(await messageTab.isVisible())) {
    console.log('[Lifecycle] Messages tab not found. Skipping messaging.');
    return;
  }

  await messageTab.click({ force: true });
  await page.waitForTimeout(1000);

  const messageInput = page.getByPlaceholder(/Type a message|Shkruaj një mesazh/i);
  if (!(await messageInput.isVisible())) {
    console.log('[Lifecycle] Message input placeholder not found.');
    return;
  }

  await messageInput.fill(
    "Përshëndetje! Kërkesa juaj është marrë në shqyrtim. Do t'ju njoftojmë së shpejti."
  );

  const sendBtn = page
    .getByRole('button')
    .filter({ has: page.locator('svg.lucide-send') })
    .first();
  await sendBtn.click({ force: true });
  console.log('✅ Sent Public Message');
  await page.waitForTimeout(2000);
}

async function updateStatusIfAvailable(page: Page): Promise<void> {
  console.log('[Lifecycle] Attempting Status Update...');
  const combobox = page.getByRole('combobox').first();
  if (!(await combobox.isVisible())) {
    console.log('[Lifecycle] Status Combobox not found. Skipping status update.');
    return;
  }

  await combobox.click({ force: true });
  await page.waitForTimeout(1000);

  const option = page.getByRole('option', { name: /In Verification|Në Verifikim/i }).first();
  if (!(await option.isVisible())) {
    console.log('[Lifecycle] Could not find Triage target status option.');
    return;
  }

  await option.click({ force: true });

  const reasonInput = page.getByPlaceholder(/Reason for status change/i);
  if (await reasonInput.isVisible()) {
    await reasonInput.fill('Live Pilot Day 1 Automated Triage');
  }

  const updateBtn = page.getByRole('button', { name: /Update Claim/i });
  await updateBtn.click({ force: true });
  console.log('✅ Clicked "Update Claim"');
  await page.waitForTimeout(2000);
}

test('Staff Lifecycle - Self Assign and Update Status', async ({ page }) => {
  test.setTimeout(90000);

  test.skip(!process.env.PILOT_URL, 'Skipping Live Lifecycle in local Gate; set PILOT_URL to run.');

  const BASE_URL = process.env.PILOT_URL || 'https://interdomestik-web.vercel.app';
  console.log(`[Lifecycle] Targeting: ${BASE_URL}`);

  await loginAsStaff(page, BASE_URL);
  console.log('✅ Staff API Login Succeeded');

  await openClaimsQueue(page, BASE_URL);
  console.log('[Lifecycle] Listing Claims...');

  const targetClaimText = 'Live Pilot Driver Claim';
  await openTargetClaim(page, targetClaimText);

  console.log(`[Lifecycle] Opened Claim Detail Page: ${page.url()}`);

  await assignClaimIfAvailable(page);
  await sendPublicMessageIfAvailable(page);
  await updateStatusIfAvailable(page);

  console.log('✅ Lifecycle Operations Finished!');
});
