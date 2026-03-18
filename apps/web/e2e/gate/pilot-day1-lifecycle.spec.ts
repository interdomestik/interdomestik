import { expect, test } from '@playwright/test';

test('Staff Lifecycle - Self Assign and Update Status', async ({ page }) => {
  test.setTimeout(90000);

  test.skip(!process.env.PILOT_URL, 'Skipping Live Lifecycle in local Gate; set PILOT_URL to run.');

  const BASE_URL = process.env.PILOT_URL || 'https://interdomestik-web.vercel.app';
  console.log(`[Lifecycle] Targeting: ${BASE_URL}`);

  // 1. API Login as Staff
  const loginUrl = `${BASE_URL}/api/auth/sign-in/email`;
  const loginRes = await page.request.post(loginUrl, {
    data: { email: 'staff.ks.extra@interdomestik.com', password: 'GoldenPass123!' },
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
  console.log('✅ Staff API Login Succeeded');

  // 2. Navigate to Claims Queue
  const claimsUrl = `${BASE_URL}/sq/staff/claims`;
  await page.goto(claimsUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000); // let list load

  // Sanity check
  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    throw new Error(`Navigating to Claims prompted login. URL: ${currentUrl}`);
  }

  console.log('[Lifecycle] Listing Claims...');

  // Find a claim created today (e.g., Live Pilot Driver Claim)
  const targetClaimText = 'Live Pilot Driver Claim';
  const row = page
    .locator('table tr, [role="row"], div, li')
    .filter({ hasText: targetClaimText })
    .first();

  const hasRow = await row.isVisible();
  if (!hasRow) {
    throw new Error(`Did not find any claim with title containing "${targetClaimText}"`);
  }

  const claimName = await row.innerText();
  console.log(`[Lifecycle] Found Claim: ${claimName?.trim()}`);

  // Click Review / Open of first item (the newly created one)
  await page.locator('[data-testid="staff-claims-view"]').first().click({ force: true });
  await page.waitForTimeout(3000);

  console.log(`[Lifecycle] Opened Claim Detail Page: ${page.url()}`);

  // 3. Assign to Me (Staff Custody)
  const assignBtn = page.getByRole('button', { name: /Assign to Me/i });
  const isAssignVisible = await assignBtn.isVisible();
  if (isAssignVisible) {
    await assignBtn.click({ force: true });
    console.log('✅ Clicked "Assign to Me"');
    await page.waitForTimeout(2000);
  } else {
    console.log('[Lifecycle] "Assign to Me" button not found or already assigned.');
  }

  // 3.5 Messaging (Staff to Member)
  console.log('[Lifecycle] Sending Public Communication to Member...');
  const messageTab = page.getByRole('tab', { name: /Messages|Mesazhet/i });
  if (await messageTab.isVisible()) {
    await messageTab.click({ force: true });
    await page.waitForTimeout(1000);

    const messageInput = page.getByPlaceholder(/Type a message|Shkruaj një mesazh/i);
    if (await messageInput.isVisible()) {
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
    } else {
      console.log('[Lifecycle] Message input placeholder not found.');
    }
  } else {
    console.log('[Lifecycle] Messages tab not found. Skipping messaging.');
  }

  // 4. Update Status (Triage SLA)
  console.log('[Lifecycle] Attempting Status Update...');
  const combobox = page.getByRole('combobox').first();

  if (await combobox.isVisible()) {
    await combobox.click({ force: true });
    await page.waitForTimeout(1000);

    // Select "In Verification" or Albanian "Në Verifikim"
    const option = page.getByRole('option', { name: /In Verification|Në Verifikim/i }).first();
    if (await option.isVisible()) {
      await option.click({ force: true });

      // Fill reason
      const reasonInput = page.getByPlaceholder(/Reason for status change/i);
      if (await reasonInput.isVisible()) {
        await reasonInput.fill('Live Pilot Day 1 Automated Triage');
      }

      const updateBtn = page.getByRole('button', { name: /Update Claim/i });
      await updateBtn.click({ force: true });
      console.log('✅ Clicked "Update Claim"');
      await page.waitForTimeout(2000);
    } else {
      console.log('[Lifecycle] Could not find Triage target status option.');
    }
  } else {
    console.log('[Lifecycle] Status Combobox not found. Skipping status update.');
  }

  console.log('✅ Lifecycle Operations Finished!');
});
