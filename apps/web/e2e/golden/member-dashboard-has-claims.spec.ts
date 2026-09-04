import { E2E_PASSWORD } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Portal with cases', () => {
  test('keeps safe Case and Updates projections', async ({ page }, testInfo) => {
    const isMk = testInfo.project.name.includes('mk');
    const email = isMk ? 'member.mk.1@interdomestik.com' : 'member.tracking.ks@interdomestik.com';
    const origin = new URL(String(testInfo.project.use.baseURL)).origin;
    const login = await page.request.post(`${origin}/api/auth/sign-in/email`, {
      data: { email, password: E2E_PASSWORD },
      headers: { Origin: origin, Referer: `${origin}/login` },
    });
    expect(login.ok(), await login.text()).toBe(true);
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

    const portal = page.getByTestId('dashboard-page-ready').getByTestId('member-dashboard-ready');
    const regions = portal.locator('section[aria-label]');
    const articles = regions.nth(0).getByRole('article');
    const updates = regions.nth(2).getByRole('listitem');
    const expected = isMk ? 2 : 3;
    // prettier-ignore
    const raw = [email, ...(isMk ? ['Rear ended in Skopje (Baseline)', 'MK Deterministic Claim', 'Test Insurer', 'MK Auto Osiguruvanje', '500.00', '300.00'] : ['Aksident i lehtë – Demo Tracking', 'Vonesë në shqyrtim – SLA Demo', 'E përfunduar – Demo', 'KS Insurance Co', '250.00', '120.00', '90.00'])];

    await expect(articles).toHaveCount(expected);
    await expect(updates).toHaveCount(expected);
    // prettier-ignore
    const references = isMk ? ['CLM-MK-2026-000001', 'CLM-MK-2026-900001'] : ['CLM-XK-2026-800001'];
    for (const reference of references) await expect(portal).toContainText(reference);
    await expect(regions.nth(0)).not.toContainText(/property|other|vehicle|accident|generic/i);
    for (const region of [regions.nth(0), regions.nth(2)])
      for (const rawValue of raw) await expect(region).not.toContainText(rawValue);
    for (let index = 0; index < expected; index += 1) {
      await expect(articles.nth(index).locator('dt')).toHaveCount(3);
      await expect(articles.nth(index).locator('dd').nth(1)).toHaveText(/^\d+$/);
    }
    await expect(portal.getByRole('navigation').locator('a')).toHaveCount(4);
  });
});
