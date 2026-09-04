// prettier-ignore
import { account, db, E2E_PASSWORD, eq, session as authSession, user } from '@interdomestik/database';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import en from '../../src/messages/en/dashboard.json';
import mk from '../../src/messages/mk/dashboard.json';
import sq from '../../src/messages/sq/dashboard.json';
import sr from '../../src/messages/sr/dashboard.json';

const C = { de: sq, en, hr: sq, mk, sq, sr };

test.describe('Empty portal', () => {
  test('settles empty portal', async ({ page }, testInfo) => {
    const tenantId = testInfo.project.name.includes('mk') ? 'tenant_mk' : 'tenant_ks';
    const fixtureId = `t117b-empty-${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.retry}-${randomUUID()}`;
    const email = `${fixtureId}@example.com`;
    const origin = new URL(String(testInfo.project.use.baseURL)).origin;
    let userId: string | null = null;

    try {
      // prettier-ignore
      const signup = await page.request.post(`${origin}/api/auth/sign-up/email`, { data: { email, name: 'T117B empty', onboarding: { mode: 'resolved', tenant: tenantId }, password: E2E_PASSWORD }, headers: { Origin: origin, Referer: `${origin}/register` } });
      if (!signup.ok()) throw new Error(`T117B empty signup failed: ${await signup.text()}`);
      userId = ((await signup.json()).user as { id: string }).id;
      await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

      const regions = page.getByTestId('member-dashboard-ready').locator('section[aria-label]');
      const copy = C[routes.getLocale(testInfo)].dashboard.portal;
      const navigation = page.getByTestId('member-dashboard-ready').getByRole('navigation');
      const membership = `${routes.member(testInfo)}/membership`;
      await expect(navigation.locator('a')).toHaveCount(4);

      await expect(regions.nth(0).getByRole('status')).toBeVisible();
      await expect(regions.nth(0).getByRole('status')).toHaveAccessibleName(
        copy.regions.case.label
      );
      await expect(regions.nth(0).getByRole('article')).toHaveCount(0);
      await expect(regions.nth(1).getByRole('link')).toHaveAttribute('href', membership);
      await expect(navigation.locator('a').nth(3)).toHaveAttribute('href', membership);
      await expect(regions.nth(2).getByRole('status')).toBeVisible();
      await expect(regions.nth(2).getByRole('listitem')).toHaveCount(0);
    } finally {
      // prettier-ignore
      userId ??= (await db.query.user.findFirst({ columns: { id: true }, where: eq(user.email, email) }))?.id ?? null;
      if (userId) {
        await db.delete(authSession).where(eq(authSession.userId, userId));
        await db.delete(account).where(eq(account.userId, userId));
        await db.delete(user).where(eq(user.id, userId));
      }
    }
  });
});
