import { expect, test } from '../fixtures/auth.fixture';
import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Members List (Gate)', () => {
  test('API login works for all agent accounts without UI', async ({ page }) => {
    const accounts = [
      { email: E2E_USERS.KS_AGENT.email, origin: 'http://ks.127.0.0.1.nip.io:3000', locale: 'sq' },
      {
        email: E2E_USERS.KS_AGENT_LITE.email,
        origin: 'http://ks.127.0.0.1.nip.io:3000',
        locale: 'sq',
      },
      { email: E2E_USERS.MK_AGENT.email, origin: 'http://mk.127.0.0.1.nip.io:3000', locale: 'mk' },
      {
        email: E2E_USERS.MK_AGENT_PRO.email,
        origin: 'http://mk.127.0.0.1.nip.io:3000',
        locale: 'mk',
      },
    ];

    for (const account of accounts) {
      const loginURL = `${account.origin}/api/auth/sign-in/email`;
      const res = await page.request.post(loginURL, {
        data: { email: account.email, password: E2E_PASSWORD },
        headers: {
          Origin: account.origin,
          Referer: `${account.origin}/${account.locale}/login`,
          'x-forwarded-host': new URL(account.origin).host,
          'x-forwarded-proto': new URL(account.origin).protocol.replace(':', ''),
          'x-forwarded-for': '10.0.0.13',
        },
      });
      expect(res.ok(), `API login failed for ${account.email}`).toBeTruthy();
    }

    expect(page.url()).not.toContain('/login');
  });
  test('Agent Pro sees exactly their assigned members (Isolation)', async ({
    page,
    loginAs,
  }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    const tenant = isMK ? 'mk' : 'ks';

    // 1. Login as Pro Agent
    await loginAs('agent_pro');

    // 2. Navigate to Members using strict navigation helper (Pro)
    await gotoApp(page, '/agent/workspace/members', testInfo, {
      marker: 'agent-members-pro-ready',
    });

    // 3. Verify Isolation based on Tenant
    if (tenant === 'ks') {
      // KS Agent should see exactly 2 members
      const rows = page.locator('[data-testid^="agent-member-row-"]');
      await expect(rows).toHaveCount(2);

      await expect(page.getByTestId('agent-member-row-golden_ks_a_member_1')).toBeVisible();
      await expect(page.getByTestId('agent-member-row-golden_ks_a_member_2')).toBeVisible();

      // Should NOT see MK members
      await expect(page.getByTestId('agent-member-row-golden_mk_member_1')).not.toBeVisible();
    } else {
      // MK Agent should see exactly 1 member
      const rows = page.locator('[data-testid^="agent-member-row-"]');
      await expect(rows).toHaveCount(1);

      await expect(page.getByTestId('agent-member-row-golden_mk_member_2')).toBeVisible();

      // Should NOT see KS members
      await expect(page.getByTestId('agent-member-row-golden_ks_a_member_1')).not.toBeVisible();
    }
  });

  test('Agent Lite sees assigned members', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    const tenant = isMK ? 'mk' : 'ks';

    await loginAs('agent_lite');
    await gotoApp(page, '/agent/members', testInfo, {
      marker: 'agent-members-lite-ready',
    });

    if (tenant === 'ks') {
      await expect(page.getByTestId('agent-member-row-golden_ks_a_member_3')).toBeVisible();
      await expect(page.getByTestId('agent-member-row-golden_ks_a_member_1')).not.toBeVisible();
      await expect(page.getByTestId('agent-member-row-golden_mk_member_1')).not.toBeVisible();
    } else {
      await expect(page.getByTestId('agent-member-row-golden_mk_member_1')).toBeVisible();
      await expect(page.getByTestId('agent-member-row-golden_ks_a_member_1')).not.toBeVisible();
    }
  });

  test('Agent Lite cannot access Pro members page', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    if (!isMK) return;

    await loginAs('agent_lite');
    await gotoApp(page, '/agent/workspace/members', testInfo, {
      marker: 'agent-pro-required',
    });

    await expect(page.getByTestId('agent-pro-required')).toBeVisible();
  });

  test('Agent Lite cannot access Pro members page (KS Lite)', async ({
    page,
    loginAs,
  }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    if (isMK) return;

    await loginAs('agent_lite');
    await gotoApp(page, '/agent/workspace/members', testInfo, {
      marker: 'agent-pro-required',
    });

    await expect(page.getByTestId('agent-pro-required')).toBeVisible();
  });

  test('Agent Pro can access Pro members page (MK Pro)', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    if (!isMK) return;

    await loginAs('agent_pro');
    await gotoApp(page, '/agent/workspace/members', testInfo, {
      marker: 'agent-members-pro-ready',
    });

    await expect(page.getByTestId('agent-members-pro-ready')).toBeVisible();
  });

  test('Agent Pro search filters members', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    // Only run search test on KS where we have multiple members to filter
    if (isMK) return;

    await loginAs('agent_pro');
    await gotoApp(page, '/agent/workspace/members', testInfo, {
      marker: 'agent-members-pro-ready',
    });

    // Search for Member 1
    const searchInput = page.getByTestId('agent-members-search-input');
    await searchInput.fill('Member 1');

    // Wait for debounce and reload
    await expect(page.getByTestId('agent-member-row-golden_ks_a_member_2')).not.toBeVisible();
    await expect(page.getByTestId('agent-member-row-golden_ks_a_member_1')).toBeVisible();
  });

  test('Navigation from dashboard tile to members page', async ({ page, loginAs }, testInfo) => {
    // 1. Login as Agent
    await loginAs('agent_lite');

    // 2. Go to home
    await gotoApp(page, '/agent', testInfo, { marker: 'agent-home' });

    // 3. Verify the tile link targets the lite members route
    const tileHref = await page.getByTestId('agent-tile-my-members').getAttribute('href');
    expect(tileHref, 'Expected members tile href').toContain('/agent/members');

    // 4. Navigate via strict helper and assert ready (Lite)
    await gotoApp(page, tileHref || '/agent/members', testInfo, {
      marker: 'agent-members-lite-ready',
    });
  });

  test('SQ Leads page has correct localized heading', async ({ page, loginAs }, testInfo) => {
    // This test is only relevant for SQ locale
    if (!testInfo.project.name.includes('sq')) return;

    await loginAs('agent_lite');
    await gotoApp(page, '/agent/leads', testInfo, { marker: 'agent-leads-lite' });

    // Check heading
    const heading = page.getByTestId('agent-leads-title');
    await expect(heading).toHaveText('Anëtarët potencial');
  });

  test('Agent can open leads page without portal error', async ({ page, loginAs }, testInfo) => {
    await loginAs('agent_lite');
    await gotoApp(page, '/agent/leads', testInfo, { marker: 'agent-leads-lite' });

    await expect(page.getByTestId('agent-leads-lite')).toBeVisible();
    await expect(page.getByTestId('agent-portal-error')).toHaveCount(0);
  });

  test('Agent can navigate to member profile', async ({ page, loginAs }, testInfo) => {
    const isMK = testInfo.project.name.includes('mk');
    const memberId = isMK ? 'golden_mk_member_1' : 'golden_ks_a_member_3';
    const membersPath = '/agent/members';
    const membersMarker = 'agent-members-lite-ready';

    await loginAs('agent_lite');
    await gotoApp(page, membersPath, testInfo, { marker: membersMarker });

    // Verify the profile link points to the correct member
    const profileHref = await page.getByTestId(`view-profile-${memberId}`).getAttribute('href');
    expect(profileHref, 'Expected profile link href').toContain(`/agent/clients/${memberId}`);

    // Navigate via strict helper and assert profile
    await gotoApp(page, profileHref || `/agent/clients/${memberId}`, testInfo, {
      marker: 'agent-client-profile-page',
    });
    await expect(page.getByTestId('agent-portal-error')).toHaveCount(0);
  });
});
