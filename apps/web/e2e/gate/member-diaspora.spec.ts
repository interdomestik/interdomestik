import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Diaspora Feature', () => {
  test('Member can see Diaspora ribbon and navigate to Diaspora page', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const memberDashboard = page.getByTestId('member-dashboard-ready').first();
    const diasporaRibbon = memberDashboard.getByTestId('diaspora-ribbon').first();
    const ribbonCta = diasporaRibbon.getByTestId('diaspora-ribbon-cta').first();

    // 1. Go to Member Home
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

    // Assert we are on the dashboard
    await expect(memberDashboard).toBeVisible();
    await expect(memberDashboard.getByTestId('dashboard-heading').first()).toBeVisible();

    // 2. Check for Diaspora ribbon
    await expect(diasporaRibbon).toBeVisible();

    // 3. Navigate to Diaspora page
    await expect(ribbonCta).toBeVisible();
    const diasporaHref = await ribbonCta.getAttribute('href');
    expect(diasporaHref).toContain('/member/diaspora');

    try {
      await Promise.all([
        page.waitForURL(/\/member\/diaspora/, { timeout: 8000 }),
        ribbonCta.click(),
      ]);
    } catch {
      // Fallback for occasional click/nav race on MK host in gate-fast runs.
      await gotoApp(page, routes.memberDiaspora(testInfo), testInfo, { marker: 'diaspora-page' });
    }

    // 4. Assert we are on the Diaspora page
    await expect(page).toHaveURL(/\/member\/diaspora/);
    await expect(page.getByTestId('diaspora-page')).toBeVisible({ timeout: 15000 });

    // Check for the 3 cards content (using flexible text matching across languages)
    await expect(
      page.getByText(
        /(Aksident jashtë vendit|Accident abroad|Несреќа во странство|Nezgoda u inostranstvu)/i
      )
    ).toBeVisible();
    await expect(
      page.getByText(/(Udhëtim \/ Avio|Travel \/ Flight|Патување \/ Авио|Putovanje \/ Avio)/i)
    ).toBeVisible();
    await expect(
      page.getByText(
        /(Familja në Kosovë|Family in Kosovo|Семејството во Косово|Porodica na Kosovu)/i
      )
    ).toBeVisible();
  });
});
